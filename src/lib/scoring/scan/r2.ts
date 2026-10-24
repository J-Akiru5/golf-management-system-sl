import { AwsClient } from "aws4fetch";

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

/** R2 uses the S3 API; the endpoint can be overridden for a custom domain or local mirror. */
export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const endpoint =
    process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "") ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

export function extensionForImageMime(mime: string): string | null {
  return IMAGE_MIME[mime] ?? null;
}

export function isSupportedImageMime(mime: string): boolean {
  return Boolean(extensionForImageMime(mime));
}

/** The prefix keeps `scorecard_images.storage_path` compatible with the existing club-id check. */
export function createScorecardObjectKey(clubId: string, mime: string): string {
  const extension = extensionForImageMime(mime);
  if (!extension) throw new Error("Unsupported image type.");
  return `${clubId}/r2/scorecards/${crypto.randomUUID()}.${extension}`;
}

export function scorecardObjectBelongsToClub(key: string, clubId: string): boolean {
  return key.startsWith(`${clubId}/r2/scorecards/`) && !key.includes("..");
}

function objectUrl(config: R2Config, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
}

function client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

export interface PresignedPut {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export async function presignScorecardPut(
  key: string,
  mime: string,
  expiresIn = 900,
): Promise<PresignedPut> {
  const config = getR2Config();
  if (!config) throw new Error("R2 is not configured.");
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client(config).sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": mime },
    }),
    { aws: { signQuery: true } },
  );
  return {
    uploadUrl: signed.url,
    headers: { "Content-Type": mime },
    expiresIn,
  };
}

export async function presignScorecardGet(key: string, expiresIn = 900): Promise<string> {
  const config = getR2Config();
  if (!config) throw new Error("R2 is not configured.");
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client(config).sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function readScorecardObject(
  key: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const signed = await presignScorecardGet(key, 300);
  const response = await fetch(signed);
  if (!response.ok) {
    throw new Error(`R2 could not read the image (${response.status}).`);
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}
