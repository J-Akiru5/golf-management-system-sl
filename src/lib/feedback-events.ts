/**
 * The private signal the desk shell listens for. It carries no note content: only the fact that the
 * feedback inbox changed, so a badge can re-read the count under RLS.
 */
export const FEEDBACK_CHANGED_EVENT = "teeline:feedback-changed";

export function notifyFeedbackChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FEEDBACK_CHANGED_EVENT));
}
