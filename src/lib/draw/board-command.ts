/**
 * The command box above the board. One line of text becomes a plan the desk confirms, or a plain
 * reason it cannot. Pure: it reads the players and groups it is handed and never touches the store.
 *
 *   swap A with B
 *   swap A and B with C and D
 *   move A to hole 12
 *   move A, B to group 7
 *
 * A name is a surname, or the start of one, matched against the players on the board. A name that
 * fits more than one player is never acted on: the candidates come back and the desk picks one. A
 * pick is passed back in as a pin, so the same text parses again without the desk retyping it.
 */

export interface BoardPlayer {
  id: string;
  /** As the board writes it, for example "CELINO, ALAN". */
  name: string;
}

/** The part of a group the parser needs: its number, and the hole it tees off on. */
export interface BoardGroupRef {
  number: number;
  startHole: number;
}

export type BoardCommandPlan =
  | { kind: "swapPlayers"; a: string; b: string }
  | { kind: "swapSets"; setA: string[]; setB: string[] }
  | { kind: "move"; playerIds: string[]; toGroup: number };

export type BoardCommandResult =
  | { ok: true; plan: BoardCommandPlan; summary: string }
  | { ok: false; error: string; candidates: BoardPlayer[] };

const noCandidates = (error: string): BoardCommandResult => ({ ok: false, error, candidates: [] });
const listOf = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Case, spacing, commas and accents do not decide whether a name matches. */
const words = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** The key a pin is stored under, so the desk's pick survives the same text being parsed again. */
export const nameKey = (text: string): string => words(text).join(" ");

