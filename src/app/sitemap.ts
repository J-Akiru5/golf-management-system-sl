import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The pages worth indexing: the product page, the event portfolio, the published pairings, the
 * player roster, the tournament rules and the NGAP FAQ.
 *
 * `/rules` stays listed because it still resolves: it forwards to the event that has rules. Entry
 * links (`/enter/…`) are left out on purpose. They are per-event, time-limited and mostly a form, so
 * the site keeps a small, durable index instead of one that churns with every event.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/demo`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/events`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/pairings`, lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/roster`, lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/rules`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/faq`, lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
