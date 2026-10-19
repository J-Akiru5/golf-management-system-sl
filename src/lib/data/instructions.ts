/**
 * The organizer's event instructions, prepared for display.
 *
 * Settings offers this as a multi-line field, so an organizer can write a short list. The screens
 * that show it have to keep those breaks: collapsing them into one paragraph turns a set of steps
 * into a run-on sentence. A field holding only spaces counts as empty, because a blank grey box
 * reads as a loading failure rather than "nothing set".
 */
export function instructionText(instructions: string | null | undefined): string | null {
  if (!instructions) return null;
  // Browsers may hand back CRLF depending on the platform the organizer typed on. One newline
  // character keeps the rendering identical everywhere.
  const normalised = instructions.replace(/\r\n?/g, "\n").trim();
  return normalised.length > 0 ? normalised : null;
}
