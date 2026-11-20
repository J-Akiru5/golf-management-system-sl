import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The sitemap's `lastmod` is the build date, not the moment of the request.
 *
 * A date that moves on every fetch teaches a crawler to ignore it. `NEXT_PUBLIC_APP_BUILT` is written
 * by `next.config.ts` at build time, so it only moves when the site is actually built again; a local
 * run without it simply carries no `lastmod`, which is valid.
 */
const BUILT = process.env.NEXT_PUBLIC_APP_BUILT?.trim();
const LAST_MODIFIED = BUILT ? new Date(`${BUILT}T00:00:00Z`) : undefined;

function page(
  path: string,
  changeFrequency: "daily" | "weekly" | "monthly",
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${path}`,
    ...(LAST_MODIFIED ? { lastModified: LAST_MODIFIED } : {}),
    changeFrequency,
    priority,
  };
}

/**
 * The pages worth indexing: the product page, the published pairings, the player roster, the
 * leaderboard, the tournament rules and the NGAP FAQ.
 *
 * Entry links (`/enter/…`) are left out on purpose. They are per-event, time-limited and mostly a
 * form, so the site keeps a small, durable index instead of one that churns with every event. The
 * leaderboard is in because it is the page a member searches for during an event, and it only ever
 * shows what the desk has published.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    page("/", "weekly", 1),
    page("/pairings", "daily", 0.8),
    page("/roster", "daily", 0.8),
    page("/leaderboard", "daily", 0.8),
    page("/rules", "monthly", 0.8),
    page("/faq", "monthly", 0.7),
  ];
}
