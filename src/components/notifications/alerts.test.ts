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
  type StoredNotification,
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
