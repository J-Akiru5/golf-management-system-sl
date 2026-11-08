import {
  InvalidPayloadError,
  InvalidStorageKeyError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "./errors";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_EXPIRY_SECONDS = 900;
export const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

export interface UploadRule {
  extension: string;
  maxBytes: number;
  kind: "image" | "document";
}

const MIME_RULES: Record<string, UploadRule> = {
  "image/jpeg": { extension: "jpg", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  "image/png": { extension: "png", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  "image/webp": { extension: "webp", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  "application/pdf": { extension: "pdf", maxBytes: DOCUMENT_MAX_BYTES, kind: "document" },
};

export const ALLOWED_UPLOAD_MIME_TYPES = Object.freeze(Object.keys(MIME_RULES));

export function uploadRuleFor(mime: string): UploadRule | null {
  return MIME_RULES[mime] ?? null;
}

export function isAllowedMime(mime: string): boolean {
  return Boolean(uploadRuleFor(mime));
}

export function extensionForMime(mime: string): string | null {
  return uploadRuleFor(mime)?.extension ?? null;
}

export function assertAllowedMime(mime: string): UploadRule {
  const rule = uploadRuleFor(mime);
  if (!rule) throw new UnsupportedMediaTypeError();
  return rule;
}

/** Rejects an unsupported type or an invalid or oversized payload before any URL is signed. */
export function validateUpload(mime: string, bytes: number): UploadRule {
  const rule = assertAllowedMime(mime);
  if (!Number.isInteger(bytes) || bytes <= 0) throw new InvalidPayloadError();
  if (bytes > rule.maxBytes) throw new PayloadTooLargeError(rule.maxBytes, rule.kind);
  return rule;
}

export const STORAGE_USE_CASES = ["logo", "course-map", "document"] as const;
export type StorageUseCase = (typeof STORAGE_USE_CASES)[number];

const USE_CASE_FOLDERS: Record<StorageUseCase, string> = {
  logo: "logos",
  "course-map": "course-maps",
  document: "documents",
};

export function isStorageUseCase(value: string): value is StorageUseCase {
  return Object.hasOwn(USE_CASE_FOLDERS, value);
}

/** A key is a relative object path. Reject empty, absolute, traversal and control characters. */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 1024) return false;
  if (key.startsWith("/") || key.endsWith("/")) return false;
  if (key.includes("\\") || key.includes("..")) return false;
  return key.split("/").every((segment) => segment.length > 0 && !/[\u0000-\u001f]/.test(segment));
}

export function assertSafeObjectKey(key: string): void {
  if (!isSafeObjectKey(key)) throw new InvalidStorageKeyError();
}

/**
 * Club-scoped key for media and documents, for example
 * `<club-id>/r2/logos/<uuid>.png`. Scorecard scans keep their own `scorecards` prefix.
 */
export function createObjectKey(clubId: string, useCase: StorageUseCase, mime: string): string {
  const rule = assertAllowedMime(mime);
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(clubId)) throw new InvalidStorageKeyError();
  return `${clubId}/r2/${USE_CASE_FOLDERS[useCase]}/${crypto.randomUUID()}.${rule.extension}`;
}
