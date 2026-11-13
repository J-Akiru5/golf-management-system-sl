import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared public cache, proved without a session or a live project.
 *
 * `next/cache` is replaced by a cache with the same contract the module relies on: a read is kept
 * under its key with its tags, a second read answers from it, and clearing the tag drops it. The
 * database is replaced by one advisory whose text the test changes. Everything else is real: the
 * loader, the cache module, the revalidate endpoint and the client helper the desk uses.
 */

const fake = vi.hoisted(() => {
  const entries = new Map<string, { value: unknown; tags: string[] }>();
  return {
    entries,
    advisory: null as unknown,
    reads: 0,
    reset() {
      entries.clear();
      this.advisory = null;
      this.reads = 0;
    },
    cacheRead<T>(read: () => Promise<T>, keys: string[], options?: { tags?: string[] }) {
      const key = keys.join("|");
      const tags = options?.tags ?? [];
      return async (): Promise<T> => {
        const hit = entries.get(key);
        if (hit) return hit.value as T;
        const value = await read();
        entries.set(key, { value, tags });
        return value;
      };
    },
    clear(tag: string) {
      let dropped = 0;
      for (const [key, entry] of entries) {
        if (!entry.tags.includes(tag)) continue;
        entries.delete(key);
        dropped += 1;
      }
      return dropped;
    },
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>, keys: string[], options?: { tags?: string[] }) =>
    fake.cacheRead(read, keys, options),
  revalidateTag: (tag: string) => fake.clear(tag),
  revalidatePath: () => undefined,
}));

/** The anonymous client: one advisory, read as often as the test asks. */
vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    rpc: async (name: string) => {
      if (name !== "public_advisory") throw new Error(`Unexpected read: ${name}`);
      fake.reads += 1;
      return { data: fake.advisory, error: null };
    },
  }),
}));

/** The route's own client: a signed-in organizer, whichever token it is given. */
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnvironment: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
  isSupabaseConfigured: () => true,
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { POST } from "@/app/api/revalidate-pairings/route";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { PUBLIC_DATA_TAG, readPublicAdvisory } from "@/lib/data/supabase/public-cache";
import type { Database } from "@/lib/supabase/types";

const advisory = (title: string) => ({
  show: true,
  title,
  lines: ["Tee times are confirmed for Day 1."],
  signature: "Tournament committee",
  until: "2026-12-31",
});

/** The desk's session, as far as the helper can tell. */
const deskClient = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
  },
} as unknown as SupabaseClient<Database>;

beforeEach(() => {
  fake.reset();
});

describe("the shared public reads", () => {
  it("answers from the cache until the tag is cleared, then reads the database again", async () => {
    fake.advisory = advisory("First notice");
    expect((await readPublicAdvisory())?.title).toBe("First notice");
    expect(fake.reads).toBe(1);

    // The database moved on. Nothing has told the cache, so the cached copy is still served and
    // the database is not asked again.
    fake.advisory = advisory("Second notice");
    expect((await readPublicAdvisory())?.title).toBe("First notice");
    expect(fake.reads).toBe(1);
  });

  it("drops a cached value when its tag is cleared", async () => {
    fake.advisory = advisory("First notice");
    await readPublicAdvisory();

    fake.advisory = advisory("Second notice");
    fake.clear(PUBLIC_DATA_TAG);

    expect((await readPublicAdvisory())?.title).toBe("Second notice");
    expect(fake.reads).toBe(2);
  });

  it("keys each event separately, so one event cannot answer for another", async () => {
    fake.advisory = advisory("This event");
    await readPublicAdvisory("event-a");

    fake.advisory = advisory("Other event");
    expect((await readPublicAdvisory("event-b"))?.title).toBe("Other event");
    expect((await readPublicAdvisory("event-a"))?.title).toBe("This event");
  });
});

describe("clearing the cache after a desk write", () => {
  it("a write's refresh goes through the endpoint and the next read is fresh", async () => {
    fake.advisory = advisory("Before the write");
    await readPublicAdvisory();
    expect(fake.reads).toBe(1);

    fake.advisory = advisory("After the write");
    const posted: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      posted.push(url);
      return POST(new Request(`http://localhost${url}`, init));
    }) as typeof fetch;

    try {
      await refreshPublicPage(deskClient);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(posted).toEqual(["/api/revalidate-pairings"]);
    expect((await readPublicAdvisory())?.title).toBe("After the write");
    expect(fake.reads).toBe(2);
  });

  it("sends nothing when the session carries no token", async () => {
    fake.advisory = advisory("Still here");
    await readPublicAdvisory();

    const posted: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      posted.push(String(input));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try {
      await refreshPublicPage({
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as unknown as SupabaseClient<Database>);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(posted).toEqual([]);
    expect((await readPublicAdvisory())?.title).toBe("Still here");
  });

  it("collapses a burst of writes into one request", async () => {
    let requests = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      requests += 1;
      // Hold the first request open so the others arrive while it is in flight.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await Promise.all([
        refreshPublicPage(deskClient),
        refreshPublicPage(deskClient),
        refreshPublicPage(deskClient),
      ]);
    } finally {
      globalThis.fetch = realFetch;
    }

    // One request in flight at a time, plus one more because a write arrived while it was open.
    expect(requests).toBe(2);
  });
});
