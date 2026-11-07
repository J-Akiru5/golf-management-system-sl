import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  markNotificationRead,
  markNotificationsRead,
  pendingRegistrationCount,
} from "./notifications";

type Result = { count: number | null; error: { message: string } | null };

type RpcResult = { data: number | null; error: { message: string } | null };

function fakeRpcClient(result: RpcResult) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

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

describe("marking one alert as read", () => {
  it("calls the singular function with the alert id and returns the count", async () => {
    const { client, calls } = fakeRpcClient({ data: 1, error: null });
    await expect(markNotificationRead(client, "alert-9")).resolves.toBe(1);
    expect(calls).toEqual([{ fn: "mark_notification_read", args: { p_notification: "alert-9" } }]);
  });

  it("throws the server message when the alert cannot be marked", async () => {
    const { client } = fakeRpcClient({ data: null, error: { message: "Notification not found" } });
    await expect(markNotificationRead(client, "alert-9")).rejects.toThrow(
      "Could not mark the alert as read: Notification not found",
    );
  });
});

describe("marking every outstanding alert as read", () => {
  it("calls the plural function with the event id and returns the count", async () => {
    const { client, calls } = fakeRpcClient({ data: 4, error: null });
    await expect(markNotificationsRead(client, "event-1")).resolves.toBe(4);
    expect(calls).toEqual([{ fn: "mark_notifications_read", args: { p_tournament: "event-1" } }]);
  });

  it("throws the server message when the notices cannot be dismissed", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { message: "Not a member of this club" },
    });
    await expect(markNotificationsRead(client, "event-1")).rejects.toThrow(
      "Could not dismiss notices: Not a member of this club",
    );
  });
});
