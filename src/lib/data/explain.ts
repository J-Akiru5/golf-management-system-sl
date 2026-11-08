import { fmtHcp, fmtIndex } from "@/lib/format";
import { rawCourseHandicap, type Tee } from "@/lib/routing";
import type {
  DeskRegistration,
  ManualOverride,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "./types";

export interface ExplainStep {
  label: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "info";
}

export interface RoutingExplanation {
  playerId: string;
  steps: ExplainStep[];
}

export interface ExplainArgs {
  tournament: Tournament;
  player: PlayerRecord;
  entry: RegistrationEntry;
  reg: DeskRegistration;
  tees: Tee[];
  /** The group the player sits in on the current board, when a draw exists. */
  group: {
    number: number;
    startHole: number;
    wave: string | null;
    time: string;
    locked: boolean;
  } | null;
  /** The last manual change recorded for this player, if any. */
  override: ManualOverride | null;
  categoryName: string;
  flightName: string;
  teeName: string;
}

const ROLE = { member: "Member entry", guest: "Guest entry" } as const;

/**
 * Why a player landed where they did, in the order the spec's routing flow runs. It reads real
 * values only; a step that has nothing to show says so instead of inventing a number.
 */
export function explainRegistration({
  tournament,
  player,
  entry,
  reg,
  tees,
  group,
  override,
  categoryName,
  flightName,
  teeName,
}: ExplainArgs): RoutingExplanation {
  const steps: ExplainStep[] = [];
  const payment = {
    not_recorded: "payment not recorded",
    pending: "payment pending (recorded by hand)",
    recorded_paid: "payment recorded as paid (by hand)",
    waived: "payment waived",
  }[entry.paymentStatus];

  steps.push({
    label: "Entry",
    detail: `${ROLE[entry.role]} from the ${player.homeCourse ?? "club directory"}. ${payment}.${
      entry.sponsor === null ? "" : entry.sponsor ? " Sponsor: yes." : " Sponsor: no."
    }`,
    tone: "info",
  });

  steps.push({
    label: "Index frozen at the cut-off",
    detail:
      reg.frozenIndex === null
        ? `No index on or before the cut-off (${tournament.cutOffDate}), so nothing was frozen.`
        : `Index ${fmtIndex(reg.frozenIndex)} from the NGAP record dated ${reg.frozenEffectiveDate} (frozen ${String(entry.frozen.frozenAt).slice(0, 10)}).`,
    tone: reg.frozenIndex === null ? "warn" : "ok",
  });

  if (player.birthdate === null || !reg.ageKnown) {
    steps.push({
      label: "Category",
      detail: "Birthdate or gender is missing, so no category can be chosen.",
      tone: "warn",
    });
  } else {
    steps.push({
      label: "Category",
      detail: `Age ${reg.age} on ${tournament.config.date} and gender ${player.gender} give ${categoryName}.`,
      tone: reg.categoryId ? "ok" : "warn",
    });
  }

  const tee = reg.teeId ? tees.find((t) => t.id === reg.teeId) : undefined;
  steps.push({
    label: "Tee",
    detail: tee
      ? `${teeName} tee. Sample ratings only: Course Rating ${tee.courseRating}, Slope ${tee.slope}, Par ${tee.par}. The real IGCC scorecard is pending.`
      : "No tee is mapped for this category yet.",
    tone: tee ? "ok" : "warn",
  });

  if (tee && reg.frozenIndex !== null) {
    // The draw caps an index above the event maximum, so the preview works from the same number.
    const used = Math.min(reg.frozenIndex, tournament.config.maxIndex);
    const raw = rawCourseHandicap(used, tee);
    steps.push({
      label: "Course handicap preview",
      detail: `${fmtIndex(used)} × (${tee.slope} ÷ 113) + (${tee.courseRating} − ${tee.par}) = ${raw.toFixed(1)}${
        tournament.config.allowance === 1
          ? ""
          : ` × ${Math.round(tournament.config.allowance * 100)}%`
      } → playing ${fmtHcp(reg.playingHandicap)}. Preview only, not an official handicap.`,
      tone: "ok",
    });
  } else {
    steps.push({
      label: "Course handicap preview",
      detail: "No index and tee together, so no playing handicap can be shown.",
      tone: "warn",
    });
  }

  steps.push({
    label: "Eligibility",
    detail:
      reg.status === "ineligible"
        ? (reg.reasons[0] ?? "Not eligible for this event.")
        : reg.frozenIndex === null
          ? "Waiting for an index on or before the cut-off."
          : reg.frozenIndex > tournament.config.maxIndex
            ? `Index ${fmtIndex(reg.frozenIndex)} is above the event limit of ${tournament.config.maxIndex}; ${tournament.config.maxIndex} is used.`
            : `Index ${fmtIndex(reg.frozenIndex)} is within the event limit of ${tournament.config.maxIndex}.`,
    tone:
      reg.status === "ineligible"
        ? "bad"
        : reg.frozenIndex === null || reg.frozenIndex > tournament.config.maxIndex
          ? "warn"
          : "ok",
  });

  steps.push({
    label: "Flight",
    detail: reg.flightId
      ? `${flightName}, set by ${tournament.config.flightBasis === "index" ? "handicap index (demo assumption)" : "course handicap"}.`
      : "No flight covers this handicap yet.",
    tone: reg.flightId ? "ok" : "warn",
  });

  steps.push({
    label: "Start",
    detail: group
      ? `Group ${group.number} · ${tournament.config.startFormat === "shotgun" ? "hole" : "tee"} ${group.startHole}${group.wave ? ` · wave ${group.wave}` : ""} · ${group.time}${group.locked ? " · locked" : ""}.`
      : "Not placed in a group yet.",
    tone: group ? "ok" : "info",
  });

  if (override) {
    steps.push({
      label: "Manual override",
      detail: `${override.kind === "move" ? "Moved by the organizer" : override.kind} (${override.from ?? "—"} → ${override.to ?? "—"}). Reason: ${override.reason}.`,
      tone: "info",
    });
  }

  for (const flag of reg.flags) {
    steps.push({ label: "Check", detail: flag, tone: "warn" });
  }

  return { playerId: player.id, steps };
}