/** A query matches when its words start the same words in the player's name. */
function matches(nameWords: readonly string[], queryWords: readonly string[]): boolean {
  if (queryWords.length === 0) return false;
  for (let start = 0; start + queryWords.length <= nameWords.length; start += 1) {
    let all = true;
    for (let i = 0; i < queryWords.length; i += 1) {
      const want = queryWords[i] ?? "";
      const have = nameWords[start + i] ?? "";
      if (!have.startsWith(want)) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

type Found = { ok: true; player: BoardPlayer } | Extract<BoardCommandResult, { ok: false }>;

function find(query: string, players: readonly BoardPlayer[]): Found {
  const queryWords = words(query);
  if (queryWords.length === 0)
    return { ok: false, error: "One of the names is empty.", candidates: [] };
  const exact = players.filter((player) => nameKey(player.name) === nameKey(query));
  if (exact.length === 1 && exact[0]) return { ok: true, player: exact[0] };
  const candidates = players
    .filter((player) => matches(words(player.name), queryWords))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (candidates.length === 1 && candidates[0]) return { ok: true, player: candidates[0] };
  if (candidates.length === 0) {
    return { ok: false, error: `No player on the board is called “${query}”.`, candidates: [] };
  }
  return {
    ok: false,
    error: `“${query}” matches ${candidates.length} players. Pick the one you mean.`,
    candidates,
  };
}

/** "a, b and c" and "a and b" both become three and two names. */
const splitNames = (text: string): string[] =>
  text
    .split(/\s+and\s+|,/i)
    .map((part) => part.trim())
    .filter(Boolean);

function resolveAll(
  queries: readonly string[],
  players: readonly BoardPlayer[],
  pins: Readonly<Record<string, string>>,
): { ok: true; found: BoardPlayer[] } | Extract<BoardCommandResult, { ok: false }> {
  const found: BoardPlayer[] = [];
  for (const query of queries) {
    const pinned = pins[nameKey(query)];
    const chosen = pinned ? players.find((player) => player.id === pinned) : undefined;
    if (chosen) {
      found.push(chosen);
      continue;
    }
    const one = find(query, players);
    if (!one.ok) return one;
    found.push(one.player);
  }
  return { ok: true, found };
}

function groupAt(
  hole: number,
  groups: readonly BoardGroupRef[],
): { ok: true; number: number } | Extract<BoardCommandResult, { ok: false }> {
  const onHole = groups.filter((group) => group.startHole === hole);
  const only = onHole[0];
  if (onHole.length === 1 && only) return { ok: true, number: only.number };
  if (onHole.length === 0) {
    return { ok: false, error: `No group starts on hole ${hole}.`, candidates: [] };
  }
  const numbers = onHole.map((group) => group.number).sort((a, b) => a - b);
  return {
    ok: false,
    error: `Hole ${hole} has ${onHole.length} groups (${listOf(numbers.map(String))}). Say “to group ${numbers[0]}” instead.`,
    candidates: [],
  };
}

const HELP =
  "I can read “swap A with B”, “swap A and B with C and D”, “move A to hole 12” and “move A, B to group 7”.";

/**
 * Reads one command. `pins` carries the picks the desk already made for an ambiguous name, keyed by
 * `nameKey` of the words they typed.
 */
export function parseBoardCommand(
  text: string,
  players: readonly BoardPlayer[],
  groups: readonly BoardGroupRef[] = [],
  pins: Readonly<Record<string, string>> = {},
): BoardCommandResult {
  const line = text.trim().replace(/\s+/g, " ");
  if (line === "") {
    return noCandidates("Type a command, for example “swap CELINO with BRIONES”.");
  }

  const swap = /^swap\s+(.+?)\s+with\s+(.+)$/i.exec(line);
  if (swap) {
    const leftQueries = splitNames(swap[1] ?? "");
    const rightQueries = splitNames(swap[2] ?? "");
    if (leftQueries.length === 0 || rightQueries.length === 0) return noCandidates(HELP);
    if (leftQueries.length !== rightQueries.length) {
      return noCandidates(
        `Swap needs the same number of players on each side (${leftQueries.length} and ${rightQueries.length}).`,
      );
    }
    const left = resolveAll(leftQueries, players, pins);
    if (!left.ok) return left;
    const right = resolveAll(rightQueries, players, pins);
    if (!right.ok) return right;

    const leftIds = left.found.map((player) => player.id);
    const rightIds = right.found.map((player) => player.id);
    if (new Set(leftIds).size !== leftIds.length || new Set(rightIds).size !== rightIds.length) {
      return noCandidates("A player is listed twice.");
    }
    const [onlyA] = left.found;
    const [onlyB] = right.found;
    if (left.found.length === 1 && onlyA && onlyB) {
      if (onlyA.id === onlyB.id) return noCandidates("Pick two different players.");
      return {
        ok: true,
        plan: { kind: "swapPlayers", a: onlyA.id, b: onlyB.id },
        summary: `Swap ${onlyA.name} with ${onlyB.name}`,
      };
    }
    if (new Set([...leftIds, ...rightIds]).size !== leftIds.length + rightIds.length) {
      return noCandidates("A player cannot be on both sides.");
    }
    return {
      ok: true,
      plan: { kind: "swapSets", setA: leftIds, setB: rightIds },
      summary: `Swap ${listOf(left.found.map((player) => player.name))} with ${listOf(
        right.found.map((player) => player.name),
      )}`,
    };
  }

  const move = /^move\s+(.+?)\s+to\s+(group|hole)\s+(\d+)$/i.exec(line);
  if (move) {
    const queries = splitNames(move[1] ?? "");
    if (queries.length === 0) return noCandidates(HELP);
    const idText = move[3] ?? "";
    const where = Number.parseInt(idText, 10);
    if (!Number.isInteger(where) || where < 1) {
      return noCandidates(`“${idText}” is not a group number.`);
    }
    let toGroup = where;
    if ((move[2] ?? "").toLowerCase() === "hole") {
      const at = groupAt(where, groups);
      if (!at.ok) return at;
      toGroup = at.number;
    } else if (!groups.some((group) => group.number === where)) {
      return noCandidates(`Group ${where} is not on the board.`);
    }
    const all = resolveAll(queries, players, pins);
    if (!all.ok) return all;
    if (new Set(all.found.map((player) => player.id)).size !== all.found.length) {
      return noCandidates("A player is listed twice.");
    }
    return {
      ok: true,
      plan: { kind: "move", playerIds: all.found.map((player) => player.id), toGroup },
      summary: `Move ${listOf(all.found.map((player) => player.name))} to group ${toGroup}`,
    };
  }

  return noCandidates(HELP);
}
