import { isAcceptablePassword, MIN_PASSWORD_LENGTH } from "./password-strength";

/**
 * The password rules the reset form, the sign-up form and their actions share, so the browser and
 * the server agree on what is acceptable.
 *
 * The length and common-password rules live in `password-strength.ts`, which also drives the meter,
 * so there is one definition rather than two that can drift.
 */
export type PasswordProblem = "password_short" | "password_mismatch" | "password_common";

export function passwordProblem(password: string, confirm: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "password_short";
  if (password !== confirm) return "password_mismatch";
  // Length alone does not save a password that appears on every list, so it is checked separately.
  if (!isAcceptablePassword(password)) return "password_common";
  return null;
}
