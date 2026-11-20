/** Text rules the database also enforces, applied before a row is sent so the message is plain. */

export const COMMENT_MAX_LENGTH = 4000;

/** The trimmed text, or null when it is empty. An empty description is no description. */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function cleanTitle(value: string): string {
  const title = value.trim();
  if (title === "") throw new Error("A task needs a title.");
  return title;
}

export function cleanBody(value: string): string {
  const body = value.trim();
  if (body === "") throw new Error("A comment needs some words.");
  if (body.length > COMMENT_MAX_LENGTH) {
    throw new Error(`A comment can be at most ${COMMENT_MAX_LENGTH} characters.`);
  }
  return body;
}
