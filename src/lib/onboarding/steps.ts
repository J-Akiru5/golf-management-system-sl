import { type OnboardingRole, type OnboardingStep, PLAYER_STEPS, STAFF_STEPS } from "./types";

/** The ordered steps for a role. */
export function stepsFor(role: OnboardingRole): readonly OnboardingStep[] {
  return role === "staff" ? STAFF_STEPS : PLAYER_STEPS;
}

/** How many steps the role has. */
export function stepCount(role: OnboardingRole): number {
  return stepsFor(role).length;
}

/** The step at an index, or null when the index is outside the list. */
export function stepAt(role: OnboardingRole, index: number): OnboardingStep | null {
  const steps = stepsFor(role);
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) return null;
  return steps[index] ?? null;
}

/** Puts an index inside the list: bad or negative becomes 0, past the end becomes the last step. */
export function clampStep(role: OnboardingRole, index: number): number {
  const last = stepCount(role) - 1;
  if (last < 0) return 0;
  if (!Number.isInteger(index) || index < 0) return 0;
  return index > last ? last : index;
}

/** The step after this one, stopping at the last. */
export function nextStep(role: OnboardingRole, index: number): number {
  return clampStep(role, index + 1);
}

/** The step before this one, stopping at the first. */
export function previousStep(role: OnboardingRole, index: number): number {
  return clampStep(role, index - 1);
}

/** True when the index points at the first step. */
export function isFirstStep(role: OnboardingRole, index: number): boolean {
  return clampStep(role, index) === 0;
}

/** True when the index points at the last step. */
export function isLastStep(role: OnboardingRole, index: number): boolean {
  return clampStep(role, index) === stepCount(role) - 1;
}

/** The step whose anchor, or any fallback anchor, matches. */
export function stepForAnchor(role: OnboardingRole, anchor: string): OnboardingStep | null {
  if (!anchor) return null;
  return (
    stepsFor(role).find(
      (step) => step.anchor === anchor || step.anchorFallbacks?.includes(anchor) === true,
    ) ?? null
  );
}
