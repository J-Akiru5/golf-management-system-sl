import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { NGAP_FAQ } from "@/lib/public/ngap-faq";
import {
  absoluteUrl,
  COMPANY,
  faqPageSchema,
  OG_IMAGE,
  openGraphFor,
  organizationSchema,
  SITE_NAME,
  SITE_URL,
  siteVerification,
  softwareApplicationSchema,
  sportsEventSchema,
  twitterFor,
  webPageSchema,
  websiteSchema,
} from "./seo";

/** Reads the pixel size out of a JPEG's start-of-frame marker. */
function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

const noClubName = (value: unknown) =>
  expect(JSON.stringify(value)).not.toMatch(/IGCC|Iloilo Golf/i);

describe("the canonical identity", () => {
  it("uses one absolute https host with no trailing slash", () => {
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
    expect(absoluteUrl("/faq")).toBe(`${SITE_URL}/faq`);
    expect(absoluteUrl("faq")).toBe(`${SITE_URL}/faq`);
    expect(absoluteUrl("https://example.test/a")).toBe("https://example.test/a");
  });

  it("takes the Search Console token from the environment, and omits the tag when there is none", () => {
    expect(siteVerification({})).toBeUndefined();
    expect(siteVerification({ NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "   " })).toBeUndefined();
    expect(siteVerification({ NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "token-123" })).toEqual({
      google: "token-123",
    });
    expect(siteVerification({ NEXT_PUBLIC_BING_SITE_VERIFICATION: "bing-1" })).toEqual({
      other: { "msvalidate.01": "bing-1" },
    });
    expect(
      siteVerification({
        NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "g",
        NEXT_PUBLIC_BING_SITE_VERIFICATION: "b",
      }),
    ).toEqual({ google: "g", other: { "msvalidate.01": "b" } });
  });

  it("keeps the company facts that were published on the company's own site", () => {
    expect(COMPANY.name).toBe("MDM Digital, Media & Technology Services");
    expect(COMPANY.url).toBe("https://mdmevents.org/");
    expect(COMPANY.email).toBe("hello@mdmevents.org");
    expect(COMPANY.telephone).toBe("+63 908 895 4818");
    expect(COMPANY.address.addressLocality).toBe("Iloilo City");
    expect(COMPANY.address.addressCountry).toBe("PH");
  });
});

describe("the Open Graph card", () => {
  it("is a real 1200x630 JPEG under 400 KB", () => {
    const path = join(process.cwd(), "public/og/teeline-og.jpg");
    const bytes = statSync(path).size;
    expect(bytes).toBeGreaterThan(20_000);
    expect(bytes).toBeLessThan(400_000);

    const buffer = readFileSync(path);
    expect(jpegSize(buffer)).toEqual({ width: 1200, height: 630 });
  });

  it("is what the metadata points at", () => {
    expect(OG_IMAGE.url).toBe("/og/teeline-og.jpg");
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
    expect(OG_IMAGE.alt).toMatch(/TeeLine Golf/);

    const openGraph = openGraphFor({ title: "t", description: "d", path: "/faq" });
    expect(openGraph.images).toEqual([OG_IMAGE]);
    expect(openGraph.url).toBe("/faq");
    expect(openGraph.locale).toBe("en_PH");

    const twitter = twitterFor({ title: "t", description: "d" });
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.images).toEqual([OG_IMAGE.url]);
  });
});

