/**
 * The fields the concern chat collects, in the order it asks for them.
 *
 * The first four are required by `normaliseConcern` when the matching concern is ticked. The last
 * three are asked once and accepted when the player declines.
 */

export const CONCERN_FIELDS = [
  "concerns",
  "holeNo",
  "teeColour",
  "otherText",
  "playerName",
  "handicap",
  "schedule",
] as const;

export type ConcernField = (typeof CONCERN_FIELDS)[number];

/** The fields a player may decline. Their absence never blocks the note. */
export const OPTIONAL_CONCERN_FIELDS = ["playerName", "handicap", "schedule"] as const;

export type OptionalConcernField = (typeof OPTIONAL_CONCERN_FIELDS)[number];

export function isOptionalConcernField(value: unknown): value is OptionalConcernField {
  return (
    typeof value === "string" && (OPTIONAL_CONCERN_FIELDS as readonly string[]).includes(value)
  );
}
