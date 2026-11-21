import { headers } from "next/headers";

/**
 * The origin the ops app is being served from, used for the invite and reset redirect links.
 *
 * It is read from the request headers, never from a value the browser sends in an action argument,
 * so a tampered call cannot point the email link at another site. `x-forwarded-host` is what Vercel
 * and most proxies set; `host` is the fallback for a local run.
 */
export function originFromHeaders(bag: Headers): string | null {
  const host = (bag.get("x-forwarded-host") ?? bag.get("host") ?? "").trim();
  if (!host) return null;

  const forwarded = (bag.get("x-forwarded-proto") ?? "").trim().toLowerCase();
  const local =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  const proto =
    forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";

  return `${proto}://${host}`;
}

export async function requestOrigin(): Promise<string | null> {
  const bag = await headers();
  return originFromHeaders(bag);
}
