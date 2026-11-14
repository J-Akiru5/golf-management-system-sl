import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UploadResult = { error: { statusCode?: string; message: string } | null };
type DownloadResult = {
  data: { text: () => Promise<string> } | null;
  error: { statusCode?: string; message: string } | null;
};

const createBucket =
  vi.fn<(name: string, options?: { public?: boolean }) => Promise<UploadResult>>();
const upload =
  vi.fn<(path: string, body: Blob, options?: { upsert?: boolean }) => Promise<UploadResult>>();
const download = vi.fn<(path: string) => Promise<DownloadResult>>();
const remove = vi.fn<(paths: string[]) => Promise<{ data: unknown[]; error: null }>>();
const list =
  vi.fn<
    (
      path: string,
      options?: { limit?: number },
    ) => Promise<{ data: { name: string }[]; error: null }>
  >();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { createBucket, from: () => ({ upload, download, remove, list }) },
  }),
}));

import {
  createSupabaseScorecardStore,
  ScorecardStoreBusy,
  ScorecardStoreUnavailable,
} from "./store";

const files = new Map<string, string>();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  files.clear();
  createBucket.mockReset().mockResolvedValue({ error: null });
  upload.mockReset().mockImplementation(async (path, body, options) => {
    if (files.has(path) && !options?.upsert) {
      return { error: { statusCode: "409", message: "The resource already exists" } };
    }
    files.set(path, await body.text());
    return { error: null };
  });
  download.mockReset().mockImplementation(async (path) => {
    const text = files.get(path);
    if (text === undefined) {
      return { data: null, error: { statusCode: "404", message: "not found" } };
    }
    return { data: { text: async () => text }, error: null };
  });
  remove.mockReset().mockImplementation(async (paths) => {
    for (const path of paths) files.delete(path);
    return { data: [], error: null };
  });
  list.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const input = {
  slug: "day1am-r5",
  event: "24th Bamboo Tee",
  label: "Day 1 AM",
  payload: { cards: [] },
};

const lockPath = "_locks/day1am-r5.json";

describe("createSupabaseScorecardStore", () => {
  it("says what to set when Supabase is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createSupabaseScorecardStore()).toThrow(ScorecardStoreUnavailable);
  });

  it("saves once the bucket exists, treating 'already exists' as success", async () => {
    createBucket.mockResolvedValue({ error: { message: "The resource already exists" } });
    const store = createSupabaseScorecardStore();
    const saved = await store.put(input);
    expect(saved.slug).toBe("day1am-r5");
    expect(saved.updatedBy).toBeNull();
    expect(files.has("day1am-r5.json")).toBe(true);
  });

  it("retries the bucket check after a dropped connection instead of failing forever", async () => {
    createBucket.mockRejectedValueOnce(new Error("fetch failed"));
    const store = createSupabaseScorecardStore();
    await expect(store.put(input)).rejects.toBeInstanceOf(ScorecardStoreUnavailable);
    await expect(store.put(input)).resolves.toMatchObject({ slug: "day1am-r5" });
    expect(createBucket).toHaveBeenCalledTimes(2);
  });

  it("reports an upload that throws as a store error, not a bare crash", async () => {
    upload.mockRejectedValue(new Error("socket hang up"));
    const store = createSupabaseScorecardStore();
    await expect(store.put(input)).rejects.toThrow(/socket hang up/);
  });

  it("records who saved the shared copy", async () => {
    const store = createSupabaseScorecardStore();
    await store.put({ ...input, updatedBy: "maria@example.com" });
    const saved = await store.get(input.slug);
    expect(saved?.updatedBy).toBe("maria@example.com");
  });

  it("reads an older document as having no author", async () => {
    files.set(
      "day1am-r5.json",
      JSON.stringify({
        slug: input.slug,
        event: input.event,
        label: input.label,
        updatedAt: "2026-11-14T00:00:00.000Z",
        payload: { cards: [] },
      }),
    );
    const saved = await createSupabaseScorecardStore().get(input.slug);
    expect(saved?.updatedBy).toBeNull();
  });

  it("holds a lease for the whole read-merge-write and releases it after", async () => {
    const store = createSupabaseScorecardStore();
    const ran = await store.locked(input.slug, "maria@example.com", async () => {
      expect(files.has(lockPath)).toBe(true);
      return "done";
    });
    expect(ran).toBe("done");
    expect(files.has(lockPath)).toBe(false);
  });

  it("refuses a save while another lease is fresh", async () => {
    files.set(lockPath, JSON.stringify({ nonce: "other", at: Date.now() }));
    const store = createSupabaseScorecardStore();
    await expect(
      store.locked(input.slug, "maria@example.com", async () => "done"),
    ).rejects.toBeInstanceOf(ScorecardStoreBusy);
    expect(files.has(lockPath)).toBe(true);
  });

  it("takes over a lease whose holder stopped answering", async () => {
    files.set(lockPath, JSON.stringify({ nonce: "gone", at: Date.now() - 60_000 }));
    const store = createSupabaseScorecardStore();
    const ran = await store.locked(input.slug, "maria@example.com", async () => "done");
    expect(ran).toBe("done");
    expect(files.has(lockPath)).toBe(false);
  });

  it("keeps the shared copy aside before a reset", async () => {
    const store = createSupabaseScorecardStore();
    await store.put(input);
    const snapshot = await store.snapshot({
      slug: input.slug,
      reason: "before reset to the first reading",
      by: "maria@example.com",
    });
    expect(snapshot.path).toMatch(/^snapshots\/day1am-r5\/.+\.json$/);
    const saved = JSON.parse(files.get(snapshot.path ?? "") ?? "{}") as {
      reason: string;
      by: string;
      document: { slug: string };
    };
    expect(saved.reason).toBe("before reset to the first reading");
    expect(saved.by).toBe("maria@example.com");
    expect(saved.document.slug).toBe("day1am-r5");
  });

  it("has nothing to snapshot before the first save", async () => {
    const snapshot = await createSupabaseScorecardStore().snapshot({
      slug: input.slug,
      reason: "before reset",
      by: null,
    });
    expect(snapshot.path).toBeNull();
  });
});
