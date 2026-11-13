/**
 * Planning one upload of many card photos.
 *
 * A file is created once per content hash. A hash already in the inbox, or one that repeats an
 * earlier file in the same batch, is a duplicate and is not uploaded again. A hash that is not 64
 * hexadecimal characters is invalid and is not compared at all.
 *
 * Pure: no I/O, no clock.
 */

export interface BatchFile {
  name: string;
  sha256: string;
}

export type BatchDuplicateReason = "duplicate_in_batch" | "already_in_inbox";

export interface BatchDuplicate {
  name: string;
  sha256: string;
  reason: BatchDuplicateReason;
  /** The earlier file in this batch, or null when the hash was already in the inbox. */
  duplicateOf: string | null;
  message: string;
}

export interface BatchInvalid {
  name: string;
  sha256: string;
  reason: "bad_hash";
  message: string;
}

export interface BatchPlan {
  /** Files to upload, in the order they were given. */
  toCreate: BatchFile[];
  duplicates: BatchDuplicate[];
  invalid: BatchInvalid[];
}

const HEX_HASH = /^[0-9a-f]{64}$/;

/** Returns the comparable form of a hash, or null when it is not 64 hexadecimal characters. */
function normalizeHash(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return HEX_HASH.test(trimmed) ? trimmed : null;
}

/**
 * Splits a batch into new files, duplicates and invalid hashes, keeping the input order in each
 * list. Hashes compare case-insensitively.
 */
export function planBatchUpload(
  files: readonly BatchFile[],
  existing: readonly string[],
): BatchPlan {
  const inInbox = new Set<string>();
  for (const value of existing) {
    const hash = normalizeHash(value);
    if (hash !== null) inInbox.add(hash);
  }

  const seen = new Map<string, string>();
  const toCreate: BatchFile[] = [];
  const duplicates: BatchDuplicate[] = [];
  const invalid: BatchInvalid[] = [];

  for (const file of files) {
    const hash = normalizeHash(file.sha256);
    if (hash === null) {
      invalid.push({
        name: file.name,
        sha256: file.sha256,
        reason: "bad_hash",
        message: "The file does not have a valid SHA-256 hash.",
      });
      continue;
    }

    if (inInbox.has(hash)) {
      duplicates.push({
        name: file.name,
        sha256: file.sha256,
        reason: "already_in_inbox",
        duplicateOf: null,
        message: "already in the inbox",
      });
      continue;
    }

    const earlier = seen.get(hash);
    if (earlier !== undefined) {
      duplicates.push({
        name: file.name,
        sha256: file.sha256,
        reason: "duplicate_in_batch",
        duplicateOf: earlier,
        message: `same as ${earlier}`,
      });
      continue;
    }

    seen.set(hash, file.name);
    toCreate.push(file);
  }

  return { toCreate, duplicates, invalid };
}
