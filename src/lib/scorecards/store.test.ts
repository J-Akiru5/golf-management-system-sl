import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBucket = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const list = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { createBucket, from: () => ({ upload, download, list }) },
  }),
}));

import { createSupabaseScorecardStore, ScorecardStoreUnavailable } from "./store";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  createBucket.mockReset();
  upload.mockReset();
  download.mockReset();
  list.mockReset();
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

describe("createSupabaseScorecardStore", () => {
  it("says what to set when Supabase is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createSupabaseScorecardStore()).toThrow(ScorecardStoreUnavailable);
  });

  it("saves once the bucket exists, treating 'already exists' as success", async () => {
    createBucket.mockResolvedValue({ error: { message: "The resource already exists" } });
    upload.mockResolvedValue({ error: null });
    const store = createSupabaseScorecardStore();
    const saved = await store.put(input);
    expect(saved.slug).toBe("day1am-r5");
    expect(upload).toHaveBeenCalledOnce();
  });

  it("retries the bucket check after a dropped connection instead of failing forever", async () => {
    createBucket.mockRejectedValueOnce(new Error("fetch failed"));
    createBucket.mockResolvedValue({ error: null });
    upload.mockResolvedValue({ error: null });
    const store = createSupabaseScorecardStore();
    await expect(store.put(input)).rejects.toBeInstanceOf(ScorecardStoreUnavailable);
    await expect(store.put(input)).resolves.toMatchObject({ slug: "day1am-r5" });
    expect(createBucket).toHaveBeenCalledTimes(2);
  });

  it("reports an upload that throws as a store error, not a bare crash", async () => {
    createBucket.mockResolvedValue({ error: null });
    upload.mockRejectedValue(new Error("socket hang up"));
    const store = createSupabaseScorecardStore();
    await expect(store.put(input)).rejects.toThrow(/socket hang up/);
  });

  it("lists the saved day documents and skips a broken object", async () => {
    createBucket.mockResolvedValue({ error: null });
    list.mockResolvedValue({
      data: [{ name: "day1am-r5.json" }, { name: "day2pm.json" }, { name: "notes.txt" }],
      error: null,
    });
    download.mockImplementation((name: string) =>
      Promise.resolve({
        data: new Blob([
          name === "day1am-r5.json"
            ? JSON.stringify({
                ...input,
                updatedAt: "2026-11-14T00:00:00.000Z",
                payload: { submission: { at: "2026-11-14T00:00:00.000Z" } },
              })
            : JSON.stringify({ broken: true }),
        ]),
        error: null,
      }),
    );
    const store = createSupabaseScorecardStore();
    const documents = await store.list();
    expect(documents.map((document) => document.slug)).toEqual(["day1am-r5"]);
    expect(list).toHaveBeenCalledWith("", { limit: 200 });
  });
});
