import { describe, expect, it } from "vitest";
import {
  accountStats,
  accountStatus,
  appsForAccount,
  bulkResult,
  cleanReason,
  EMPTY_FILTERS,
  filterAccounts,
  isInactive,
  normaliseApps,
  paginate,
  reasonProblem,
  sortAccounts,
} from "./rules";
import type { GodAccount } from "./types";

const NOW = "2026-11-21T12:00:00.000Z";

function account(overrides: Partial<GodAccount> = {}): GodAccount {
  return {
    userId: "u1",
    email: "ana.reyes@example.test",
    displayName: "Ana Reyes",
    accountCreatedAt: "2026-10-01T00:00:00.000Z",
    lastSignInAt: "2026-11-20T00:00:00.000Z",
    lastActiveAt: "2026-11-20T06:00:00.000Z",
    emailConfirmed: true,
    invitedPending: false,
    banned: false,
    workspaceRole: "member",
    workspaceStatus: "active",
    deskRoles: [],
    tabulator: false,
    playerName: null,
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
    ...overrides,
  };
}

describe("accountStatus", () => {
  it("shows a suspend before every other state", () => {
    expect(accountStatus(account({ suspended: true, banned: true }))).toBe("suspended");
  });

  it("shows a ban before an invite or confirmation state", () => {
    expect(accountStatus(account({ banned: true, invitedPending: true }))).toBe("banned");
  });

  it("tells an unused invite from an unconfirmed account", () => {
    expect(accountStatus(account({ invitedPending: true }))).toBe("invited");
    expect(accountStatus(account({ emailConfirmed: false }))).toBe("unconfirmed");
  });

  it("is active for a confirmed account with nothing else wrong", () => {
    expect(accountStatus(account())).toBe("active");
  });
});

describe("isInactive", () => {
  it("flags an account whose last activity was 30 days or more ago", () => {
    expect(
      isInactive(account({ lastActiveAt: "2026-10-22T11:59:00.000Z", lastSignInAt: null }), NOW),
    ).toBe(true);
    expect(
      isInactive(account({ lastActiveAt: "2026-10-23T13:00:00.000Z", lastSignInAt: null }), NOW),
    ).toBe(false);
  });

  it("uses the sign-in when there is no session time", () => {
    expect(
      isInactive(account({ lastActiveAt: null, lastSignInAt: "2026-10-01T00:00:00.000Z" }), NOW),
    ).toBe(true);
  });

  it("counts from creation for an account that has never signed in", () => {
    expect(
      isInactive(
        account({
          lastActiveAt: null,
          lastSignInAt: null,
          accountCreatedAt: "2026-09-01T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isInactive(
        account({
          lastActiveAt: null,
          lastSignInAt: null,
          accountCreatedAt: "2026-11-01T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("filterAccounts", () => {
  const ana = account({ userId: "ana", displayName: "Ana Reyes", email: "ana@club.test" });
  const ben = account({
    userId: "ben",
    displayName: "Ben Cruz",
    email: "ben@desk.test",
    workspaceRole: null,
    workspaceStatus: null,
    deskRoles: [{ clubId: "c1", clubName: "IGCC", role: "desk" }],
    lastActiveAt: "2026-09-01T00:00:00.000Z",
  });
  const cy = account({
    userId: "cy",
    displayName: "Cy Lim",
    email: "cy@tab.test",
    workspaceRole: null,
    workspaceStatus: null,
    tabulator: true,
  });
  const dee = account({
    userId: "dee",
    displayName: "Dee Santos",
    email: "dee@player.test",
    workspaceRole: null,
    workspaceStatus: null,
    playerName: "Dee Santos",
  });
  const none = account({
    userId: "none",
    displayName: "No Access",
    email: "none@club.test",
    workspaceRole: null,
    workspaceStatus: null,
  });
  const all = [ana, ben, cy, dee, none];

  it("searches a name or an email, ignoring case", () => {
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, search: "BEN" }, NOW).map((a) => a.userId),
    ).toEqual(["ben"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, search: "ana@club" }, NOW).map((a) => a.userId),
    ).toEqual(["ana"]);
  });

  it("filters by app", () => {
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, app: "workspace" }, NOW).map((a) => a.userId),
    ).toEqual(["ana"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, app: "desk" }, NOW).map((a) => a.userId),
    ).toEqual(["ben"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, app: "tabulator" }, NOW).map((a) => a.userId),
    ).toEqual(["cy"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, app: "player" }, NOW).map((a) => a.userId),
    ).toEqual(["dee"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, app: "none" }, NOW).map((a) => a.userId),
    ).toEqual(["none"]);
  });

  it("filters a role across the workspace and the desk", () => {
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, role: "member" }, NOW).map((a) => a.userId),
    ).toEqual(["ana"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, role: "desk" }, NOW).map((a) => a.userId),
    ).toEqual(["ben"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, role: "none" }, NOW).map((a) => a.userId),
    ).toEqual(["dee", "none"]);
  });

  it("filters by status and by inactivity", () => {
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, status: "active" }, NOW).map((a) => a.userId),
    ).toEqual(["ana", "ben", "cy", "dee", "none"]);
    expect(
      filterAccounts(all, { ...EMPTY_FILTERS, inactiveOnly: true }, NOW).map((a) => a.userId),
    ).toEqual(["ben"]);
  });
});

