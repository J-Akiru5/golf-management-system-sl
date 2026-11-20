/**
 * Teeo, the public-pages mascot: a friendly robot golfer.
 *
 * One name and one pair of art paths, shared by the panel, the launcher and the system prompt, so
 * renaming him or replacing the artwork is done in one place. The files are added by the
 * orchestrator; until they exist `TeeoAvatar` draws its own placeholder through the same component,
 * so no page ever shows a broken image.
 */

export const MASCOT_NAME = "Teeo";

export const MASCOT_ALT = "Teeo, the TeeLine helper";

/** Full figure, on an off-white ground. */
export const MASCOT_FULL_SRC = "/brand/teeo.webp";

/** Square head crop, for the round badge. */
export const MASCOT_HEAD_SRC = "/brand/teeo-head.webp";
