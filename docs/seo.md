# Search, link previews and AI answers

How TeeLine Golf presents itself to crawlers, to chat clients that unfurl a link, and to answer
engines. Everything here is wired in code; the only step an agent cannot do is verifying the site in
Google Search Console.

## What is in place

| Piece | Where | Behaviour |
| --- | --- | --- |
| Canonical host | `src/lib/seo.ts` | `NEXT_PUBLIC_SITE_URL`, falling back to `https://golf.syntaxure.dev` |
| Metadata | `src/app/layout.tsx` + each public page | Title, description, canonical, Open Graph, Twitter card, robots (large image preview allowed) |
| Open Graph card | `public/og/teeline-og.jpg` | 1200 × 630 JPEG, hybrid of the fairway photo and the TeeLine reverse logo, under 100 KB |
| Card generator | `scripts/make-og-image.mjs` | Rebuilds the card from the committed photo and the brand SVGs; run `node scripts/make-og-image.mjs` |
| Crawl rules | `src/app/robots.ts` | Public pages open; desk, player area, login and API disallowed; sitemap and host declared |
| Sitemap | `src/app/sitemap.ts` | `/`, `/pairings`, `/faq` |
| AI brief | `src/app/llms.txt/route.ts` | `/llms.txt` with what the product is, who it is for, canonical links and company contact |
| Structured data | `src/lib/seo.ts` + `src/components/seo/JsonLd.tsx` | `Organization`, `WebSite`, `SoftwareApplication` site-wide; `FAQPage` on `/faq` |
| Non-production exclusion | `next.config.ts` | Every build that is not production sends `X-Robots-Tag: noindex, nofollow` |
| Entry links | `src/app/(public)/enter/[id]/layout.tsx` | `noindex` — per-event forms are not part of the durable index |

Company facts in `Organization` and `llms.txt` come from the operator's own site, mdmevents.org
(MDM Digital, Media & Technology Services, 56 Quezon St., Arevalo, Iloilo City; hello@mdmevents.org;
+63 908 895 4818). The club is deliberately not named in metadata, structured data or the OG card:
the owner asked for TeeLine Golf only.

## Google Search Console (owner step)

1. Add a **Domain property** for `golf.syntaxure.dev` (covers http/https and all subdomains).
2. Verify it with the **DNS TXT record** Search Console gives you. This is the one step that needs
   the domain's DNS, so it is yours.
3. Submit `https://golf.syntaxure.dev/sitemap.xml` under **Sitemaps**.
4. Use **URL inspection** on `/`, `/pairings` and `/faq` and request indexing once each, after the
   change is live on production.
5. Check back in a week: **Pages** (what is indexed or excluded and why), **Performance** (queries,
   impressions, average position) and **Core Web Vitals**.

Agents cannot see or verify your Search Console account, so nothing here claims a submission has
happened.

## When it goes live

`main` is the production branch and is currently behind `develop`. These changes are live only after
they are promoted. Until then, the develop deployment is marked `noindex` by the build-time header,
so it cannot compete with production in an index.

## AI searchability

- `/llms.txt` is a plain-text brief with the product, the audience, the public URLs, the company
  contact and the order of the workflow. It is generated from the same constants as the metadata.
- The `FAQPage` schema on `/faq` exposes all 18 NGAP questions and answers as `Question`/`Answer`
  pairs, including the source notes.
- Pages are server-rendered: the text is in the HTML, not only in client JavaScript.
- AI crawlers are not blocked; the robots file allows public pages and closes the private ones. If
  that policy ever changes, it is a business decision, not a default.

## Local SEO: realistic plan

The broad query **"top golf app in the Philippines"** is dominated by listicles and app-store pages.
Metadata alone will not place TeeLine at the top of it; that takes content and authority over time.
What this work does is make the site genuinely eligible and measurable for intent-rich searches:

- **Target clusters:** "golf tournament software Philippines", "golf club tournament management app",
  "tournament pairings app", "NGAP handicap tournament app", "golf tournament app Iloilo".
- **Content to add next** (needs the owner's facts):
  1. a short case page about running an event at a club in Iloilo, with permission for the naming;
  2. a plain "What TeeLine does" page expanding the landing section, with screenshots;
  3. a glossary of the terms the desk uses (flight, wave, shotgun, frozen index), which the FAQ
     already half provides.
- **Citations and links:** the club's own site, the operator's site, golf and event-industry
  directories, and any local media coverage. Backlinks are the lever that moves the broad query.
- **Measurement:** track branded queries and the clusters above in Search Console every month; report
  positions honestly and iterate on the pages that get impressions but few clicks.

## Limits and maintenance

- Rebuild the OG card with `node scripts/make-og-image.mjs` when the photo, logo or tagline changes;
  `src/lib/seo.test.ts` fails if the file is missing, not a 1200 × 630 JPEG, or over 400 KB.
- `src/lib/seo.test.ts` also pins the crawl rules, the sitemap list, the schemas and the absence of
  the club name.
- The canonical host is a single constant. Changing domains means changing it and the Vercel
  production domain together, then re-verifying Search Console.
