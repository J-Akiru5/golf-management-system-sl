import { AwsClient } from "aws4fetch";
import { getStorageConfig, requireStorageConfig, type StorageConfig } from "./config";
import { InvalidExpiryError, PublicUrlNotConfiguredError, StorageRequestError } from "./errors";
import {
  assertAllowedMime,
  assertSafeObjectKey,
  DEFAULT_EXPIRY_SECONDS,
  MAX_EXPIRY_SECONDS,
  validateUpload,
} from "./validation";

export interface PresignedUpload {
  key: string;
  method: "PUT";
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface PresignedDownload {
  key: string;
  method: "GET";
  url: string;
  expiresIn: number;
}

export interface PresignedUploadOptions {
  /** When present the shared image or document cap is enforced before signing. */
  bytes?: number;
  expiresIn?: number;
}

export type ObjectVisibility = "private" | "public";

export interface ObjectReadUrl {
  url: string;
  visibility: ObjectVisibility;
}

function expirySeconds(expiresIn: number): number {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_EXPIRY_SECONDS) {
    throw new InvalidExpiryError();
  }
  return expiresIn;
}

function storageClient(config: StorageConfig): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

function encodedKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(config: StorageConfig, key: string): string {
  return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey(key)}`;
}

async function signObjectUrl(
  config: StorageConfig,
  key: string,
  method: "GET" | "PUT" | "DELETE",
  expiresIn: number,
  headers?: Record<string, string>,
): Promise<string> {
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await storageClient(config).sign(new Request(url, { method, headers }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Signs a browser PUT for one object. The object stays private: the browser only receives a
 * short-lived signed URL, and no credential or bucket token is returned.
 */
export async function createPresignedUpload(
  key: string,
  mime: string,
  options: PresignedUploadOptions = {},
): Promise<PresignedUpload> {
  assertSafeObjectKey(key);
  if (options.bytes === undefined) {
    assertAllowedMime(mime);
  } else {
    validateUpload(mime, options.bytes);
  }
  const expiresIn = expirySeconds(options.expiresIn ?? DEFAULT_EXPIRY_SECONDS);
  const config = requireStorageConfig();
  const headers = { "Content-Type": mime };
  const uploadUrl = await signObjectUrl(config, key, "PUT", expiresIn, headers);
  return { key, method: "PUT", uploadUrl, headers, expiresIn };
}

export async function createPresignedDownload(
  key: string,
  expiresIn = DEFAULT_EXPIRY_SECONDS,
): Promise<PresignedDownload> {
  assertSafeObjectKey(key);
  const seconds = expirySeconds(expiresIn);
  const config = requireStorageConfig();
  const url = await signObjectUrl(config, key, "GET", seconds);
  return { key, method: "GET", url, expiresIn: seconds };
}

/** Builds a public custom-domain URL. Returns null unless R2_PUBLIC_URL is configured. */
export function publicObjectUrl(
  key: string,
  config: StorageConfig | null = getStorageConfig(),
): string | null {
  assertSafeObjectKey(key);
  if (!config?.publicUrl) return null;
  return `${config.publicUrl}/${encodedKey(key)}`;
}

/**
 * Explicit public or private read selection. Public is opt-in per call; the default stays signed,
 * so the bucket can remain private and only an object the caller marks public uses the domain.
 */
export async function objectReadUrl(
  key: string,
  options: { visibility?: ObjectVisibility; expiresIn?: number } = {},
): Promise<ObjectReadUrl> {
  const visibility = options.visibility ?? "private";
  if (visibility === "public") {
    const url = publicObjectUrl(key);
    if (!url) throw new PublicUrlNotConfiguredError();
    return { url, visibility };
  }
  return {
    url: (await createPresignedDownload(key, options.expiresIn)).url,
    visibility,
  };
}

/** Deletes one object with a signed bucket request and reports a refusal instead of ignoring it. */
export async function deleteObject(key: string): Promise<void> {
  assertSafeObjectKey(key);
  const config = requireStorageConfig();
  const url = await signObjectUrl(config, key, "DELETE", DEFAULT_EXPIRY_SECONDS);
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new StorageRequestError(response.status);
}
