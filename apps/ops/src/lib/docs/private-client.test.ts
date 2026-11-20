import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  DOC_CHANNEL_PREFIX,
  privateDocChannelName,
  withPrivateDocChannels,
} from "./private-client";

type ChannelCall = { name: string; options: Record<string, unknown> | undefined };

function fakeClient() {
  const calls: ChannelCall[] = [];
  const client = {
    channel(name: string, options?: Record<string, unknown>) {
      calls.push({ name, options });
      return { name, options };
    },
    removeChannel: (channel: unknown) => channel,
    auth: { token: "not-a-real-token" },
    sum(a: number, b: number) {
      return a + b;
    },
  };
  return { client, calls };
}

describe("privateDocChannelName", () => {
  it("prefixes a bare name and does not double an existing prefix", () => {
    expect(privateDocChannelName("doc-1")).toBe(`${DOC_CHANNEL_PREFIX}doc-1`);
    expect(privateDocChannelName("ws:doc:doc-1")).toBe("ws:doc:doc-1");
  });
});

describe("withPrivateDocChannels", () => {
  it("opens every channel private and prefixed", () => {
    const { client, calls } = fakeClient();
    const wrapped = withPrivateDocChannels(client as unknown as SupabaseClient);
    wrapped.channel("a");
    wrapped.channel("b", { config: { broadcast: { self: true } } });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe("ws:doc:a");
    expect(calls[0]?.options).toEqual({ config: { private: true } });
    expect(calls[1]?.name).toBe("ws:doc:b");
    expect(calls[1]?.options).toEqual({
      config: { broadcast: { self: true }, private: true },
    });
  });

  it("overrides a false private flag", () => {
    const { client, calls } = fakeClient();
    const wrapped = withPrivateDocChannels(client as unknown as SupabaseClient);
    wrapped.channel("c", { config: { private: false } });
    expect(calls[0]?.options).toEqual({ config: { private: true } });
  });

  it("passes other properties and methods through", () => {
    const { client } = fakeClient();
    const wrapped = withPrivateDocChannels(
      client as unknown as SupabaseClient & { sum(a: number, b: number): number },
    );
    const channel = {} as RealtimeChannel;
    expect(wrapped.removeChannel(channel)).toBe(channel);
    expect(wrapped.auth).toEqual({ token: "not-a-real-token" });
    expect((wrapped as unknown as { sum(a: number, b: number): number }).sum(2, 3)).toBe(5);
  });
});
