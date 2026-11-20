/**
 * Base-URL guard for the OpenAI-compatible provider.
 *
 * The server fetches this URL with an API key attached, so a URL pointing at a loopback, private,
 * link-local or cloud-metadata address must never be reachable this way. Here the URL comes from an
 * environment variable rather than a web form, so the DNS-resolution step in OptiFeed's version is
 * not ported: the literal host rules below already refuse the addresses that matter, and a DNS
 * lookup on every turn would add a failure mode to a player's conversation. The `redirect: "error"`
 * option at the fetch keeps a public host from bouncing the request, with its key, somewhere else.
 *
 * Ported from `apps/web/lib/ai-providers/url-safety.ts`.
 */

const MAX_URL_LENGTH = 300;
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::]", "::", "::1", "[::1]"]);

export type BaseUrlCheck = { ok: true; url: string } | { ok: false; error: string };

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export function isPrivateIpv6(host: string): boolean {
  const bare = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (bare === "::" || bare === "::1") return true;
  if (bare.startsWith("fe80:")) return true; // link-local
  if (bare.startsWith("fc") || bare.startsWith("fd")) return true; // unique local
  if (bare.startsWith("fec0:")) return true; // deprecated site-local
  // IPv4-mapped addresses keep the IPv4 rules. `new URL` rewrites `[::ffff:127.0.0.1]` to the hex
  // form `[::ffff:7f00:1]`, so both forms are read here.
  const mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  const mappedHex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex?.[1] && mappedHex[2]) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

export function checkProviderBaseUrl(raw: string): BaseUrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "The provider base URL is empty." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: `The base URL must be at most ${MAX_URL_LENGTH} characters.` };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "The provider base URL is not a valid URL." };
  }

  if (url.protocol !== "https:") return { ok: false, error: "The base URL must use https." };
  if (url.username || url.password) {
    return { ok: false, error: "The base URL must not carry credentials." };
  }
  if (url.hash) return { ok: false, error: "Remove the fragment from the base URL." };

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, error: "The base URL is a local address." };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, error: "The base URL is a local address." };
  }
  if (host.includes(":") ? isPrivateIpv6(host) : isPrivateIpv4(host)) {
    return { ok: false, error: "The base URL is a private address." };
  }

  return { ok: true, url: url.toString().replace(/\/+$/, "") };
}

/** Chat-completions endpoint for an OpenAI-compatible base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}
