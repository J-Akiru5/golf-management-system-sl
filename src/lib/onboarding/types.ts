import type { TranslationKey } from "@/lib/i18n/t";

/** Who is being shown the welcome. */
export type OnboardingRole = "player" | "staff";

/**
 * One screen of the welcome.
 *
 * Every piece of copy is a dictionary key, so the same step works in each locale. An anchored
 * step points at a control on the page; a plain panel has no anchor and stands on its own.
 */
export interface OnboardingStep {
  id: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** data-onboard anchor name; omitted for plain panels. */
  anchor?: string;
  /** Acceptable fallbacks when the primary anchor is absent. */
  anchorFallbacks?: string[];
  /** Optional quiet action on the step. */
  actionKey?: TranslationKey;
  actionHref?: string;
  kind?: "panel" | "language" | "find" | "preview" | "install" | "checklist";
}

/** The player welcome: language, finding an entry, a short preview, then install. */
export const PLAYER_STEPS: readonly OnboardingStep[] = [
  {
    id: "language",
    titleKey: "onboard.player.language.title",
    bodyKey: "onboard.player.language.body",
    kind: "language",
  },
  {
    id: "find",
    titleKey: "onboard.player.find.title",
    bodyKey: "onboard.player.find.body",
    kind: "find",
    actionKey: "onboard.player.find.action",
    actionHref: "/my",
  },
  {
    id: "preview",
    titleKey: "onboard.player.preview.title",
    bodyKey: "onboard.player.preview.body",
    kind: "preview",
  },
  {
    id: "install",
    titleKey: "onboard.player.install.title",
    bodyKey: "onboard.player.install.body",
    kind: "install",
  },
];

/** The staff welcome: the four desk screens, the account, then a first-day checklist. */
export const STAFF_STEPS: readonly OnboardingStep[] = [
  {
    id: "today",
    titleKey: "onboard.staff.today.title",
    bodyKey: "onboard.staff.today.body",
    anchor: "staff-day-pills",
    anchorFallbacks: ["staff-arrivals"],
    kind: "panel",
  },
  {
    id: "players",
    titleKey: "onboard.staff.players.title",
    bodyKey: "onboard.staff.players.body",
    anchor: "staff-arrive",
    anchorFallbacks: ["staff-arrivals"],
    actionKey: "onboard.staff.players.action",
    actionHref: "/staff/players",
    kind: "panel",
  },
  {
    id: "schedule",
    titleKey: "onboard.staff.schedule.title",
    bodyKey: "onboard.staff.schedule.body",
    anchor: "staff-next-up",
    anchorFallbacks: ["staff-jump-now"],
    actionKey: "onboard.staff.schedule.action",
    actionHref: "/staff/schedule",
    kind: "panel",
  },
  {
    id: "score",
    titleKey: "onboard.staff.score.title",
    bodyKey: "onboard.staff.score.body",
    anchor: "staff-score",
    actionKey: "onboard.staff.score.action",
    actionHref: "/staff/score",
    kind: "panel",
  },
  {
    id: "account",
    titleKey: "onboard.staff.account.title",
    bodyKey: "onboard.staff.account.body",
    anchor: "staff-account",
    kind: "panel",
  },
  {
    id: "checklist",
    titleKey: "onboard.staff.checklist.title",
    bodyKey: "onboard.staff.checklist.body",
    kind: "checklist",
  },
];
