import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPairingsPoller,
  MAX_BACKOFF_MS,
  POLL_MS,
  type PollerEnv,
  pairingsSignature,
} from "./pairings-live";

describe("pairingsSignature", () => {
  it("is the same for the same publish and different for the next one", () => {
    const a = pairingsSignature({ at: "2026-11-12T06:00:00Z", version: 3 });
    expect(a).toBe(pairingsSignature({ at: "2026-11-12T06:00:00Z", version: 3 }));
    expect(a).not.toBe(pairingsSignature({ at: "2026-11-12T06:10:00Z", version: 4 }));
    expect(a).not.toBe(pairingsSignature({ at: "2026-11-12T06:10:00Z", version: 3 }));
  });

  it("reads a publish with no version number, and nothing published", () => {
    expect(pairingsSignature({ at: "2026-11-12T06:00:00Z" })).toBe("v-@2026-11-12T06:00:00Z");
    expect(pairingsSignature({ at: "2026-11-12T06:00:00Z", version: null })).toBe(
      "v-@2026-11-12T06:00:00Z",
    );
    expect(pairingsSignature(null)).toBe("none");
    expect(pairingsSignature(undefined)).toBe("none");
  });
});

/** A browser the test can drive: visibility, connectivity and the wake events. */
function fakeEnv() {
  const state = { visible: true, online: true };
  const listeners = new Set<(reason: "visible" | "online") => void>();
  const env: PollerEnv = {
    isVisible: () => state.visible,
    isOnline: () => state.online,
    onWake: (wake) => {
      listeners.add(wake);
      return () => listeners.delete(wake);
    },
    now: () => Date.now(),
  };
  return {
    env,
    state,
    listeners,
    wake: (reason: "visible" | "online") => {
      for (const listener of [...listeners]) listener(reason);
    },
  };
}

/** No jitter: random() = 0.5 makes the factor exactly 1. */
const steady = () => 0.5;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(over: { remote?: () => Promise<string>; rendered?: () => string } = {}) {
  const browser = fakeEnv();
  const fetchSignature = vi.fn(over.remote ?? (() => Promise.resolve("v1@a")));
  const onChange = vi.fn();
  const poller = createPairingsPoller({
    rendered: over.rendered ?? (() => "v1@a"),
    fetchSignature,
    onChange,
    env: browser.env,
    random: steady,
  });
  return { browser, fetchSignature, onChange, poller };
}

describe("polling", () => {
  it("does not ask at once, and asks every 30 seconds after", async () => {
    const { fetchSignature, poller } = setup();
    expect(fetchSignature).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(POLL_MS - 1);
    expect(fetchSignature).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSignature).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchSignature).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("reloads the page only when the published version is not the one on screen", async () => {
    const same = setup();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(same.onChange).not.toHaveBeenCalled();
    same.poller.stop();

    const newer = setup({ remote: () => Promise.resolve("v2@b") });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(newer.onChange).toHaveBeenCalledTimes(1);
    expect(newer.onChange).toHaveBeenCalledWith("v2@b");
    newer.poller.stop();
  });

  it("reads the signature on screen at check time, so a page that caught up is left alone", async () => {
    let shown = "v1@a";
    const { onChange, poller } = setup({
      remote: () => Promise.resolve("v2@b"),
      rendered: () => shown,
    });
    shown = "v2@b"; // the page already reloaded for another reason
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onChange).not.toHaveBeenCalled();
    poller.stop();
  });

  it("does not ask for the same new version again while the page is catching up", async () => {
    const { onChange, poller } = setup({ remote: () => Promise.resolve("v2@b") });
    await vi.advanceTimersByTimeAsync(POLL_MS); // first ask, reload requested
    await vi.advanceTimersByTimeAsync(POLL_MS); // 30s later the page still shows the old one
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    const afterTwo = onChange.mock.calls.length;
    // The page was given 20s; by the second ask it may retry once, but never in a tight loop.
    expect(afterTwo).toBeLessThanOrEqual(2);
    poller.stop();
  });

  it("never runs two checks at once", async () => {
    let release: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => {
      release = resolve;
    });
    const { fetchSignature, browser, poller } = setup({ remote: () => slow });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchSignature).toHaveBeenCalledTimes(1);
    browser.wake("visible"); // a wake during a slow request
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSignature).toHaveBeenCalledTimes(1);
    release("v1@a");
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
  });
});

