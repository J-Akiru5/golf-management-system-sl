import { COMPANY, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * `llms.txt`: a short, plain-text brief for answer engines and AI crawlers.
 *
 * It carries only facts the site itself states, plus the canonical URLs. No marketing claims, no
 * invented statistics, and no club name (the owner asked for TeeLine Golf only).
 */
export function GET(): Response {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

## What it is

TeeLine Golf is a web application for golf clubs and tournament organizers. It takes player entries,
imports the club's NGAP handicap export, sorts players into categories and flights, runs the draw
with start waves, publishes pairings that players can read without an account, and prints the start
sheet, pairings and scorecards. It runs in the browser on a phone or a laptop.

## Who it is for

- Golf clubs and tournament organizers in the Philippines.
- Players: published pairings need no account; signing in shows a player their own entry and start.

## How it works, in order

1. Players enter through a public form; the desk confirms each entry.
2. Handicap indexes come from the club's NGAP export, and the index is frozen at the entry cut-off.
3. Categories and flights are set per event; the draw assigns groups, holes and start times.
4. Publishing freezes the list players see and raises a version number.
5. The desk prints the start sheet, pairings and scorecards from the same board.

## Public pages

- Home: ${SITE_URL}/
- Published pairings: ${SITE_URL}/pairings
- NGAP World Handicap System FAQ: ${SITE_URL}/faq (reference text published by the NGAP in 2024)
- Sitemap: ${SITE_URL}/sitemap.xml
- Crawl rules: ${SITE_URL}/robots.txt

## Company

Operated by ${COMPANY.name} (${COMPANY.alternateName}), ${COMPANY.address.streetAddress},
${COMPANY.address.addressLocality}, ${COMPANY.address.addressRegion}, Philippines.
Contact: ${COMPANY.email}, ${COMPANY.telephone}. ${COMPANY.url}

## Notes

- The pairings page shows a published, versioned list and needs no sign-in.
- Official handicap indexes come from the NGAP and the club's export; the app does not calculate an
  official index.
- Pages are server-rendered and readable without JavaScript.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
