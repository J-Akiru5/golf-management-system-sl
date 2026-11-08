import { StorageNotConfiguredError } from "./errors";

/**
 * Server-side R2 settings. The access key and secret never leave this process; callers that need a
 * URL receive a signed URL, not the credentials.
 */
export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  /** Optional custom domain for objects the caller explicitly marks public. */
  publicUrl: string | null;
}

export type StorageEnvironment = Record<string, string | undefined>;

function value(env: StorageEnvironment, name: string): string | undefined {
  const trimmed = env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

function withoutTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Parses the R2 environment without exposing any value in the result. The endpoint and public URL
 * are optional; the four credential and bucket values are required.
 */
export function parseStorageConfig(env: StorageEnvironment = process.env): StorageConfig | null {
  const accountId = value(env, "R2_ACCOUNT_ID");
  const accessKeyId = value(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "R2_SECRET_ACCESS_KEY");
  const bucket = value(env, "R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  const endpointEnv = value(env, "R2_ENDPOINT");
  const publicUrlEnv = value(env, "R2_PUBLIC_URL");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: endpointEnv
      ? withoutTrailingSlashes(endpointEnv)
      : `https://${accountId}.r2.cloudflarestorage.com`,
    publicUrl: publicUrlEnv ? withoutTrailingSlashes(publicUrlEnv) : null,
  };
}

export function getStorageConfig(): StorageConfig | null {
  return parseStorageConfig(process.env);
}

export function requireStorageConfig(): StorageConfig {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();
  return config;
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}
