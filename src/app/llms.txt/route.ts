import { COMPANY, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * `llms.txt`: a short, plain-text brief for answer engines and AI crawlers.
 *
 * It carries only facts the site itself states, plus the canonical URLs. No marketing claims, no
 * invented statistics, and no club name (the owner asked for TeeLine Golf only). The answers at the
 * end are the questions a person actually asks about the product, in the same words the public
 * pages use, so an answer engine can quote them without paraphrasing past the caveats.
 */
export function GET(): Response {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

## What it is

TeeLine Golf is a web application for golf clubs and tournament organizers. It takes player entries,
imports the club's NGAP handicap export, sorts players into categories and flights, runs the draw
with start times, publishes pairings that players can read without an account, and prints the start
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
- Player roster: ${SITE_URL}/roster
- Leaderboard and published results: ${SITE_URL}/leaderboard
- Tournament rules: ${SITE_URL}/rules (the 24th Bamboo Tee Conditions of Play, with the official PDF)
- NGAP World Handicap System FAQ: ${SITE_URL}/faq (reference text published by the NGAP in 2024)
- Privacy policy: ${SITE_URL}/privacy
- Terms of service: ${SITE_URL}/terms
- Sitemap: ${SITE_URL}/sitemap.xml
- Crawl rules: ${SITE_URL}/robots.txt

## Questions this site answers

**What is ${SITE_NAME}?**
Tournament management for golf clubs: entries, handicap-based flights, the draw, published pairings,
printed start sheets and scorecards, in one application.

**Do players need an account to see the pairings?**
No. The pairings, the roster, the leaderboard, the rules and the handicap FAQ are public. An account
is for a player's own entry and start, and for the desk.

**Where do the handicaps come from?**
From the club's NGAP export. The app does not calculate an official index; the desk's figure is what
scores a card.

**When do scores appear?**
Only after the desk publishes them. Publishing freezes the list players see and raises a version
number, and a player never sees the live board before that.

**What does the rules page contain?**
The 24th Bamboo Tee Invitational Conditions of Play: format, handicap and divisions, local rules, pace
of play, scorecards, tie-breaking and prizes, with the official PDF to download.

**What does the FAQ page contain?**
The NGAP's own answers about the World Handicap System, published in 2024, including its fees and
dates, with the source noted on the page.

## Company

Operated by ${COMPANY.name} (${COMPANY.alternateName}), ${COMPANY.address.streetAddress},
${COMPANY.address.addressLocality}, ${COMPANY.address.addressRegion}, Philippines.
Contact: ${COMPANY.email}, ${COMPANY.telephone}. ${COMPANY.url}

## Notes

- The pairings page shows a published, versioned list and needs no sign-in.
- Official handicap indexes come from the NGAP and the club's export; the app does not calculate an
  official index.
- Pages are server-rendered and readable without JavaScript.
- Everything behind sign-in is closed to crawlers; see ${SITE_URL}/robots.txt.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
