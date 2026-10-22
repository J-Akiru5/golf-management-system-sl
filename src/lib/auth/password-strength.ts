/**
 * How strong a proposed password is.
 *
 * Deliberately a heuristic rather than a library. A dictionary-based scorer is better at judging a
 * real password, but the good ones are several hundred kilobytes, and this runs on a public sign-up
 * page where the bundle is the first thing a golfer downloads. Length plus variety plus a short list
 * of the passwords people actually choose gets most of the benefit for none of the weight.
 *
 * The rules follow current guidance rather than the old complexity checklist: length first, no
 * forced symbols, and no pretending that "P@ssw0rd" is strong.
 */
export const MIN_PASSWORD_LENGTH = 10;

export type StrengthLevel = "too-short" | "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  level: StrengthLevel;
  /** 0 to 4, for a four-segment meter. Always 0 when the password is too short. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  advice: string;
}

/** Passwords common enough that length does not save them. Lowercase, letters and digits only. */
const COMMON = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty1234",
  "iloveyou",
  "letmein123",
  "welcome123",
  "welcome1",
  "administrator",
  "admin12345",
  "golf123456",
  "golfgolf12",
  "teeline123",
  "iloilocity",
  "bamboobamboo",
]);

/**
 * Lowercases and removes punctuation before the common-password check, mapping the letter lookalikes
 * people actually substitute. Without this, "p@ssword123" normalises to "pssword123" and walks past a
 * list that already contains "password123".
 */
const LOOKALIKES: Record<string, string> = { "@": "a", $: "s", "!": "i" };

const normalise = (password: string) => {
  let out = password.toLowerCase();
  for (const [from, to] of Object.entries(LOOKALIKES)) out = out.split(from).join(to);
  return out.replace(/[^a-z0-9]/g, "");
};

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      level: "too-short",
      score: 0,
      label: "Too short",
      advice: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /\d/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const variety = [lower, upper, digit, symbol].filter(Boolean).length;

  // "aaaaaaaa" and "abcdabcd" look long but carry very little.
  const repeated = /(.)\1{2,}/.test(password);
  const sequential = /(?:abcd|bcde|cdef|1234|2345|3456|4567|5678|6789)/i.test(password);
  const common = COMMON.has(normalise(password));

  let score = 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (variety >= 3) score += 1;
  if (variety === 4 && password.length >= 12) score += 1;
  if (repeated) score -= 1;
  if (sequential) score -= 1;

  // A known password is weak whatever its length. This is the case the length rule misses.
  if (common) score = 1;

  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;

  const byScore: Record<1 | 2 | 3 | 4, Omit<PasswordStrength, "score">> = {
    1: {
      level: "weak",
      label: "Weak",
      advice: common
        ? "This is one of the most commonly used passwords. Choose something else."
        : "A longer password is much harder to guess than a complicated short one.",
    },
    2: {
      level: "fair",
      label: "Fair",
      advice: "Add a few more characters, or mix in a number or a capital.",
    },
    3: {
      level: "good",
      label: "Good",
      advice: "That is a reasonable password.",
    },
    4: {
      level: "strong",
      label: "Strong",
      advice: "Good length and variety. This one will hold.",
    },
  };

  return { ...byScore[clamped], score: clamped };
}

/** The rule the server enforces. The meter is advice; this is the gate. */
export function isAcceptablePassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && !COMMON.has(normalise(password));
}
