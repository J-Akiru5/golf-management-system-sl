import type { ActionResult } from "./types";

/** Turns an action result into a value or a thrown error, so a component can use try/catch. */
export async function unwrap<T>(result: ActionResult<T> | Promise<ActionResult<T>>): Promise<T> {
  const resolved = await result;
  if (resolved.ok) return resolved.value;
  throw new Error(resolved.error);
}

/** The message to show for a caught error. Never an empty string. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "Something went wrong. Try again.";
}
