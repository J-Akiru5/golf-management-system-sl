/**
 * Groups the registration list into pair cards (issue 200).
 *
 * A pair from the club sheet is one member and one guest who share a pair number. The desk works
 * them as one card, so this builds the cards from every entry. The search box then decides which
 * whole cards to show: a card stays whole when either partner matches, so a search for one partner
 * can never turn a full pair into one player waiting for a partner.
 */

export interface TeamableRow {
  e: { id: string; teamNo?: number | null; role: "member" | "guest" };
  p: { name: string };
}

export interface Team<R extends TeamableRow> {
  key: string;
  /** The pair number, or null for a player entered alone. */
  number: number | null;
  rows: R[];
}

/**
 * One card per member and guest sharing a number. A number that somehow carries three entries (a
 * duplicate on the club sheet) still shows every one of them: the extra player gets a card of their
 * own rather than disappearing. Players with no number are one card each. When `matches` is given,
 * only cards where at least one player matches are returned, and those cards keep both players.
 * The order is stable (by the member's name, then the key), so editing a player never moves a card.
 */
export function groupIntoTeams<R extends TeamableRow>(
  rows: readonly R[],
  matches?: (row: R) => boolean,
): Team<R>[] {
  const byNumber = new Map<number, R[]>();
  const solo: R[] = [];
  for (const row of rows) {
    const teamNo = row.e.teamNo;
    if (teamNo === null || teamNo === undefined) {
      solo.push(row);
      continue;
    }
    const list = byNumber.get(teamNo) ?? [];
    list.push(row);
    byNumber.set(teamNo, list);
  }

  const grouped: Team<R>[] = [];
  for (const [number, list] of byNumber) {
    const members = list.filter((row) => row.e.role === "member");
    const guests = list.filter((row) => row.e.role === "guest");
    const cards = Math.max(members.length, guests.length);
    for (let at = 0; at < cards; at += 1) {
      const pair = [members[at], guests[at]].filter((row): row is R => Boolean(row));
      grouped.push({ key: `pair-${number}-${at}`, number, rows: pair });
    }
  }
  grouped.push(...solo.map((row) => ({ key: row.e.id, number: null, rows: [row] })));

  const lead = (team: Team<R>) =>
    (team.rows.find((row) => row.e.role === "member") ?? team.rows[0])?.p.name ?? "";
  return grouped
    .filter((team) => !matches || team.rows.some(matches))
    .sort((a, b) => lead(a).localeCompare(lead(b)) || a.key.localeCompare(b.key));
}
