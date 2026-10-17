import type { Group, Registration, TournamentConfig } from "@/lib/routing";

/** A group on the board. `locked` groups keep their players until the organizer unlocks them. */
export interface DrawGroup extends Group {
  locked: boolean;
}

export type Severity = "blocking" | "warning" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
  /** Group number to jump to, if the issue belongs to one group. */
  group?: number;
  playerId?: string;
}

export interface Names {
  flight: (id: string | null) => string;
  category: (id: string | null) => string;
}

export interface ValidateInput {
  draw: DrawGroup[];
  registrations: Registration[];
  config: TournamentConfig;
  /** Plain-language warnings the routing engine produced when the draw was made. */
  engineWarnings: string[];
  /**
   * Desk flags worth the organizer's attention (a frozen index that is old, or newer than the
   * freeze). They are warnings: publishing needs them acknowledged, not blocked.
   */
  flags?: { playerId: string; message: string }[];
  names: Names;
}

const ORDER: Record<Severity, number> = { blocking: 0, warning: 1, info: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const STATUS_WORDS = { ineligible: "not eligible", needs_review: "marked Needs review" } as const;

/**
 * Checks the draw as it stands. Blocking issues stop publishing; warnings need the organizer's
 * acknowledgement; info is context. Nothing here changes the draw.
 */
export function validateDraw({
  draw,
  registrations,
  config,
  engineWarnings,
  flags = [],
  names,
}: ValidateInput): Issue[] {
  const issues: Issue[] = [];
  const regById = new Map(registrations.map((r) => [r.playerId, r]));
  const nameOf = (id: string) => regById.get(id)?.playerName ?? "A player";

  const seen = new Map<string, number>();
  for (const g of draw) {
    for (const id of g.playerIds) {
      const first = seen.get(id);
      if (first !== undefined && first !== g.number) {
        issues.push({
          id: `dup-${id}`,
          severity: "blocking",
          message: `${nameOf(id)} is in more than one group (${first} and ${g.number}).`,
          group: g.number,
          playerId: id,
        });
      } else {
        seen.set(id, g.number);
      }
    }
  }

  for (const g of draw) {
    const n = g.playerIds.length;
    if (n > config.groupSize) {
      issues.push({
        id: `cap-${g.number}`,
        severity: "blocking",
        message: `Group ${g.number} has ${n} players. The limit is ${config.groupSize}.`,
        group: g.number,
      });
    }
    for (const id of g.playerIds) {
      const r = regById.get(id);
      if (r && r.status !== "ok") {
        issues.push({
          id: `status-${id}`,
          severity: "blocking",
          message: `${r.playerName} is ${STATUS_WORDS[r.status]} but is in group ${g.number}.`,
          group: g.number,
          playerId: id,
        });
      }
    }
  }

  for (const r of registrations) {
    if (r.status === "ok" && !seen.has(r.playerId)) {
      issues.push({
        id: `unplaced-${r.playerId}`,
        severity: "blocking",
        message: `${r.playerName} is ready to play but has no group.`,
        playerId: r.playerId,
      });
    }
  }

  for (const g of draw) {
    const n = g.playerIds.length;
    if (n === 0) {
      issues.push({
        id: `empty-${g.number}`,
        severity: "warning",
        message: `Group ${g.number} is empty and will be skipped on the sheet.`,
        group: g.number,
      });
      continue;
    }
    if (n < config.minGroupSize) {
      issues.push({
        id: `small-${g.number}`,
        severity: "warning",
        message: `Group ${g.number} has only ${plural(n, "player")}. Aim for ${config.minGroupSize} to ${config.groupSize}.`,
        group: g.number,
      });
    }
    const other = g.playerIds.filter((id) => {
      const f = regById.get(id)?.flightId;
      return f && f !== g.flightId;
    });
    if (other.length > 0) {
      issues.push({
        id: `flight-${g.number}`,
        severity: "warning",
        message: `Group ${g.number} (${names.flight(g.flightId)}) has ${plural(other.length, "player")} from another flight.`,
        group: g.number,
      });
    }
    const cats = new Set(g.playerIds.map((id) => regById.get(id)?.categoryId));
    if (cats.size > 1) {
      issues.push({
        id: `cats-${g.number}`,
        severity: "warning",
        message: `Group ${g.number} mixes categories, so players are on different tees.`,
        group: g.number,
      });
    }
  }

  engineWarnings.forEach((w, i) => {
    issues.push({ id: `engine-${i}`, severity: "warning", message: w });
  });

  const flagged = new Set<string>();
  for (const f of flags) {
    if (flagged.has(f.playerId)) continue;
    flagged.add(f.playerId);
    issues.push({
      id: `flag-${f.playerId}`,
      severity: "warning",
      message: f.message,
      playerId: f.playerId,
    });
  }

  const locked = draw.filter((g) => g.locked).length;
  if (locked > 0) {
    issues.push({
      id: "locked",
      severity: "info",
      message: `${plural(locked, "group")} locked. Locked groups cannot give or receive players.`,
    });
  }

  return issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export type DropCheck = { ok: true; notes: string[] } | { ok: false; reason: string };

/**
 * Whether a player may move into a group. The store enforces this too, so the board's preview
 * and the actual move can never disagree.
 */
export function dropCheck(
  draw: DrawGroup[],
  config: TournamentConfig,
  regs: Map<string, Registration>,
  playerId: string,
  toGroup: number,
  names: Pick<Names, "flight">,
): DropCheck {
  const target = draw.find((g) => g.number === toGroup);
  if (!target) return { ok: false, reason: "That group does not exist." };
  const source = draw.find((g) => g.playerIds.includes(playerId));
  if (source?.number === target.number) return { ok: false, reason: "Already in this group." };
  if (source?.locked) {
    return {
      ok: false,
      reason: `Group ${source.number} is locked. Unlock it to move this player.`,
    };
  }
  if (target.locked) {
    return { ok: false, reason: `Group ${target.number} is locked. Unlock it to add players.` };
  }
  if (target.playerIds.length >= config.groupSize) {
    return {
      ok: false,
      reason: `Group ${target.number} is full (${target.playerIds.length} of ${config.groupSize}).`,
    };
  }
  const notes: string[] = [];
  const reg = regs.get(playerId);
  if (reg?.flightId && reg.flightId !== target.flightId) {
    notes.push(`Different flight from this group (${names.flight(target.flightId)}).`);
  }
  return { ok: true, notes };
}
