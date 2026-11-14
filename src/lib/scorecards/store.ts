import { createClient } from "@supabase/supabase-js";

export interface StoredScorecardDocument {
  slug: string;
  event: string;
  label: string;
  payload: Record<string, unknown>;
  updatedAt: string;
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
  }): Promise<StoredScorecardDocument>;
  close(): void;
}

export class ScorecardStoreUnavailable extends Error {}

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

  return {
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
      const text = await data.text();
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new ScorecardStoreUnavailable("The stored scorecard document is not an object.");
      }
      const document = parsed as Record<string, unknown>;
      if (
        typeof document.slug !== "string" ||
        typeof document.event !== "string" ||
        typeof document.label !== "string" ||
        typeof document.updatedAt !== "string" ||
        typeof document.payload !== "object" ||
        document.payload === null
      ) {
        throw new ScorecardStoreUnavailable("The stored scorecard document is incomplete.");
      }
      return document as unknown as StoredScorecardDocument;
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
          const parsed = JSON.parse(await file.text()) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
          const document = parsed as Record<string, unknown>;
          if (
            typeof document.slug !== "string" ||
            typeof document.event !== "string" ||
            typeof document.label !== "string" ||
            typeof document.updatedAt !== "string" ||
            typeof document.payload !== "object" ||
            document.payload === null
          ) {
            continue;
          }
          documents.push(document as unknown as StoredScorecardDocument);
        } catch {
          // A half-written object is skipped; the rest of the queue still loads.
        }
      }
      return documents;
    },
    async put(input) {
      await ensureBucket();
      const updatedAt = new Date().toISOString();
      const document: StoredScorecardDocument = { ...input, updatedAt };
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
    close() {
      // The Supabase client is stateless for these calls.
    },
  };
}

let shared: ScorecardStore | null = null;

/** Next dev reloads modules; keep one store for the process. */
export async function getScorecardStore(): Promise<ScorecardStore> {
  if (!shared) shared = createSupabaseScorecardStore();
  return shared;
}
