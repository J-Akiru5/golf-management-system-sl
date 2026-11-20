/**
 * Pure parts of the avatar, kept in a module without JSX so they can be tested without a renderer.
 *
 * A stable tone per id: the same member keeps the same colour on every screen, and the colour
 * carries no meaning beyond identity. Only token pairs are used, so both themes stay readable.
 */
const TONES = [
  "bg-fairway-soft text-fairway",
  "bg-gold-soft text-gold-ink",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-surface-sunken text-ink-muted",
] as const;

/** Initials for an avatar. An empty name gives an empty string, never a guessed letter. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (first === undefined) return "";
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const firstLetter = first.charAt(0);
  const lastLetter = lastPart?.charAt(0) ?? "";
  return `${firstLetter}${lastLetter}`.toUpperCase();
}

/** A tone class for an id. Deterministic, so it does not change between renders or sessions. */
export function toneFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length] ?? TONES[0];
}
