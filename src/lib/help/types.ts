import type { Translate, TranslationKey } from "@/lib/i18n/t";

/** Who is reading the help. The desk's own copy is English by decision 18. */
export type HelpAudience = "desk" | "player";

/**
 * Copy is either a literal or a dictionary key.
 *
 * Desk help is literal (the desk chrome is English, and no one has to maintain three copies of
 * "click Publish"). Player help is a key, so it is translated and the dictionary tests cover it.
 * One shape, two sources: a guide cannot smuggle an untranslated string onto a translated screen
 * without the type saying so.
 */
export type HelpText = { kind: "literal"; text: string } | { kind: "key"; key: TranslationKey };

export interface HelpStep {
  text: HelpText;
  /**
   * The `data-help` attribute on the control the step is about. A step without one is advice to
   * read; a step with one can point at the actual button.
   */
  anchor?: string;
  /**
   * The route that holds the control, when it is not the guide's own route. A guide already lists
   * the routes it is about, so most anchored steps inherit `routes[0]`; set this only for a step
   * that points somewhere else.
   */
  route?: string;
}

export interface HelpGuide {
  id: string;
  title: HelpText;
  summary?: HelpText;
  steps: HelpStep[];
  /** Desk routes this guide is about, so the sheet can put the current screen first. */
  routes?: string[];
}

/** The first-run panel: a short welcome with a handful of things worth knowing. */
export interface WelcomePanel {
  id: string;
  title: HelpText;
  body: HelpText;
  bullets: HelpText[];
  button: HelpText;
}

export const literal = (text: string): HelpText => ({ kind: "literal", text });
export const key = (k: TranslationKey): HelpText => ({ kind: "key", key: k });

/** Resolves a guide's copy: literals as written, keys through the reader's dictionary. */
export function helpText(text: HelpText, t: Translate): string {
  return text.kind === "literal" ? text.text : t(text.key);
}

/**
 * The route an anchored step points at, or null when the step points at no control.
 *
 * The step's own `route` wins, so a guide can point at one control elsewhere. Otherwise the
 * guide's first route is the screen its controls live on.
 */
export function stepRoute(guide: HelpGuide, step: HelpStep): string | null {
  if (!step.anchor) return null;
  return step.route ?? guide.routes?.[0] ?? null;
}
