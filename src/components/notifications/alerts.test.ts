import { describe, expect, it } from "vitest";
import type { Issue } from "@/lib/draw/validate";
import {
  alertsFromIssues,
  alertsFromStored,
  badgeCount,
  bellLabel,
  buildAlerts,
  dismissableCount,
  duplicatedKinds,
  fixHref,
  groupAlerts,
  registrationAlerts,
  type StoredNotification,
  shouldCheckAlerts,
  showsAllClear,
} from "./alerts";

const issue = (id: string, severity: Issue["severity"], message = "message"): Issue => ({
  id,
  severity,
  message,
});

const stored = (
  kind: string,
  severity: StoredNotification["severity"],
  read = false,
  id = kind,
): StoredNotification => ({
  id,
  kind,
  severity,
  title: `stored ${kind}`,
  detail: null,
  read,
});

describe("badge count (decision B)", () => {
  it("counts unresolved blocking and warning items", () => {
    const alerts = buildAlerts([stored("needs_review", "warning")], [issue("cap-1", "blocking")]);
    expect(badgeCount(alerts)).toBe(2);
  });

  it("never lets read state lower the badge for a blocking or warning item", () => {
    const alerts = buildAlerts(
      [stored("needs_review", "warning", true), stored("cutoff_soon", "info", true)],
      [issue("cap-1", "blocking", "over capacity")],
    );
    // The warning was read and the info was read; the blocking item still counts.
    expect(badgeCount(alerts)).toBe(2);
  });

  it("quiets an info item once it is read", () => {
    expect(badgeCount(buildAlerts([stored("cutoff_soon", "info", false)], []))).toBe(1);
    expect(badgeCount(buildAlerts([stored("cutoff_soon", "info", true)], []))).toBe(0);
  });

  it("counts only what dismiss would actually quiet", () => {
    const alerts = buildAlerts(
      [stored("cutoff_soon", "info", false), stored("needs_review", "warning")],
      [issue("cap-1", "blocking")],
    );
    expect(dismissableCount(alerts)).toBe(1);
  });
});

describe("de-duplication between stored alerts and live issues", () => {
  it("drops a stored alert the live validator already covers", () => {
    const alerts = buildAlerts(
      [stored("unplaced", "blocking")],
      [issue("unplaced-p1", "blocking")],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.id).toBe("draw:unplaced-p1");
  });

  it("maps each stored kind to its live prefix", () => {
    expect(duplicatedKinds([issue("unplaced-p1", "blocking")])).toEqual(new Set(["unplaced"]));
    expect(duplicatedKinds([issue("cap-3", "blocking")])).toEqual(new Set(["group_over_capacity"]));
    expect(duplicatedKinds([issue("small-2", "warning")])).toEqual(
      new Set(["group_under_minimum"]),
    );
    expect(duplicatedKinds([issue("dup-p1", "blocking")])).toEqual(new Set());
  });

  it("keeps a stored alert the validator cannot see", () => {
    const alerts = buildAlerts([stored("needs_review", "warning")], [issue("cap-3", "blocking")]);
    expect(alerts.map((a) => a.id).sort()).toEqual(["draw:cap-3", "stored:needs_review"]);
  });

  it("does not drop the live issue, only the duplicate", () => {
    const live = alertsFromIssues([issue("unplaced-p1", "blocking")]);
    expect(live).toHaveLength(1);
    expect(
      alertsFromStored([stored("unplaced", "blocking")], [issue("unplaced-p1", "blocking")]),
    ).toHaveLength(0);
  });

  it("drops one stored row even when the validator has several issues of that kind", () => {
    const alerts = buildAlerts(
      [stored("unplaced", "blocking")],
      [issue("unplaced-p1", "blocking"), issue("unplaced-p2", "blocking")],
    );
    expect(alerts.map((a) => a.id).sort()).toEqual(["draw:unplaced-p1", "draw:unplaced-p2"]);
  });

  it("never returns two rows with the same id, so React keys and the badge cannot double-count", () => {
    const alerts = buildAlerts(
      [
        stored("needs_review", "warning"),
        stored("cutoff_soon", "info"),
        stored("group_over_capacity", "blocking"),
      ],
      [issue("dup-p1", "blocking"), issue("cap-1", "blocking")],
    );
    const ids = alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("draw:cap-1");
    expect(ids).not.toContain("stored:group_over_capacity");
  });
});

describe("fix links (decision 3)", () => {
  it("routes each kind to where it is solved", () => {
    expect(fixHref("unplaced")).toBe("/draw");
    expect(fixHref("group_over_capacity")).toBe("/draw");
    expect(fixHref("group_under_minimum")).toBe("/draw");
    expect(fixHref("needs_review")).toBe("/players?status=needs_review");
    expect(fixHref("cutoff_soon")).toBe("/setup#rules");
  });

  it("falls back to the draw rather than hiding an unknown kind", () => {
    expect(fixHref("something_new")).toBe("/draw");
  });

  it("points every live draw issue at the draw", () => {
    expect(alertsFromIssues([issue("cap-1", "blocking")])[0]?.href).toBe("/draw");
  });
});

