import type { Issue } from "./validate";

/**
 * The draw's checks, folded into the few causes behind them.
 *
 * `validateDraw` reports one line per player or group, which is right for jumping to the exact
 * spot but wrong as a to-do list: a field that was never frozen produces one identical line per
 * player. This groups those lines by cause and says what single step clears them.
 *
 * Pure: it only reads the issues. Nothing here changes the draw.
 */
export type CauseKind = "refreeze" | "flights" | "mixed-tees" | "small" | "other";

export type CauseAction = "refreeze" | "redraw" | null;

export interface IssueCause {
  kind: CauseKind;
  /** How many lines of the original list this cause covers. */
  count: number;
  title: string;
  /** One plain sentence on why it matters and what clears it. */
  detail: string;
  /** The single step that clears it, when there is one. */
  action: CauseAction;
  /** The ids of the issues folded into this cause, so the list can still show them on request. */
  issueIds: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const kindOf = (issue: Issue): CauseKind => {
  if (issue.id.startsWith("flag-") && /re-?freeze/i.test(issue.message)) return "refreeze";
  if (issue.id.startsWith("flight-")) return "flights";
  if (issue.id.startsWith("cats-")) return "mixed-tees";
  if (issue.id.startsWith("small-")) return "small";
  return "other";
};

/**
 * Folds the issues into causes, biggest first. Blocking issues are never folded: each one stays
 * its own line because each needs its own fix. The same applies to anything unrecognised.
 */
export function summariseIssues(issues: Issue[]): IssueCause[] {
  const buckets = new Map<CauseKind, Issue[]>();
  for (const issue of issues) {
    if (issue.severity === "blocking") continue;
    const kind = kindOf(issue);
    if (kind === "other") continue;
    buckets.set(kind, [...(buckets.get(kind) ?? []), issue]);
  }

  const causes: IssueCause[] = [];
  const refreeze = buckets.get("refreeze");
  if (refreshable(refreeze)) {
    causes.push({
      kind: "refreeze",
      count: refreeze.length,
      title: `${plural(refreeze.length, "player")} need their handicap index frozen`,
      detail:
        "Their frozen index is not the latest record for the cut-off. Freeze them again, then redraw so classes follow the new indexes.",
      action: "refreeze",
      issueIds: refreeze.map((i) => i.id),
    });
  }
  const flights = buckets.get("flights");
  if (flights?.length) {
    causes.push({
      kind: "flights",
      count: flights.length,
      title: `${plural(flights.length, "group")} ${flights.length === 1 ? "no longer matches" : "no longer match"} the players' classes`,
      detail:
        "The saved draw was made from different indexes than the ones now on file. Redraw to regroup by class.",
      action: "redraw",
      issueIds: flights.map((i) => i.id),
    });
  }
  const tees = buckets.get("mixed-tees");
  if (tees?.length) {
    causes.push({
      kind: "mixed-tees",
      count: tees.length,
      title: `${plural(tees.length, "group")} mix tees`,
      detail: "Players in these groups start from different tees. Allowed, but look before you publish.",
      action: null,
      issueIds: tees.map((i) => i.id),
    });
  }
  const small = buckets.get("small");
  if (small?.length) {
    causes.push({
      kind: "small",
      count: small.length,
      title: `${plural(small.length, "group")} below the minimum size`,
      detail: "Move a player in or merge the group. Allowed, but check before you publish.",
      action: null,
      issueIds: small.map((i) => i.id),
    });
  }
  return causes.sort((a, b) => b.count - a.count);
}

function refreshable(list: Issue[] | undefined): list is Issue[] {
  return !!list && list.length > 0;
}
