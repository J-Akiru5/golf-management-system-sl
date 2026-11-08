import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The pages worth indexing: the product page, the published pairings, the player roster and the NGAP
 * FAQ.
 *
 * Entry links (`/enter/…`) are left out on purpose. They are per-event, time-limited and mostly a
 * form, so the site keeps a small, durable index instead of one that churns with every event.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pairings`, lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/roster`, lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/faq`, lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