describe("ordering and grouping", () => {
  it("puts blocking first so the worst is at the top", () => {
    const alerts = buildAlerts(
      [stored("cutoff_soon", "info"), stored("needs_review", "warning")],
      [issue("cap-1", "blocking")],
    );
    expect(alerts.map((a) => a.severity)).toEqual(["blocking", "warning", "info"]);
  });

  it("groups by severity and leaves empty groups out", () => {
    const groups = groupAlerts(buildAlerts([stored("needs_review", "warning")], []));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.heading).toBe("Warning");
  });

  it("uses the same three words as the Issues panel", () => {
    const alerts = buildAlerts(
      [stored("cutoff_soon", "info"), stored("needs_review", "warning")],
      [issue("cap-1", "blocking")],
    );
    expect(groupAlerts(alerts).map((g) => g.heading)).toEqual(["Blocking", "Warning", "Info"]);
  });
});

describe("the bell's accessible name", () => {
  it("says all clear when there is nothing to do", () => {
    expect(bellLabel(0)).toBe("Alerts, all clear");
  });

  it("says how many need attention", () => {
    expect(bellLabel(1)).toBe("Alerts, 1 needs attention");
    expect(bellLabel(3)).toBe("Alerts, 3 need attention");
  });
});

describe("all clear is only shown when it is known to be true", () => {
  it("shows all clear after a successful check finds nothing", () => {
    expect(showsAllClear("ready", 0)).toBe(true);
  });

  it("shows all clear in demo mode, where there is no stored check to fail", () => {
    expect(showsAllClear("idle", 0)).toBe(true);
  });

  it("never shows all clear while a check is still running", () => {
    expect(showsAllClear("checking", 0)).toBe(false);
  });

  it("never shows all clear when the check failed, even with an empty list", () => {
    expect(showsAllClear("error", 0)).toBe(false);
  });

  it("does not show all clear when there is anything outstanding", () => {
    expect(showsAllClear("ready", 1)).toBe(false);
    expect(showsAllClear("error", 2)).toBe(false);
  });
});

describe("when the stored check may run", () => {
  it("runs in demo mode, where there is nothing stored to check", () => {
    expect(shouldCheckAlerts(false, "demo")).toBe(true);
    expect(shouldCheckAlerts(false, "loading")).toBe(true);
  });

  it("waits while a connected desk is loading, so the demo event id is never sent", () => {
    expect(shouldCheckAlerts(true, "loading")).toBe(false);
    expect(shouldCheckAlerts(true, "demo")).toBe(false);
  });

  it("runs once the connected desk is ready", () => {
    expect(shouldCheckAlerts(true, "ready")).toBe(true);
  });

  it("never runs when the desk failed to load", () => {
    expect(shouldCheckAlerts(true, "error")).toBe(false);
  });
});

describe("new entries at the desk", () => {
  const entry = (entryId: string, playerId: string, status = "needs_review") => ({
    entryId,
    playerId,
    status,
  });
  const nameOf = (playerId: string) =>
    ({ p1: "Ana Cruz", p2: "Ben Reyes" })[playerId as "p1" | "p2"] ?? null;

  it("creates one warning per entry waiting at the desk, named after the player", () => {
    const alerts = registrationAlerts([entry("r1", "p1"), entry("r2", "p2")], nameOf);
    expect(alerts.map((alert) => alert.title)).toEqual([
      "New entry: Ana Cruz",
      "New entry: Ben Reyes",
    ]);
    expect(alerts.every((alert) => alert.severity === "warning")).toBe(true);
    expect(alerts.every((alert) => alert.href === "/register")).toBe(true);
  });

  it("clears itself when the entry leaves review, because confirming is the acknowledgement", () => {
    expect(registrationAlerts([entry("r1", "p1", "confirmed")], nameOf)).toHaveLength(0);
    expect(registrationAlerts([entry("r1", "p1", "rejected")], nameOf)).toHaveLength(0);
  });

  it("counts each entry in the badge, so two new players read as two", () => {
    const alerts = buildAlerts(
      [],
      [],
      registrationAlerts([entry("r1", "p1"), entry("r2", "p2")], nameOf),
    );
    expect(badgeCount(alerts)).toBe(2);
  });

  it("still names the entry when the player record is missing, rather than hiding it", () => {
    expect(registrationAlerts([entry("r1", "ghost")], nameOf)[0]?.title).toBe(
      "New entry: a player",
    );
  });

  it("replaces the stored needs_review summary with the individual entries", () => {
    const alerts = buildAlerts(
      [stored("needs_review", "warning")],
      [],
      registrationAlerts([entry("r1", "p1")], nameOf),
    );
    expect(alerts.map((alert) => alert.id)).toEqual(["registration_new:r1"]);
  });

  it("keeps the stored summary when no per-entry alert can be built", () => {
    expect(buildAlerts([stored("needs_review", "warning")], []).map((a) => a.id)).toEqual([
      "stored:needs_review",
    ]);
  });

  it("routes a stored registration alert to the desk as well", () => {
    expect(fixHref("registration_new")).toBe("/register");
  });
});