describe("a failing connection", () => {
  it("backs off 30s, 60s, 120s, 240s and stops at five minutes", async () => {
    const { fetchSignature, poller } = setup({ remote: () => Promise.reject(new Error("down")) });
    const asks: number[] = [];
    let last = Date.now();
    for (let i = 0; i < 8; i += 1) {
      const before = fetchSignature.mock.calls.length;
      // Walk forward in 1s steps until the next ask, so the gap is measured, not assumed.
      while (fetchSignature.mock.calls.length === before) {
        await vi.advanceTimersByTimeAsync(1_000);
      }
      asks.push(Date.now() - last);
      last = Date.now();
    }
    expect(asks.slice(0, 5)).toEqual([30_000, 60_000, 120_000, 240_000, MAX_BACKOFF_MS]);
    expect(Math.max(...asks)).toBe(MAX_BACKOFF_MS);
    poller.stop();
  });

  it("goes back to 30 seconds after one success", async () => {
    let fail = true;
    const { fetchSignature, poller } = setup({
      remote: () => (fail ? Promise.reject(new Error("down")) : Promise.resolve("v1@a")),
    });
    await vi.advanceTimersByTimeAsync(POLL_MS); // fails, next in 60s
    await vi.advanceTimersByTimeAsync(60_000); // fails, next in 120s
    fail = false;
    await vi.advanceTimersByTimeAsync(120_000); // succeeds
    const afterSuccess = fetchSignature.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchSignature.mock.calls.length).toBe(afterSuccess + 1);
    poller.stop();
  });

  it("does not reload the page for a failed check", async () => {
    const { onChange, poller } = setup({ remote: () => Promise.reject(new Error("down")) });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(onChange).not.toHaveBeenCalled();
    poller.stop();
  });

  it("forgets the backoff when the connection comes back", async () => {
    const { fetchSignature, browser, poller } = setup({
      remote: () => Promise.reject(new Error("down")),
    });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(60_000);
    const before = fetchSignature.mock.calls.length;
    browser.wake("online");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSignature.mock.calls.length).toBe(before + 1);
    poller.stop();
  });
});

describe("a hidden or offline page", () => {
  it("does not ask while the tab is hidden, and asks as soon as it is shown", async () => {
    const { fetchSignature, browser, poller } = setup({ remote: () => Promise.resolve("v2@b") });
    browser.state.visible = false;
    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(fetchSignature).not.toHaveBeenCalled();
    browser.state.visible = true;
    browser.wake("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSignature).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("does not ask while offline", async () => {
    const { fetchSignature, browser, poller } = setup();
    browser.state.online = false;
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(fetchSignature).not.toHaveBeenCalled();
    browser.state.online = true;
    browser.wake("online");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSignature).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("does not turn a flickering tab into a request per flicker", async () => {
    const { fetchSignature, browser, poller } = setup();
    await vi.advanceTimersByTimeAsync(POLL_MS); // one scheduled ask
    const before = fetchSignature.mock.calls.length;
    for (let i = 0; i < 5; i += 1) {
      browser.wake("visible");
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(fetchSignature.mock.calls.length).toBe(before);
    poller.stop();
  });
});

describe("stopping", () => {
  it("leaves no timer, no listener and no request behind", async () => {
    let seenSignal: AbortSignal | undefined;
    const { browser, onChange, poller } = setup({ remote: () => Promise.resolve("v2@b") });
    expect(browser.listeners.size).toBe(1);
    poller.stop();
    expect(browser.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(onChange).not.toHaveBeenCalled();
    void seenSignal;
  });

  it("aborts a request in flight and ignores its answer", async () => {
    let signal: AbortSignal | undefined;
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const browser = fakeEnv();
    const onChange = vi.fn();
    const poller = createPairingsPoller({
      rendered: () => "v1@a",
      fetchSignature: (s) => {
        signal = s;
        return pending;
      },
      onChange,
      env: browser.env,
      random: steady,
    });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(signal?.aborted).toBe(false);
    poller.stop();
    expect(signal?.aborted).toBe(true);
    release("v2@b"); // a late answer must not reload a page the reader has left
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stays stopped when woken afterwards", async () => {
    const { fetchSignature, browser, poller } = setup();
    poller.stop();
    browser.wake("visible");
    await poller.checkNow();
    expect(fetchSignature).not.toHaveBeenCalled();
  });
});

describe("jitter", () => {
  it("spreads the asks between 80% and 120% of the interval", async () => {
    const lowEnv = fakeEnv();
    const fetchLow = vi.fn(() => Promise.resolve("v1@a"));
    const low = createPairingsPoller({
      rendered: () => "v1@a",
      fetchSignature: fetchLow,
      onChange: vi.fn(),
      env: lowEnv.env,
      random: () => 0,
    });
    await vi.advanceTimersByTimeAsync(POLL_MS * 0.8 - 1);
    expect(fetchLow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchLow).toHaveBeenCalledTimes(1);
    low.stop();

    const highEnv = fakeEnv();
    const fetchHigh = vi.fn(() => Promise.resolve("v1@a"));
    const high = createPairingsPoller({
      rendered: () => "v1@a",
      fetchSignature: fetchHigh,
      onChange: vi.fn(),
      env: highEnv.env,
      random: () => 1,
    });
    await vi.advanceTimersByTimeAsync(POLL_MS * 1.2 - 1);
    expect(fetchHigh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchHigh).toHaveBeenCalledTimes(1);
    high.stop();
  });
});
