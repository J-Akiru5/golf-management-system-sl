import { describe, expect, it } from "vitest";
import {
  DOC_PERSISTENCE,
  describeStatus,
  docProviderOptions,
  MAX_RECONNECT_ATTEMPTS,
  presenceUsers,
  statusTone,
  USER_COLORS,
  userColor,
} from "./collab";

describe("userColor", () => {
  it("is deterministic for the same id", () => {
    expect(userColor("demo-user")).toBe(userColor("demo-user"));
    expect(userColor("11111111-1111-4111-8111-111111111111")).toBe(
      userColor("11111111-1111-4111-8111-111111111111"),
    );
  });

  it("always returns a colour from the palette", () => {
    for (const id of ["a", "bb", "mara-santos", "3f0c8e6e-2f5b-4a1e-9d0e-abcdef123456"]) {
      expect(USER_COLORS).toContain(userColor(id));
    }
  });

  it("spreads many ids across the whole palette", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 400; index += 1) seen.add(userColor(`user-${index}`));
    expect(seen.size).toBe(USER_COLORS.length);
  });
});

describe("presenceUsers", () => {
  it("returns named users with their colour, in client id order", () => {
    const states = new Map<number, unknown>([
      [9, { user: { name: "Jun Reyes", color: "#2c5c94" } }],
      [3, { user: { name: "Mara Santos", color: "#2f6b4f" } }],
    ]);
    expect(presenceUsers(states)).toEqual([
      { clientId: 3, name: "Mara Santos", color: "#2f6b4f" },
      { clientId: 9, name: "Jun Reyes", color: "#2c5c94" },
    ]);
  });

  it("drops entries without a usable name and colour", () => {
    const states = new Map<number, unknown>([
      [1, null],
      [2, { user: null }],
      [3, { user: { name: "   ", color: "#000000" } }],
      [4, { user: { name: "No colour" } }],
      [5, { user: { name: "Kept", color: "#2f6b4f" } }],
    ]);
    expect(presenceUsers(states).map((user) => user.name)).toEqual(["Kept"]);
  });

  it("is empty when nobody is present", () => {
    expect(presenceUsers(new Map())).toEqual([]);
  });
});

describe("describeStatus", () => {
  const base = {
    demo: false,
    online: true,
    gaveUp: false,
    status: "connected" as const,
    pending: false,
    hasEdits: false,
  };

  it("says demo, offline and cannot connect before anything else", () => {
    expect(describeStatus({ ...base, demo: true, online: false })).toBe("Demo, not shared");
    expect(describeStatus({ ...base, online: false, gaveUp: true })).toBe("Offline, changes kept");
    expect(describeStatus({ ...base, gaveUp: true, status: "disconnected" })).toBe(
      "Cannot connect",
    );
  });

  it("follows the connection and the pending save", () => {
    expect(describeStatus({ ...base, status: "connecting" })).toBe("Connecting");
    expect(describeStatus({ ...base, status: "disconnected" })).toBe("Reconnecting");
    expect(describeStatus({ ...base, pending: true })).toBe("Saving...");
    expect(describeStatus({ ...base, hasEdits: true })).toBe("Saved");
    expect(describeStatus(base)).toBe("Connected");
  });

  it("gives each state a tone for the dot", () => {
    expect(statusTone({ ...base, demo: true })).toBe("muted");
    expect(statusTone({ ...base, online: false })).toBe("warn");
    expect(statusTone({ ...base, gaveUp: true })).toBe("bad");
    expect(statusTone({ ...base, status: "connecting" })).toBe("muted");
    expect(statusTone({ ...base, status: "disconnected" })).toBe("warn");
    expect(statusTone({ ...base, pending: true })).toBe("busy");
    expect(statusTone(base)).toBe("ok");
  });
});

describe("provider settings", () => {
  it("match the contract in SPEC section 6", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(10);
    expect(DOC_PERSISTENCE).toEqual({
      table: "ws_doc_states",
      roomColumn: "doc_id",
      stateColumn: "state",
      storeTimeout: 2000,
    });
  });

  it("keeps the awareness instance and the persistence target", () => {
    const options = docProviderOptions({ awareness: true });
    expect(options.awareness).toBe(true);
    expect(options.maxReconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);
    expect(options.persistence).toEqual(DOC_PERSISTENCE);
  });
});
