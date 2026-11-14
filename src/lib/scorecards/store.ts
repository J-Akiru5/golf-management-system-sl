import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export interface StoredScorecardDocument {
  slug: string;
  event: string;
  label: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  /** The account that saved it last. Null on documents written before this was recorded. */
  updatedBy: string | null;
}

export interface ScorecardSnapshot {
  /** The object path, or null when there was no document to copy yet. */
  path: string | null;
  at: string;
}

export interface ScorecardStore {
  get(slug: string): Promise<StoredScorecardDocument | null>;
  /**
   * Every saved day document. Used by the admin's tabulator submission queue; the bucket is small
   * (one document per day and session), so reading them together is cheaper than a second index.
   */
  list(): Promise<StoredScorecardDocument[]>;
  put(input: {
    slug: string;
    event: string;
    label: string;
    payload: Record<string, unknown>;
    updatedBy?: string | null;
  }): Promise<StoredScorecardDocument>;
  /**
   * Runs a read, merge and write as one step. Two tabulators saving at the same moment would
   * otherwise both read the same copy and the second write would drop the first one's cards.
   */
  locked<T>(slug: string, by: string | null, run: () => Promise<T>): Promise<T>;
  /** Copies the current document aside, so a reset or a replace can be recovered. */
  snapshot(input: { slug: string; reason: string; by: string | null }): Promise<ScorecardSnapshot>;
  close(): void;
}

export class ScorecardStoreUnavailable extends Error {}

/** Another save holds the lease for this page. The caller should retry in a moment. */
export class ScorecardStoreBusy extends Error {}

/** How long one save may hold the lease before a crashed request's lock is taken over. */
const LOCK_LEASE_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocument(parsed: unknown): StoredScorecardDocument | null {
  if (!isRecord(parsed)) return null;
  const document = parsed;
  if (
    typeof document.slug !== "string" ||
    typeof document.event !== "string" ||
    typeof document.label !== "string" ||
    typeof document.updatedAt !== "string" ||
    !isRecord(document.payload)
  ) {
    return null;
  }
  return {
    slug: document.slug,
    event: document.event,
    label: document.label,
    updatedAt: document.updatedAt,
    updatedBy:
      typeof document.updatedBy === "string" && document.updatedBy.trim()
        ? document.updatedBy.trim()
        : null,
    payload: document.payload,
  };
}

/**
 * The team store. The deployed app has no writable disk, so the document is one JSON object in a
 * private Supabase Storage bucket. The service role stays on the server; the browser never sees it.
 */
