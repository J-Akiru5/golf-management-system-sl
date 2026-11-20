import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Everything behind sign-in, plus the API. One list, used by every crawler group below, so the
 * wildcard rule and the AI rules can never disagree about what is private.
 */
const PRIVATE_PATHS = [
  "/admin",
  "/calendar",
  "/players",
  "/caddies",
  "/audit",
  "/feedback-inbox",
  "/register",
  "/tee-times",
  "/import",
  "/draw",
  "/print",
  "/print-preview",
  "/setup",
  "/course",
  "/tournaments",
  "/spotlight",
  "/scores",
  "/my",
  "/login",
  "/api/",
];

/**
 * The answer engines and AI crawlers, named one by one.
 *
 * A wildcard rule already covers them, but naming them is what a crawl policy is read as: these
 * agents are welcome on the public pages and closed to the private ones. Nothing here is a ranking
 * trick; it states the same policy `llms.txt` describes, so a person reading the file can see it.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "CCBot",
];

/**
 * Crawl rules. The public pages are open; everything behind sign-in is closed to crawlers, and the
 * sitemap is pointed at the canonical host.
 *
 * `/enter/…` is deliberately NOT disallowed: those pages send `noindex`, and a crawler must be able
 * to fetch a page to see that instruction. Disallowing them would leave the URLs eligible to be
 * indexed from links elsewhere.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
      { userAgent: [...AI_CRAWLERS], allow: "/", disallow: [...PRIVATE_PATHS] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
