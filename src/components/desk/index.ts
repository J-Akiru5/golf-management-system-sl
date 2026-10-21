/**
 * Registration-desk and shell components, ready to be wired.
 *
 * Everything here is props-driven and side-effect free: no fetching, no store, no Supabase, no
 * auth imports. The assembler supplies data from the repositories in `src/lib/data/adapters.ts`
 * and receives callbacks. See docs/handoffs/desk-components.md for the wiring points.
 */

export type { DataStatusBannerProps } from "./DataStatusBanner";
export { DataStatusBanner, DEMO_DATA_NOTICE, SaveTruth } from "./DataStatusBanner";
// Pure helpers, exported so screens can use the same wording and ranking they render.
export {
  addedByLabel,
  eligibilityView,
  formatAddedAt,
  isRoleAllowed,
  lastSavedLabel,
  missingRequiredFields,
  PAYMENT_OPTIONS,
  paymentLabel,
  persistenceNote,
  rankPlayerMatches,
  roleLabel,
} from "./logic";
export type { PlayerQuickPickProps } from "./PlayerQuickPick";
export { PlayerQuickPick } from "./PlayerQuickPick";
export type { RegisterConfirmProps } from "./RegisterConfirm";
export { RegisterConfirm } from "./RegisterConfirm";
export { RegistrationDaysEditor } from "./RegistrationDaysEditor";
export type {
  OverriddenBadgeProps,
  RegisteredByProps,
  RegistrationRowProps,
} from "./RegistrationRow";
export { OverriddenBadge, RegisteredBy, RegistrationRow } from "./RegistrationRow";
export type { RoleGateProps } from "./RoleGate";
export { RoleGate } from "./RoleGate";
export type { SessionBarProps } from "./SessionBar";
export { SessionBar } from "./SessionBar";

export type {
  DataStatus,
  DeskRole,
  EligibilityView,
  EntryDraftFields,
  PaymentStatus,
  PickStatus,
  PlayerPickItem,
  RegistrationAudit,
  RegistrationField,
  RegistrationStatus,
} from "./types";
export { ROLE_LABEL } from "./types";