describe("sortAccounts", () => {
  const ana = account({
    userId: "ana",
    displayName: "Ana",
    lastSignInAt: "2026-11-20T00:00:00.000Z",
  });
  const ben = account({ userId: "ben", displayName: "Ben", lastSignInAt: null });
  const cy = account({ userId: "cy", displayName: "Cy", lastSignInAt: "2026-11-01T00:00:00.000Z" });

  it("sorts names both ways", () => {
    expect(sortAccounts([cy, ana, ben], "name", "asc").map((a) => a.userId)).toEqual([
      "ana",
      "ben",
      "cy",
    ]);
    expect(sortAccounts([cy, ana, ben], "name", "desc").map((a) => a.userId)).toEqual([
      "cy",
      "ben",
      "ana",
    ]);
  });

  it("keeps an account with no value last in both directions", () => {
    expect(sortAccounts([ben, ana, cy], "lastSignIn", "asc").map((a) => a.userId)).toEqual([
      "cy",
      "ana",
      "ben",
    ]);
    expect(sortAccounts([ben, ana, cy], "lastSignIn", "desc").map((a) => a.userId)).toEqual([
      "ana",
      "cy",
      "ben",
    ]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 60 }, (_, index) => index);

  it("splits into pages and clamps a page into range", () => {
    expect(paginate(items, 1, 25)).toEqual({
      items: items.slice(0, 25),
      page: 1,
      pageCount: 3,
    });
    expect(paginate(items, 4, 25).page).toBe(3);
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate([], 5, 25)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

describe("accountStats", () => {
  it("counts the five chips without inventing anything", () => {
    const stats = accountStats(
      [
        account({ userId: "a" }),
        account({ userId: "b", suspended: true, lastActiveAt: "2026-09-01T00:00:00.000Z" }),
        account({ userId: "c", invitedPending: true, emailConfirmed: false }),
        account({
          userId: "d",
          workspaceRole: null,
          workspaceStatus: null,
          lastActiveAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
      NOW,
    );

    expect(stats).toEqual({
      total: 4,
      activeStaff: 1,
      suspended: 1,
      invited: 1,
      inactive: 2,
    });
  });
});

describe("appsForAccount", () => {
  it("lists only the access that is active now", () => {
    expect(
      appsForAccount(
        account({
          workspaceRole: "owner",
          workspaceStatus: "suspended",
          deskRoles: [{ clubId: "c1", clubName: "IGCC", role: "desk" }],
          tabulator: true,
        }),
      ),
    ).toEqual(["desk", "tabulator"]);
  });
});

describe("reason validation", () => {
  it("needs five trimmed characters when a reason is required", () => {
    expect(reasonProblem("    ")).not.toBeNull();
    expect(reasonProblem("abcd")).not.toBeNull();
    expect(reasonProblem(" abcde ")).toBeNull();
  });

  it("turns an empty optional reason into null", () => {
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason("  holiday  ")).toBe("holiday");
  });
});

describe("normaliseApps", () => {
  it("keeps the known apps in order, once each", () => {
    expect(normaliseApps(["tabulator", "workspace", "tabulator", "nonsense"])).toEqual([
      "workspace",
      "tabulator",
    ]);
  });
});

describe("bulkResult", () => {
  it("names the counts and keeps the failures", () => {
    expect(bulkResult("Suspended", 3, [])).toEqual({
      ok: true,
      message: "Suspended 3 accounts.",
      succeeded: 3,
      failures: [],
    });

    const partial = bulkResult("Suspended", 3, [
      { userId: "u2", email: "two@example.test", message: "The workspace needs one owner." },
    ]);
    expect(partial.ok).toBe(true);
    expect(partial.succeeded).toBe(2);
    expect(partial.message).toContain("2 of 3");
    expect(partial.failures).toHaveLength(1);
  });

  it("refuses an empty selection", () => {
    expect(bulkResult("Suspended", 0, []).ok).toBe(false);
  });
});
