/**
 * A stable, readable id for a sample player. The demo has no database uuid, but the profile search
 * and the sample scorecards need a key that does not change between renders. Every demo name is
 * unique, so the slug is too.
 */
export function demoPlayerId(name: string): string {
  return `demo-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
