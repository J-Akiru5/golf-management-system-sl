/**
 * Puts the playing date on the end of a public pairings heading, so a reader who lands on the page
 * can see which day the groups below belong to. A heading with no date to show is returned as it is:
 * nothing is invented for a snapshot that carries no date.
 */
export function datedHeading(base: string, dateText: string | null | undefined): string {
  const date = dateText?.trim();
  return date ? `${base} · ${date}` : base;
}
