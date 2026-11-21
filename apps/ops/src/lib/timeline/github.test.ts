import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FetchLike,
  GITHUB_CACHE_MS,
  GITHUB_DEFAULT_REPO,
  GITHUB_ERROR_MESSAGE,
  GITHUB_UNCONFIGURED_MESSAGE,
  loadGithubFeed,
  parseMilestones,
  parseReleases,
  resetGithubCache,
} from "./github";

function json(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  resetGithubCache();
  vi.unstubAllEnvs();
});

describe("parseMilestones", () => {
  it("keeps a milestone with a due date", () => {
    expect(
      parseMilestones([
        {
          number: 1,
          title: "v1.0.0",
          due_on: "2026-12-15T00:00:00Z",
          state: "open",
          html_url: "https://github.com/o/r/milestone/1",
        },
      ]),
    ).toEqual([
      {
        number: 1,
        title: "v1.0.0",
        dueOn: "2026-12-15",
        state: "open",
        url: "https://github.com/o/r/milestone/1",
      },
    ]);
  });

  it("drops a milestone with no due date, no title, no link or an unknown state", () => {
    const base = {
      number: 2,
      title: "Target",
      due_on: "2026-12-15T00:00:00Z",
      state: "open",
      html_url: "https://github.com/o/r/milestone/2",
    };

    expect(parseMilestones([{ ...base, due_on: null }])).toEqual([]);
    expect(parseMilestones([{ ...base, title: "  " }])).toEqual([]);
    expect(parseMilestones([{ ...base, html_url: "" }])).toEqual([]);
    expect(parseMilestones([{ ...base, state: "paused" }])).toEqual([]);
    expect(parseMilestones([{ ...base, number: "2" }])).toEqual([]);
    expect(parseMilestones("not a list")).toEqual([]);
  });

  it("sorts by due date, then by number", () => {
    const rows = [
      { number: 3, title: "C", due_on: "2027-01-01", state: "open", html_url: "u3" },
      { number: 2, title: "B", due_on: "2026-12-01", state: "open", html_url: "u2" },
      { number: 1, title: "A", due_on: "2026-12-01", state: "open", html_url: "u1" },
    ];
    expect(parseMilestones(rows).map((row) => row.number)).toEqual([1, 2, 3]);
  });
});

describe("parseReleases", () => {
  const published = {
    tag_name: "v0.63.0",
    name: "0.63.0",
    published_at: "2026-11-21T10:00:00Z",
    html_url: "https://github.com/o/r/releases/v0.63.0",
    draft: false,
    prerelease: false,
  };

  it("keeps a published release", () => {
    expect(parseReleases([published])).toEqual([
      {
        tag: "v0.63.0",
        name: "0.63.0",
        publishedOn: "2026-11-21",
        url: "https://github.com/o/r/releases/v0.63.0",
        prerelease: false,
      },
    ]);
  });

  it("leaves out a draft, and anything without a tag, a day or a link", () => {
    expect(parseReleases([{ ...published, draft: true }])).toEqual([]);
    expect(parseReleases([{ ...published, tag_name: "" }])).toEqual([]);
    expect(parseReleases([{ ...published, published_at: null }])).toEqual([]);
    expect(parseReleases([{ ...published, html_url: "" }])).toEqual([]);
  });

  it("marks a pre-release and sorts by day", () => {
    const releases = parseReleases([
      { ...published, tag_name: "v1.0.0-rc.1", published_at: "2026-12-01", prerelease: true },
      published,
    ]);
    expect(releases.map((release) => release.tag)).toEqual(["v0.63.0", "v1.0.0-rc.1"]);
    expect(releases[1]?.prerelease).toBe(true);
  });
});

describe("loadGithubFeed", () => {
  it("says nothing is connected when there is no token", async () => {
    const fetcher = vi.fn<FetchLike>();
    const feed = await loadGithubFeed({ token: "", fetcher });

    expect(feed).toEqual({ status: "unconfigured", message: GITHUB_UNCONFIGURED_MESSAGE });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads both lists with the token and the default repository", async () => {
    const fetcher = vi.fn<FetchLike>(async (url) => {
      if (url.includes("/milestones")) {
        return json([
          { number: 1, title: "v1.0.0", due_on: "2026-12-15", state: "open", html_url: "m1" },
        ]);
      }
      return json([
        {
          tag_name: "v0.63.0",
          name: "0.63.0",
          published_at: "2026-11-21T10:00:00Z",
          html_url: "r1",
          draft: false,
          prerelease: false,
        },
      ]);
    });

    const feed = await loadGithubFeed({ token: "secret-token", fetcher, now: 1000 });

    expect(feed.status).toBe("ok");
    if (feed.status !== "ok") return;
    expect(feed.milestones).toHaveLength(1);
    expect(feed.releases[0]?.tag).toBe("v0.63.0");

    const urls = fetcher.mock.calls.map((call) => call[0]);
    expect(urls[0]).toContain(GITHUB_DEFAULT_REPO);
    expect(urls[0]).toContain("/milestones?state=all");
    expect(urls[1]).toContain("/releases");

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-token" });
    expect(init?.next).toEqual({ revalidate: GITHUB_CACHE_MS / 1000 });
  });

  it("caches a good read for ten minutes and then reads again", async () => {
    const fetcher = vi.fn<FetchLike>(async () => json([]));

    await loadGithubFeed({ token: "t", fetcher, now: 1000 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await loadGithubFeed({ token: "t", fetcher, now: 1000 + GITHUB_CACHE_MS - 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await loadGithubFeed({ token: "t", fetcher, now: 1000 + GITHUB_CACHE_MS });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("reports a quiet error and does not cache it", async () => {
    const failing = vi.fn<FetchLike>(async () => json({ message: "boom" }, false, 500));

    const first = await loadGithubFeed({ token: "t", fetcher: failing, now: 1000 });
    expect(first).toEqual({ status: "error", message: GITHUB_ERROR_MESSAGE });

    const second = await loadGithubFeed({ token: "t", fetcher: failing, now: 1001 });
    expect(second.status).toBe("error");
    expect(failing).toHaveBeenCalledTimes(4);
  });

  it("reports a quiet error when the request throws", async () => {
    const throwing = vi.fn<FetchLike>(async () => {
      throw new Error("network down");
    });
    const feed = await loadGithubFeed({ token: "t", fetcher: throwing, now: 1000 });
    expect(feed).toEqual({ status: "error", message: GITHUB_ERROR_MESSAGE });
  });

  it("refuses a repository name that is not owner/name", async () => {
    const fetcher = vi.fn<FetchLike>();
    const feed = await loadGithubFeed({ token: "t", repo: "not-a-repo", fetcher, now: 1000 });
    expect(feed).toEqual({ status: "error", message: GITHUB_ERROR_MESSAGE });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never puts the token in the message", async () => {
    const throwing = vi.fn<FetchLike>(async () => {
      throw new Error("failed with token secret-token");
    });
    const feed = await loadGithubFeed({ token: "secret-token", fetcher: throwing, now: 1 });
    expect(JSON.stringify(feed)).not.toContain("secret-token");
  });
});
