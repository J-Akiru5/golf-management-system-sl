import {
  createPresignedDownload,
  createPresignedUpload,
  getStorageConfig,
  isStorageConfigured,
  type PresignedUpload,
  type StorageConfig,
  UnsupportedMediaTypeError,
} from "@/lib/storage";

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Scorecard scans keep the storage configuration, but only accept still-image types. */
export type R2Config = StorageConfig;

export function getR2Config(): R2Config | null {
  return getStorageConfig();
}

export function isR2Configured(): boolean {
  return isStorageConfigured();
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

export type PresignedPut = PresignedUpload;

export async function presignScorecardPut(
  key: string,
  mime: string,
  expiresIn = 900,
): Promise<PresignedPut> {
  if (!isSupportedImageMime(mime)) throw new UnsupportedMediaTypeError();
  return createPresignedUpload(key, mime, { expiresIn });
}

export function presignScorecardGet(key: string, expiresIn = 900): Promise<string> {
  return createPresignedDownload(key, expiresIn).then((presigned) => presigned.url);
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
