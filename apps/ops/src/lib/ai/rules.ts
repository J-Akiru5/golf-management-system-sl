/**
 * Validation for the AI providers screen.
 *
 * The database repeats these checks, because a server action can be called directly. Keeping them
 * here as well gives the owner a plain sentence before a round trip. Nothing here reads or writes a
 * secret.
 */

import { type AiProviderId, isAiProviderId, isReasoningEffort } from "./providers";

export const MIN_REASON = 10;
export const MIN_KEY_LENGTH = 8;
export const MAX_KEY_LENGTH = 512;
const MAX_MODEL_LENGTH = 100;
const MAX_URL_LENGTH = 300;

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::]", "::", "::1", "[::1]"]);

export function checkReason(reason: string): string | null {
  if (reason.trim().length < MIN_REASON) {
    return `Give a reason of at least ${MIN_REASON} characters. It is recorded in the audit log.`;
  }
  return null;
}

export function checkModel(model: string): string | null {
  if (model.trim().length > MAX_MODEL_LENGTH) {
    return `The model name must be at most ${MAX_MODEL_LENGTH} characters.`;
  }
  return null;
}

export function checkPriority(priority: number): string | null {
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
    return "Priority must be a whole number between 0 and 1000.";
  }
  return null;
}

export function checkApiKeyEnv(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  if (!/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
    return "The key variable must be an upper-case name such as GEMINI_API_KEY, not a key value.";
  }
  return null;
}

export function checkReasoningEffort(value: unknown): string | null {
  if (!isReasoningEffort(value)) return "Choose a reasoning effort.";
  return null;
}

export function checkProviderId(value: unknown): value is AiProviderId {
  return isAiProviderId(value);
}

export function checkProviderKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed.length < MIN_KEY_LENGTH || trimmed.length > MAX_KEY_LENGTH) {
    return `The key must be between ${MIN_KEY_LENGTH} and ${MAX_KEY_LENGTH} characters.`;
  }
  if (/\s/.test(trimmed)) return "The key must not contain spaces or line breaks.";
  return null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return a >= 224;
}

function isPrivateIpv6(host: string): boolean {
  const bare = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (bare === "::" || bare === "::1") return true;
  if (bare.startsWith("fe80:")) return true;
  if (bare.startsWith("fc") || bare.startsWith("fd")) return true;
  if (bare.startsWith("fec0:")) return true;
  const mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return mapped?.[1] ? isPrivateIpv4(mapped[1]) : false;
}

export type BaseUrlResult = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * The base URL is fetched later by the golf app with an API key attached, so a loopback, private,
 * link-local or metadata address is refused here too. The golf app repeats the check before use.
 */
export function checkBaseUrl(provider: AiProviderId, raw: string | null): BaseUrlResult {
  const trimmed = (raw ?? "").trim();
  if (provider !== "openai_compat") {
    if (trimmed !== "") {
      return { ok: false, message: "Only the OpenAI-compatible provider takes a base URL." };
    }
    return { ok: true, value: null };
  }
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, message: `The base URL must be at most ${MAX_URL_LENGTH} characters.` };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "The base URL is not a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "The base URL must use https." };
  }
  if (url.username || url.password) {
    return { ok: false, message: "The base URL must not carry credentials." };
  }
  if (url.hash) return { ok: false, message: "Remove the fragment from the base URL." };

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, message: "The base URL is a local address." };
  }
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, message: "The base URL is a local address." };
  }
  if (host.includes(":") ? isPrivateIpv6(host) : isPrivateIpv4(host)) {
    return { ok: false, message: "The base URL is a private address." };
  }

  return { ok: true, value: url.toString().replace(/\/+$/, "") };
}

/** Never let a provider echo the key into the screen or a log. */
export function sanitiseProviderError(error: unknown, apiKey: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutKey = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
  return withoutKey.replace(/\s+/g, " ").trim().slice(0, 300) || "The provider rejected the key.";
}
