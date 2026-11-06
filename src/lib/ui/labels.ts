/**
 * What the desk calls things, in one place.
 *
 * A playing day runs two waves: the morning shotgun is Wave A and the afternoon shotgun is Wave B.
 * Inside a wave the groups start together on the holes, one batch at a time. That batch is a
 * flight: Flight A takes the holes first, Flight B starts on the same holes one gap later.
 *
 * Stored group labels still carry the older wording, `D3-AM-A`: playing day, wave and flight.
 */

export type SessionCode = "AM" | "PM";

/** The wave a stored label belongs to, read from its middle part. */
export function sessionOfLabel(label: string | null | undefined): SessionCode | null {
  const parts = (label ?? "").split("-");
  const code = parts[parts.length - 2];
  return code === "AM" || code === "PM" ? code : null;
}

/** Wave A is the morning shotgun, Wave B the afternoon one. */
export function waveHeading(label: string | null | undefined): string {
  const session = sessionOfLabel(label);
  if (session === "AM") return "Wave A · Morning";
  if (session === "PM") return "Wave B · Afternoon";
  return "Wave";
}

/** The batch of groups that starts on the holes together inside a wave. */
export function flightOfLabel(label: string | null | undefined): string | null {
  const parts = (label ?? "").split("-");
  const last = parts[parts.length - 1];
  return last || null;
}

export function flightName(label: string | null | undefined): string {
  const letter = flightOfLabel(label);
  return letter ? `Flight ${letter}` : "Flight";
}
