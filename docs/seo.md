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
| Crawl rules | `src/app/robots.ts` | Public pages open; desk, player area, login and API disallowed; sitemap and host declared; the AI crawlers are named one by one with the same private paths |
| Sitemap | `src/app/sitemap.ts` | `/`, `/pairings`, `/roster`, `/leaderboard`, `/rules`, `/faq`; `lastmod` is the build date, not the request time |
| AI brief | `src/app/llms.txt/route.ts` | `/llms.txt` with what the product is, who it is for, canonical links and company contact |
| Structured data | `src/lib/seo.ts` + `src/components/seo/JsonLd.tsx` | `Organization` (with its logo), `WebSite`, `SoftwareApplication` site-wide; `SportsEvent` for each published tournament on the home page; `CollectionPage` on `/pairings`, `/roster` and `/leaderboard`; `WebPage` on `/rules` and `/faq`; `FAQPage` with the 18 NGAP answers on `/faq` |
| Non-production exclusion | `next.config.ts` | Every build that is not production sends `X-Robots-Tag: noindex, nofollow` |
| Entry links | `src/app/(public)/enter/[id]/layout.tsx` | `noindex` — per-event forms are not part of the durable index |
| Search Console token | `src/app/layout.tsx` + `src/lib/seo.ts` | `siteVerification()` reads `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and `NEXT_PUBLIC_BING_SITE_VERIFICATION`; with neither set, no tag is rendered |

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

## November 2026: what was completed

The October pass built the identity: one canonical host, the OG card, robots, a five-page sitemap,
`llms.txt`, and the site-wide schemas. This pass finishes the pages and the answer-engine side, and
leaves the one step only the owner can do.

**Every indexable public page now carries a full set.** `/leaderboard` had a title and nothing else;
`/join`, `/privacy` and `/terms` had no card and two had no canonical; `/results/all` had no
description. All of them now have a title, a description, a canonical path, an Open Graph card and a
Twitter card, and the five list and prose pages add their own `WebPage` or `CollectionPage` entity
(`webPageSchema`), attached to the `WebSite` and the company by id.

**The tournament itself is an entity.** The home page now emits a `SportsEvent` for each
tournament the club has published, built only from that event's own name and playing dates: start,
end, golf, the town, the organizer by id, and a link to the Conditions of Play. It claims no status,
because schema.org has no "finished" value and the honest answer after the last day is silence
rather than `EventScheduled`. The company's `Organization` node also carries its logo and image now,
which is what an entity needs to be recognised rather than only read.

**The leaderboard is in the sitemap.** It is the page a member searches for while an event is
running, it only ever shows what the desk has published, and it was missing from the six durable
pages. `/results` stays `noindex`: it holds the awarding reveal, not a durable page.

**Answer engines.** `llms.txt` now lists the roster, the leaderboard and the legal pages, and adds six
questions answered in the site's own words: what the product is, whether pairings need an account,
where handicaps come from, when scores appear, and what the rules and FAQ pages contain. `robots.txt`
names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot,
Google-Extended, Applebot-Extended, Bingbot and CCBot, each allowed the public pages and refused the
private ones, from the same list the wildcard rule uses. This states the policy that was already in
force; it does not change it. If the owner ever wants AI training traffic excluded, that is a
business decision and `Google-Extended` is the switch.

### The one step left: Search Console

The tag is wired; the token is not in the repository, and it should not be. The site is verified only
after a production build carries the owner's token.

1. Open Search Console, add the property `https://golf.syntaxure.dev/` (a URL-prefix property) or a
   Domain property for `golf.syntaxure.dev` if you can edit its DNS.
2. Choose the **HTML tag** method. It gives you a tag like
   `<meta name="google-site-verification" content="...">`.
3. Copy only the `content` value into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in Vercel, for the
   **Production** environment, then redeploy `main`. The layout renders the tag from that value;
   nothing else needs editing.
4. Press **Verify** in Search Console.
5. Submit `https://golf.syntaxure.dev/sitemap.xml` under **Sitemaps**, then use **URL inspection** on
   `/`, `/pairings`, `/leaderboard`, `/rules` and `/faq` and request indexing once each.
6. Repeat for Bing Webmaster Tools with `NEXT_PUBLIC_BING_SITE_VERIFICATION` if wanted; the
   `msvalidate.01` tag is already wired to it.

A preview or `develop` deployment will never appear in Search Console: `next.config.ts` sends
`X-Robots-Tag: noindex, nofollow` on every build that is not production, which is the intended
behaviour, not a fault. Verify against production, after `main` carries the token.

### What was checked, and what was not

Checked: typecheck, Biome, and the SEO tests (15, including the new token, `WebPage`, `SportsEvent`
and AI-crawler rules); every page's JSON-LD was fetched from a running build and parsed; the home
page carries `SoftwareApplication` and a `SportsEvent` for the published tournament. Not checked, and
not claimable from here: that Google has crawled, indexed or verified anything. Search Console is
the owner's account.

### Deliberately not added

These are the things a 2026 checklist usually includes that this site does not have, and why. Each
is a decision, not an omission.

- **`BreadcrumbList`.** There is no visible breadcrumb trail on the public pages, only a back link,
  and markup that does not match what a person sees is against the guidelines. Add the trail first
  if the pages ever grow one.
- **`hreflang`.** The site is translated, but the language lives in a cookie rather than in the URL,
  so there is no second URL to point at. Real multilingual indexing needs `/tl/…` and `/hil/…`
  routes, which is a routing change, not a tag.
- **Ratings, reviews, prices, attendance.** Nothing here publishes them, and inventing them would be
  the one kind of structured data that gets a site penalised.
- **`FAQPage` rich results.** Google limited those snippets to government and health sites in 2023.
  The markup still earns its place: it is what an answer engine reads. Do not expect a snippet.
- **`IndexNow`.** Bing and Yandex accept instant pings when a page changes. It needs a key file and
  a ping on publish; worth doing when someone owns the search-monitoring side, not before.
- **Per-page Open Graph images.** Every page shares one 1200 x 630 card. Templated images per page
  are a project of their own and would not change indexing.
- **`meta keywords`.** Ignored by every engine since well before 2026.
