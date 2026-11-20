/**
 * The site's canonical identity and its structured data.
 *
 * One place for the URL, the company facts and the JSON-LD builders, so the metadata, the sitemap,
 * robots and the schemas cannot drift apart. Everything here is plain data with no Next runtime
 * dependencies, which is what lets the tests pin it.
 *
 * Naming: the product is TeeLine Golf; the company that operates it is MDM Digital, Media &
 * Technology Services (the facts below come from mdmevents.org). The club is deliberately not named
 * in metadata or structured data: the owner asked for TeeLine Golf only.
 */

/** The canonical host. Override with NEXT_PUBLIC_SITE_URL; the fallback is the production domain. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://golf.syntaxure.dev"
).replace(/\/+$/, "");

export const SITE_NAME = "TeeLine Golf";
export const SITE_TAGLINE = "Every round, beautifully organized";
export const SITE_DESCRIPTION =
  "TeeLine Golf is golf tournament management for clubs in the Philippines: player entries, handicap-based flights, the draw, published pairings and printed start sheets in one place.";

export const OG_IMAGE = {
  url: "/og/teeline-og.jpg",
  width: 1200,
  height: 630,
  alt: "TeeLine Golf: every round, beautifully organized. A fairway at dawn with a golfer walking towards the green.",
} as const;

/** The company that operates the product, as published on its own site. */
export const COMPANY = {
  name: "MDM Digital, Media & Technology Services",
  alternateName: "MDM Events",
  url: "https://mdmevents.org/",
  email: "hello@mdmevents.org",
  telephone: "+63 908 895 4818",
  address: {
    streetAddress: "56 Quezon St., Arevalo",
    addressLocality: "Iloilo City",
    addressRegion: "Iloilo",
    addressCountry: "PH",
  },
  description:
    "MDM Digital, Media & Technology Services empowers organizations to innovate, connect and grow through technology, creativity and digital transformation.",
} as const;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Search Console, Bing and any other engine that verifies with a meta tag.
 *
 * The token is the engine's own string, so it belongs to the owner, not to the repository: it is read
 * from the deployment's environment and simply omitted when it is not set, which keeps a fresh
 * checkout and a preview deployment building without it. `NEXT_PUBLIC_` because the tag it produces
 * is public by nature: a crawler has to read it.
 */
export interface SiteVerification {
  google?: string;
  other?: Record<string, string>;
}

export function siteVerification(
  env: Record<string, string | undefined> = process.env,
): SiteVerification | undefined {
  const google = env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const bing = env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();
  const other: Record<string, string> = {};
  // Bing Webmaster Tools verifies with this exact key.
  if (bing) other["msvalidate.01"] = bing;
  if (!google && Object.keys(other).length === 0) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

/** The Open Graph object every public page shares, with only the title, description and path varying. */
export function openGraphFor({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    locale: "en_PH",
    title,
    description,
    url: path,
    images: [OG_IMAGE],
  };
}

/** The large-image card, matching the Open Graph object above. */
export function twitterFor({ title, description }: { title: string; description: string }) {
  return {
    card: "summary_large_image" as const,
    title,
    description,
    images: [OG_IMAGE.url],
  };
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

/** Who runs the product, where, and how to reach them. */
export function organizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: COMPANY.name,
    alternateName: COMPANY.alternateName,
    url: COMPANY.url,
    email: COMPANY.email,
    telephone: COMPANY.telephone,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address.streetAddress,
      addressLocality: COMPANY.address.addressLocality,
      addressRegion: COMPANY.address.addressRegion,
      addressCountry: COMPANY.address.addressCountry,
    },
    areaServed: [
      { "@type": "Country", name: "Philippines" },
      { "@type": "AdministrativeArea", name: "Western Visayas" },
    ],
    description: COMPANY.description,
    // A logo is what an entity needs to be recognised rather than merely read. The app icon is the
    // brand mark and it is raster, which is what the engines accept.
    logo: absoluteUrl("/icons/icon-512.png"),
    image: absoluteUrl(OG_IMAGE.url),
    brand: { "@type": "Brand", name: SITE_NAME },
  };
}

/**
 * A golf tournament, as the event entity the public pages describe.
 *
 * Built only from what the event itself publishes: its name and its playing dates. No venue name, no
 * attendance claim, no status the page does not state. `eventStatus` is left out on purpose, because
 * schema.org has no "finished" value and the honest thing after the last day is silence, not
 * `EventScheduled`.
 */
export function sportsEventSchema({
  id,
  name,
  dates,
}: {
  id: string;
  name: string;
  dates: readonly string[];
}): Record<string, unknown> | null {
  const start = dates[0];
  const end = dates.at(-1);
  if (!name.trim() || !start || !end) return null;
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${SITE_URL}/#event-${id}`,
    name,
    startDate: start,
    endDate: end,
    sport: "Golf",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    // The town the club plays in, as the Conditions of Play state it. The club itself is not named.
    location: {
      "@type": "Place",
      name: "Santa Barbara, Iloilo",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Santa Barbara",
        addressRegion: "Iloilo",
        addressCountry: "PH",
      },
    },
    organizer: { "@id": ORGANIZATION_ID },
    url: absoluteUrl("/rules"),
    description: `${name}: published pairings, results and the Conditions of Play.`,
  };
}

/** The site itself, so answer engines can attach pages to one entity. */
export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en-PH",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * One public page as an entity, so an answer engine can attach a description and a publisher to the
 * page it is reading instead of to the site as a whole. `CollectionPage` is the honest type for the
 * lists (pairings, roster, leaderboard); `WebPage` for the prose pages.
 */
export function webPageSchema({
  path,
  name,
  description,
  type = "WebPage",
}: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "CollectionPage";
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name,
    description,
    inLanguage: "en-PH",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: absoluteUrl(OG_IMAGE.url),
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
      caption: OG_IMAGE.alt,
    },
  };
}

/** The product. `applicationCategory` is the one schema.org uses for sports software. */
export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "SportsApplication",
    applicationSubCategory: "Golf tournament management",
    operatingSystem: "Web",
    inLanguage: ["en-PH"],
    image: absoluteUrl(OG_IMAGE.url),
    publisher: { "@id": ORGANIZATION_ID },
    featureList: [
      "Player registration and entry review",
      "Handicap import from the NGAP export",
      "Categories, flights and an automatic draw",
      "Published pairings with a version number",
      "Start sheets, pairings and scorecards for printing",
      "Course data confirmation and placeholder marks",
      "Player sign-in with a private entry page",
    ],
  };
}

export interface FaqEntry {
  question: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
}

/**
 * The NGAP FAQ as a `FAQPage`. The answers are the page's own text, joined in reading order, with
 * the source notes kept: an answer engine should see the same caveats a person sees.
 */
export function faqPageSchema(items: readonly FaqEntry[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/faq#faq`,
    url: `${SITE_URL}/faq`,
    inLanguage: "en-PH",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: [...item.paragraphs, ...(item.bullets ?? []), ...(item.note ? [item.note] : [])].join(
          " ",
        ),
      },
    })),
  };
}
