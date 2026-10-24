import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

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
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/calendar",
          "/players",
          "/caddies",
          "/audit",
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
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