export function createSupabaseScorecardStore(
  bucketName = process.env.SCORECARD_BUCKET?.trim() || "scorecard-documents",
): ScorecardStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // Vercel projects in this account use the name SUPABASE_SECRET_ROLE_KEY; accept both names so
  // the deployment does not depend on which one the dashboard operator picked.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ScorecardStoreUnavailable(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_ROLE_KEY).",
    );
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = supabase.storage.from(bucketName);
  let ready: Promise<void> | null = null;

  function ensureBucket(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        const { error } = await supabase.storage.createBucket(bucketName, { public: false });
        if (error && !/already exists|duplicate/i.test(error.message)) {
          throw new ScorecardStoreUnavailable(
            `Could not create the scorecard bucket: ${error.message}`,
          );
        }
      })().catch((error: unknown) => {
        // A network blip must not poison every later save until the server restarts: forget the
        // failed attempt so the next request tries again.
        ready = null;
        throw error instanceof ScorecardStoreUnavailable
          ? error
          : new ScorecardStoreUnavailable(
              `Could not reach Supabase Storage: ${error instanceof Error ? error.message : String(error)}`,
            );
      });
    }
    return ready;
  }

  /** supabase-js returns most failures, but a dropped connection can still throw. */
  async function guarded<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ScorecardStoreUnavailable) throw error;
      throw new ScorecardStoreUnavailable(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const lockPath = (slug: string) => `_locks/${slug}.json`;

  async function readLock(slug: string): Promise<{ nonce: string; at: number } | null> {
    const { data, error } = await guarded("Could not read the scorecard save lock", () =>
      bucket.download(lockPath(slug)),
    );
    if (error || !data) return null;
    try {
      const parsed = JSON.parse(await data.text()) as unknown;
      if (!isRecord(parsed)) return null;
      return {
        nonce: typeof parsed.nonce === "string" ? parsed.nonce : "",
        at: typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * A lock object in the same bucket, created without upsert so the create is the claim. A lease
   * that has run out can be taken over, and the nonce stops a late request from releasing a lock
   * that now belongs to someone else. The document is the only shared state, so this is enough to
   * make the read-merge-write one step without a database table.
   */
  async function acquireLock(slug: string, by: string | null): Promise<string> {
    const path = lockPath(slug);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nonce = randomUUID();
      const body = new Blob([JSON.stringify({ nonce, at: Date.now(), by })], {
        type: "application/json",
      });
      const { error } = await guarded("Could not take the scorecard save lock", () =>
        bucket.upload(path, body, { contentType: "application/json", upsert: false }),
      );
      if (!error) return nonce;
      const duplicate =
        Number(error.statusCode) === 409 || /already exists|duplicate/i.test(error.message);
      if (!duplicate) {
        throw new ScorecardStoreUnavailable(
          `Could not take the scorecard save lock: ${error.message}`,
        );
      }
      const held = await readLock(slug);
      if (!held) continue; // it was released between the two calls
      if (Date.now() - held.at < LOCK_LEASE_MS) {
        throw new ScorecardStoreBusy(
          "Another tabulator is saving this page. Your edits are kept and the save will try again.",
        );
      }
      // The holder stopped answering. Clear the expired lease and try once more.
      await guarded("Could not clear an expired scorecard save lock", () => bucket.remove([path]));
    }
    throw new ScorecardStoreBusy(
      "Another tabulator is saving this page. Your edits are kept and the save will try again.",
    );
  }

  async function releaseLock(slug: string, nonce: string): Promise<void> {
    const held = await readLock(slug);
    if (!held || held.nonce !== nonce) return;
    await bucket.remove([lockPath(slug)]);
  }

  const store: ScorecardStore = {
    async get(slug) {
      await ensureBucket();
      const { data, error } = await guarded("Could not read the scorecard document", () =>
        bucket.download(`${slug}.json`),
      );
      if (error) {
        if (Number(error.statusCode) === 404 || /not found/i.test(error.message)) return null;
        throw new ScorecardStoreUnavailable(
          `Could not read the scorecard document: ${error.message}`,
        );
      }
      const parsed = JSON.parse(await data.text()) as unknown;
      const document = parseDocument(parsed);
      if (!document)
        throw new ScorecardStoreUnavailable("The stored scorecard document is incomplete.");
      return document;
    },
    async list() {
      await ensureBucket();
      const { data, error } = await guarded("Could not list the scorecard documents", () =>
        bucket.list("", { limit: 200 }),
      );
      if (error) {
        throw new ScorecardStoreUnavailable(
          `Could not list the scorecard documents: ${error.message}`,
        );
      }
      const documents: StoredScorecardDocument[] = [];
      for (const entry of data ?? []) {
        if (!entry.name.endsWith(".json")) continue;
        try {
          const { data: file, error: downloadError } = await bucket.download(entry.name);
          if (downloadError || !file) continue;
          const document = parseDocument(JSON.parse(await file.text()) as unknown);
          if (document) documents.push(document);
        } catch {
          // A half-written object is skipped; the rest of the queue still loads.
        }
      }
      return documents;
    },
    async put(input) {
      await ensureBucket();
      const updatedAt = new Date().toISOString();
      const document: StoredScorecardDocument = {
        slug: input.slug,
        event: input.event,
        label: input.label,
        payload: input.payload,
        updatedAt,
        updatedBy: input.updatedBy ?? null,
      };
      const body = new Blob([JSON.stringify(document)], { type: "application/json" });
      const { error } = await guarded("Could not save the scorecard document", () =>
        bucket.upload(`${input.slug}.json`, body, {
          contentType: "application/json",
          upsert: true,
        }),
      );
      if (error) {
        throw new ScorecardStoreUnavailable(
          `Could not save the scorecard document: ${error.message}`,
        );
      }
      return document;
    },
    async locked(slug, by, run) {
      await ensureBucket();
      const nonce = await acquireLock(slug, by);
      try {
        return await run();
      } finally {
        try {
          await releaseLock(slug, nonce);
        } catch {
          // The lease expires on its own; a failed release must not fail the save.
        }
      }
    },
    async snapshot(input) {
      const at = new Date().toISOString();
      const document = await store.get(input.slug);
      if (!document) return { path: null, at };
      const stamp = at.replace(/[:.]/g, "-");
      const path = `snapshots/${input.slug}/${stamp}-${randomUUID().slice(0, 8)}.json`;
      const body = new Blob(
        [JSON.stringify({ reason: input.reason, by: input.by, at, document })],
        { type: "application/json" },
      );
      const { error } = await guarded("Could not keep the scorecard snapshot", () =>
        bucket.upload(path, body, { contentType: "application/json", upsert: false }),
      );
      if (error) {
        throw new ScorecardStoreUnavailable(
          `Could not keep the scorecard snapshot: ${error.message}`,
        );
      }
      return { path, at };
    },
    close() {
      // The Supabase client is stateless for these calls.
    },
  };
  return store;
}

let shared: ScorecardStore | null = null;

/** Next dev reloads modules; keep one store for the process. */
export async function getScorecardStore(): Promise<ScorecardStore> {
  if (!shared) shared = createSupabaseScorecardStore();
  return shared;
}
