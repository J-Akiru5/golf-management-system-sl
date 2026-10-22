import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { pendingRegistrationCount } from "./notifications";

type Result = { count: number | null; error: { message: string } | null };

function fakeClient(result: Result) {
  const calls: string[] = [];
  const chain = {
    select(columns: string, options: { count: string; head: boolean }) {
      calls.push(`select(${columns}, ${options.count}, head=${options.head})`);
      return chain;
    },
    eq(column: string, value: string) {
      calls.push(`${column}=${value}`);
      return chain;
    },
    // PostgREST builders are thenable; awaiting the chain resolves the count.
    then(onFulfilled: (value: Result) => unknown) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  const client = {
    from(table: string) {
      calls.push(`from(${table})`);
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe("pending registration count", () => {
  it("asks only for this event's entries still waiting at the desk", async () => {
    const { client, calls } = fakeClient({ count: 3, error: null });
    await expect(pendingRegistrationCount(client, "event-1")).resolves.toBe(3);
    expect(calls).toEqual([
      "from(registrations)",
      "select(id, exact, head=true)",
      "tournament_id=event-1",
      "status=needs_review",
    ]);
  });

  it("returns null when the read fails, so the bell cannot claim zero new entries", async () => {
    const { client } = fakeClient({ count: null, error: { message: "nope" } });
    await expect(pendingRegistrationCount(client, "event-1")).resolves.toBeNull();
  });
});
