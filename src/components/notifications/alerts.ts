/**
 * The alerts model behind the bell.
 *
 * Two sources, merged:
 *
 * 1. **Live draw issues** from `validateDraw`. These are derived state: no read/unread, and they
 *    disappear the moment the problem is fixed. The Draw screen's Issues panel shows the same list,
 *    so the badge and the panel can never disagree.
 * 2. **Stored notifications** from `sync_notifications`, which cover what the draw validator cannot
 *    see: entries needing review, and the cut-off approaching.
 *
 * Decisions taken here, and why:
 *
 * - **The bell is a pointer, not the single source of truth.** Draw rules stay in `validateDraw`;
 *   they are not copied into SQL. Two sources of truth would eventually disagree.
 * - **The badge counts UNRESOLVED blocking and warning items, whatever their read state.** Marking
 *   something read must never hide a problem that still stops publishing. Read state only quiets
 *   INFO items, which is what "Dismiss notices" is for.
 * - **Blocking means the same thing everywhere: it stops publishing.** The vocabulary is
 *   Blocking / Warning / Info, the same three words the Issues panel uses.
 * - **De-duplicated.** A stored `unplaced` notification and a live `unplaced-*` issue are the same
 *   problem. The live one wins, because it clears itself; showing both would double-count the badge
 *   and give the desk two rows for one thing.
 */
import type { Issue, Severity } from "@/lib/draw/validate";

export type AlertSeverity = "blocking" | "warning" | "info";

export interface Alert {
  /** Stable across renders, so React keys and de-duplication agree. */
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string | null;
  /** Where the problem is solved. */
  href: string;
  /** Only meaningful for info alerts; never lowers the badge for blocking or warning. */
  read: boolean;
}

/** A stored notification, as the loader returns it. */
export interface StoredNotification {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string | null;
  read: boolean;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { blocking: 0, warning: 1, info: 2 };

const toSeverity = (severity: Severity): AlertSeverity =>
  severity === "blocking" ? "blocking" : severity === "warning" ? "warning" : "info";

/**
 * Where a stored notification kind is solved. A kind with no entry here still shows, pointing at
 * the draw, rather than being hidden because nobody wrote a link for it.
 */
export const FIX_HREF: Record<string, string> = {
  unplaced: "/draw",
  needs_review: "/players?status=needs_review",
  group_over_capacity: "/draw",
  group_under_minimum: "/draw",
  cutoff_soon: "/setup#rules",
};

export const fixHref = (kind: string): string => FIX_HREF[kind] ?? "/draw";

/**
 * Which live issue prefix means the same thing as a stored kind. The live issue wins when both are
 * present: see the de-duplication note at the top of this file.
 */
const LIVE_EQUIVALENT: Record<string, string> = {
  unplaced: "unplaced-",
  group_over_capacity: "cap-",
  group_under_minimum: "small-",
};

/** The live issues that duplicate a stored kind, so the stored row can be dropped. */
export function duplicatedKinds(issues: Issue[]): Set<string> {
  const duplicated = new Set<string>();
  for (const [kind, prefix] of Object.entries(LIVE_EQUIVALENT)) {
    if (issues.some((issue) => issue.id.startsWith(prefix))) duplicated.add(kind);
  }
  return duplicated;
}

/** The live draw issues as alerts. */
export function alertsFromIssues(issues: Issue[]): Alert[] {
  return issues.map((issue) => ({
    id: `draw:${issue.id}`,
    severity: toSeverity(issue.severity),
    title: issue.message,
    detail: issue.group ? `Group ${issue.group}` : null,
    href: "/draw",
    // Derived state has no read flag, and inventing one would let a real problem be hidden.
    read: false,
  }));
}

/** The stored notifications as alerts, minus any the live issues already cover. */
export function alertsFromStored(stored: StoredNotification[], issues: Issue[]): Alert[] {
  const duplicated = duplicatedKinds(issues);
  return stored
    .filter((notification) => !duplicated.has(notification.kind))
    .map((notification) => ({
      id: `stored:${notification.id}`,
      severity: notification.severity,
      title: notification.title,
      detail: notification.detail,
      href: fixHref(notification.kind),
      read: notification.read,
    }));
}

/** Both sources as one list, blocking first so the worst is at the top. */
export function buildAlerts(stored: StoredNotification[], issues: Issue[]): Alert[] {
  return [...alertsFromIssues(issues), ...alertsFromStored(stored, issues)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/**
 * The badge. Blocking and warning count whether or not they have been read; info counts only while
 * unread. This is the rule that stops "dismiss" from hiding a problem that stops publishing.
 */
export function badgeCount(alerts: Alert[]): number {
  return alerts.filter((alert) => alert.severity !== "info" || !alert.read).length;
}

/** The number a "Dismiss notices" action would actually quiet, so the copy can say it. */
export function dismissableCount(alerts: Alert[]): number {
  return alerts.filter((alert) => alert.severity === "info" && !alert.read).length;
}

export interface AlertGroup {
  severity: AlertSeverity;
  heading: string;
  alerts: Alert[];
}

const HEADINGS: Record<AlertSeverity, string> = {
  blocking: "Blocking",
  warning: "Warning",
  info: "Info",
};

/** Grouped for display, in severity order, with empty groups left out. */
export function groupAlerts(alerts: Alert[]): AlertGroup[] {
  const order: AlertSeverity[] = ["blocking", "warning", "info"];
  return order
    .map((severity) => ({
      severity,
      heading: HEADINGS[severity],
      alerts: alerts.filter((alert) => alert.severity === severity),
    }))
    .filter((group) => group.alerts.length > 0);
}

/** The bell's accessible name. Plain words, and honest when there is nothing to do. */
export function bellLabel(count: number): string {
  if (count === 0) return "Alerts, all clear";
  return `Alerts, ${count} need${count === 1 ? "s" : ""} attention`;
}

/** Where the stored check stands. `idle` only happens in demo mode, where there is nothing to check. */
export type AlertCheckState = "idle" | "checking" | "ready" | "error";

/** The desk states the bell may run a stored check in. Matches the store's status field. */
type DeskStatus = "demo" | "loading" | "ready" | "error";

/**
 * Whether a stored check may run yet.
 *
 * In demo mode there is nothing to check. With Supabase configured the check must wait for the desk
 * to finish loading: before that the working event is still the demo one, and sending its fake id to
 * `sync_notifications` is a failed call on every page load (found by the live browser pass on
 * 18 Oct 2026, "invalid input syntax for type uuid: bamboo-tee-2026").
 */
export function shouldCheckAlerts(connected: boolean, deskStatus: DeskStatus): boolean {
  return !connected || deskStatus === "ready";
}

/**
 * Whether the panel may say "All clear".
 *
 * A failed or still-running check is not the same thing as a clean one. Saying all clear while
 * the stored alerts could not be read would tell the desk there is nothing to do when nobody
 * knows; the panel shows the error instead, and keeps the last good list underneath it.
 */
export function showsAllClear(check: AlertCheckState, count: number): boolean {
  if (count !== 0) return false;
  return check === "ready" || check === "idle";
}