describe("structured data", () => {
  it("describes one company and one site, linked by id", () => {
    const organization = organizationSchema();
    expect(organization["@type"]).toBe("Organization");
    expect(organization.name).toBe(COMPANY.name);
    expect(organization.url).toBe(COMPANY.url);
    expect((organization.address as Record<string, string>)["@type"]).toBe("PostalAddress");

    const site = websiteSchema();
    expect(site["@type"]).toBe("WebSite");
    expect(site.url).toBe(SITE_URL);
    expect((site.publisher as Record<string, string>)["@id"]).toBe(organization["@id"]);

    expect(organization.logo).toBe(`${SITE_URL}/icons/icon-512.png`);
    expect(organization.image).toBe(`${SITE_URL}${OG_IMAGE.url}`);

    const app = softwareApplicationSchema();
    expect(app["@type"]).toBe("SoftwareApplication");
    expect(app.applicationCategory).toBe("SportsApplication");
    expect(app.operatingSystem).toBe("Web");
    expect((app.publisher as Record<string, string>)["@id"]).toBe(organization["@id"]);
  });

  it("describes a published tournament as a SportsEvent from its own name and dates", () => {
    const event = sportsEventSchema({
      id: "1f0d98d4-e5c8-4929-bca9-2920c1a74cbb",
      name: "24th Bamboo Tee",
      dates: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    });
    expect(event?.["@type"]).toBe("SportsEvent");
    expect(event?.name).toBe("24th Bamboo Tee");
    expect(event?.startDate).toBe("2026-11-12");
    expect(event?.endDate).toBe("2026-11-15");
    expect(event?.sport).toBe("Golf");
    expect(event?.url).toBe(`${SITE_URL}/rules`);
    expect((event?.organizer as Record<string, string>)["@id"]).toBe(`${SITE_URL}/#organization`);
    const address = (event?.location as Record<string, unknown>).address as Record<string, string>;
    expect(address.addressCountry).toBe("PH");
    // No status is claimed: schema.org has no "finished" value.
    expect(event?.eventStatus).toBeUndefined();
    noClubName(event);
  });

  it("refuses to describe an event with no name or no dates", () => {
    expect(sportsEventSchema({ id: "x", name: "  ", dates: ["2026-01-01"] })).toBeNull();
    expect(sportsEventSchema({ id: "x", name: "Event", dates: [] })).toBeNull();
  });

  it("turns the NGAP FAQ into a FAQPage with every answer and both source notes", () => {
    const schema = faqPageSchema(NGAP_FAQ);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.url).toBe(`${SITE_URL}/faq`);

    const questions = schema.mainEntity as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(NGAP_FAQ.length);
    expect(questions).toHaveLength(18);

    const answers = questions.map((question) =>
      String((question.acceptedAnswer as Record<string, unknown>).text ?? ""),
    );
    for (const answer of answers) {
      expect(answer.length).toBeGreaterThan(40);
      expect(answer).not.toMatch(/undefined/);
    }
    expect(answers.join(" ")).toContain("(indicate date)");
    expect(answers.join(" ")).toMatch(/image/i);
  });

  it("gives a public list page its own entity, attached to the site and the company", () => {
    const page = webPageSchema({
      path: "/leaderboard",
      name: "Leaderboard",
      description: "The published results.",
      type: "CollectionPage",
    });
    expect(page["@type"]).toBe("CollectionPage");
    expect(page["@id"]).toBe(`${SITE_URL}/leaderboard#webpage`);
    expect(page.url).toBe(`${SITE_URL}/leaderboard`);
    expect((page.isPartOf as Record<string, string>)["@id"]).toBe(`${SITE_URL}/#website`);
    expect((page.publisher as Record<string, string>)["@id"]).toBe(`${SITE_URL}/#organization`);
    expect((page.primaryImageOfPage as Record<string, unknown>).url).toBe(
      `${SITE_URL}${OG_IMAGE.url}`,
    );
    expect(webPageSchema({ path: "/rules", name: "n", description: "d" })["@type"]).toBe("WebPage");
    noClubName(page);
  });

  it("never names the club, in any schema", () => {
    for (const schema of [
      organizationSchema(),
      websiteSchema(),
      softwareApplicationSchema(),
      faqPageSchema(NGAP_FAQ),
    ]) {
      noClubName(schema);
    }
  });
});

describe("crawl rules and the sitemap", () => {
  it("keeps the desk, the player area and the API out of the index", () => {
    const rules = robots();
    expect(rules.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(rules.host).toBe(SITE_URL);

    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    const disallow = String(rule?.disallow ?? "");
    for (const path of ["/admin", "/my", "/scores", "/login", "/api/", "/feedback-inbox"]) {
      expect(disallow).toContain(path);
    }
    // Entry pages must stay crawlable so their own noindex is seen.
    expect(disallow).not.toContain("/enter");
  });

  it("names the AI crawlers with the same private paths as everyone else", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    const wildcard = list[0] as { userAgent?: string; disallow?: string[] };
    const agents = list.find((rule) =>
      Array.isArray((rule as { userAgent?: unknown }).userAgent),
    ) as { userAgent?: string[]; disallow?: string[] } | undefined;
    expect(agents?.userAgent).toEqual(
      expect.arrayContaining(["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]),
    );
    expect(agents?.disallow).toEqual(wildcard.disallow);
  });

  it("lists the six durable pages and no entry links", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/pairings`,
      `${SITE_URL}/roster`,
      `${SITE_URL}/leaderboard`,
      `${SITE_URL}/rules`,
      `${SITE_URL}/faq`,
    ]);
    expect(JSON.stringify(entries)).not.toContain("/enter/");
    expect(JSON.stringify(entries)).not.toMatch(/IGCC|Iloilo Golf/i);
  });

  it("serves llms.txt as plain text with the canonical links", async () => {
    const response = await llmsTxt();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain(`# ${SITE_NAME}`);
    expect(text).toContain(`${SITE_URL}/pairings`);
    expect(text).toContain(`${SITE_URL}/rules`);
    expect(text).toContain(`${SITE_URL}/faq`);
    expect(text).toContain(`${SITE_URL}/leaderboard`);
    expect(text).toContain(`${SITE_URL}/privacy`);
    expect(text).toContain(`${SITE_URL}/sitemap.xml`);
    expect(text).toContain(COMPANY.email);
    expect(text).not.toMatch(/IGCC|Iloilo Golf/i);
  });
});
