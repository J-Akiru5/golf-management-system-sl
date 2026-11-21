import type { GithubConnection } from "./types";

/**
 * The deployment settings the GitHub sync reads.
 *
 * Both values are server-only: they are read from `process.env` and this module is imported by
 * server code (the webhook route, the Settings actions and the task actions) only. Nothing here is
 * a NEXT_PUBLIC_ value and nothing returns the value itself to a page.
 *
 * A half configuration is reported, not guessed at: the connection says which names are missing and
 * the rest of the workspace keeps working.
 */

export const GITHUB_REPOSITORY = "J-Akiru5/golf-management-system-sl";

const REPOSITORY_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type GithubEnv = {
  GITHUB_TOKEN?: string | undefined;
  GITHUB_WEBHOOK_SECRET?: string | undefined;
  GITHUB_REPOSITORY?: string | undefined;
};

export type GithubConfig = {
  /** The fine-grained token. Never logged, never returned, never written to the database. */
  token: string;
  /** The webhook HMAC secret. Same rule. */
  webhookSecret: string;
  repository: string;
};

function read(env: GithubEnv): GithubEnv {
  return {
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
    GITHUB_REPOSITORY: env.GITHUB_REPOSITORY,
  };
}

/** The repository the sync works on. A malformed override falls back to the default. */
export function githubRepository(env: GithubEnv = process.env as GithubEnv): string {
  const raw = (read(env).GITHUB_REPOSITORY ?? "").trim();
  return REPOSITORY_SHAPE.test(raw) ? raw : GITHUB_REPOSITORY;
}

/** Both settings, or null when either is missing. */
export function githubConfig(env: GithubEnv = process.env as GithubEnv): GithubConfig | null {
  const values = read(env);
  const token = (values.GITHUB_TOKEN ?? "").trim();
  const webhookSecret = (values.GITHUB_WEBHOOK_SECRET ?? "").trim();
  if (!token || !webhookSecret) return null;
  return { token, webhookSecret, repository: githubRepository(env) };
}

/** The token alone, for the owner's import action. Null when it is not set. */
export function githubToken(env: GithubEnv = process.env as GithubEnv): string | null {
  const token = (read(env).GITHUB_TOKEN ?? "").trim();
  return token === "" ? null : token;
}

/** The webhook secret alone, for the signature check. Null when it is not set. */
export function githubWebhookSecret(env: GithubEnv = process.env as GithubEnv): string | null {
  const secret = (read(env).GITHUB_WEBHOOK_SECRET ?? "").trim();
  return secret === "" ? null : secret;
}

/** What the Settings screen shows: presence only. */
export function githubConnection(env: GithubEnv = process.env as GithubEnv): GithubConnection {
  const values = read(env);
  const token = (values.GITHUB_TOKEN ?? "").trim() !== "";
  const webhookSecret = (values.GITHUB_WEBHOOK_SECRET ?? "").trim() !== "";
  const missing: string[] = [];
  if (!token) missing.push("GITHUB_TOKEN");
  if (!webhookSecret) missing.push("GITHUB_WEBHOOK_SECRET");

  return {
    repository: githubRepository(env),
    token,
    webhookSecret,
    ready: token && webhookSecret,
    missing,
  };
}
