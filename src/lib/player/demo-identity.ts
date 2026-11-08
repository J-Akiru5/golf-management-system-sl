/**
 * The one sample player every demo screen uses, so the name, NGAP number and handicap do not change
 * between the phone home, the wide home, the leaderboard, the scorecard and Profile.
 *
 * It is plain constants with no imports on purpose: the demo profile in `profile.ts` reads it, and
 * that file ships on connected builds too. The name is already a fictional name from the demo seed.
 */

export const SAMPLE_PLAYER = {
  id: "demo-player-antonio",
  name: "Antonio Alcantara",
  ngapId: "8888",
} as const;

/** The index the club froze for the sample player, and the playing handicap that follows from it. */
export const SAMPLE_INDEX = 12.4;
export const SAMPLE_PLAYING_HANDICAP = 14;
