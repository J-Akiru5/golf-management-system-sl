/** Typed failures for the storage service. Messages never carry credentials or signed URLs. */
export type StorageErrorCode =
  | "not_configured"
  | "public_url_not_configured"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_payload"
  | "invalid_key"
  | "invalid_expiry"
  | "request_failed";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export class StorageNotConfiguredError extends StorageError {
  constructor() {
    super("not_configured", "Object storage is not configured.");
    this.name = "StorageNotConfiguredError";
  }
}

export class PublicUrlNotConfiguredError extends StorageError {
  constructor() {
    super("public_url_not_configured", "The public storage URL is not configured.");
    this.name = "PublicUrlNotConfiguredError";
  }
}

export class UnsupportedMediaTypeError extends StorageError {
  constructor() {
    super("unsupported_media_type", "Use a JPEG, PNG, WebP or PDF file.");
    this.name = "UnsupportedMediaTypeError";
  }
}

export class PayloadTooLargeError extends StorageError {
  readonly maxBytes: number;

  constructor(maxBytes: number, kind: "image" | "document") {
    const megabytes = Math.round(maxBytes / (1024 * 1024));
    super("payload_too_large", `The ${kind} must be ${megabytes} MB or smaller.`);
    this.name = "PayloadTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export class InvalidPayloadError extends StorageError {
  constructor() {
    super("invalid_payload", "The file size must be a positive number of bytes.");
    this.name = "InvalidPayloadError";
  }
}

export class InvalidStorageKeyError extends StorageError {
  constructor() {
    super("invalid_key", "The storage key is not valid.");
    this.name = "InvalidStorageKeyError";
  }
}

export class InvalidExpiryError extends StorageError {
  constructor() {
    super("invalid_expiry", "The signed URL expiry must be between 1 second and 7 days.");
    this.name = "InvalidExpiryError";
  }
}

export class StorageRequestError extends StorageError {
  readonly status: number;

  constructor(status: number) {
    super("request_failed", `Object storage refused the request (${status}).`);
    this.name = "StorageRequestError";
    this.status = status;
  }
}
