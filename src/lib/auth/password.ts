/** The password rules the reset form and the action share, so the browser and the server agree. */
export type PasswordProblem = "password_short" | "password_mismatch";

export function passwordProblem(password: string, confirm: string): PasswordProblem | null {
  if (password.length < 8) return "password_short";
  if (password !== confirm) return "password_mismatch";
  return null;
}
