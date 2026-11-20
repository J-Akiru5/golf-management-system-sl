import type {
  RealtimeChannel,
  RealtimeChannelOptions,
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * The document channel prefix. SPEC section 6: every document channel is `ws:doc:<id>` and private.
 * The Yjs provider cannot open a private channel itself, so this wrapper does it.
 */
export const DOC_CHANNEL_PREFIX = "ws:doc:";

export function privateDocChannelName(name: string): string {
  return name.startsWith(DOC_CHANNEL_PREFIX) ? name : `${DOC_CHANNEL_PREFIX}${name}`;
}

/**
 * Returns the same client with one change: `channel()` always opens a private `ws:doc:` channel.
 * Everything else passes through untouched. This is a wrapper, not a provider.
 */
export function withPrivateDocChannels<T extends SupabaseClient>(client: T): T {
  return new Proxy(client, {
    get(target, property) {
      if (property === "channel") {
        return (name: string, options?: RealtimeChannelOptions): RealtimeChannel =>
          target.channel(privateDocChannelName(name), {
            ...options,
            config: { ...options?.config, private: true },
          });
      }
      // Reflect without the proxy receiver: a getter that reads a private field must run on the
      // real client, not on this wrapper.
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
