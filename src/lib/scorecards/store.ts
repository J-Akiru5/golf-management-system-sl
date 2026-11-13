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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ScorecardStoreUnavailable(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
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
      })();
    }
    return ready;
  }

  return {
    async get(slug) {
      await ensureBucket();
      const { data, error } = await bucket.download(`${slug}.json`);
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
    async put(input) {
      await ensureBucket();
      const updatedAt = new Date().toISOString();
      const document: StoredScorecardDocument = { ...input, updatedAt };
      const body = new Blob([JSON.stringify(document)], { type: "application/json" });
      const { error } = await bucket.upload(`${input.slug}.json`, body, {
        contentType: "application/json",
        upsert: true,
      });
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
