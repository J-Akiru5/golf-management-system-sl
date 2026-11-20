# Brief: PUBLIC POLISH (make every page body match the landing)

Branch `public/polish`, from `feat/public`. Common rules attached. A chat builder is working on
`src/components/chat/**`, `src/lib/ai/**`, `src/lib/chat/**`, `src/app/api/chat/**`; do not touch those.

## What the orchestrator saw in a browser (1440 px and 390 px) on `feat/public`

The shared header and footer from the first design pass work and are consistent. The page **bodies**
still use the old light look, so the pages still feel like "another dimension" (the owner's words):

1. **`/feedback`: the tick boxes are broken.** The native checkboxes render off to the left of their
   boxes, the labels are invisible, and the legend "What is your concern? Tick all that apply" is a
   huge Bebas headline. Fix the markup/CSS pairing so each concern is one large, clear row: a 28 px
   custom box (ivory border, gold fill and a check mark when ticked), the label in 17 px Geist next to
   it, the whole row clickable, a gold focus ring. Two columns of rows on desktop, one on phones. The
   legend is a normal 20 px section heading. The follow-ups (Hole no., the Tee colour radio group with
   Blue/Silver/White/Red, the Others line) appear indented under their row. Radios use the same style
   as round dots. Keep every field, name, validation message and the submit logic exactly as it is
   (`FeedbackForm.tsx` markup and classes may change; its state, validation and submit code may not).
2. **Each page repeats its own brand card** ("Back to TeeLine", a second TeeLine logo and the club
   line) under the shared header: on `/feedback`, `/rules`, `/pairings`, `/roster`, `/leaderboard`,
   `/results/**`, `/faq`. Remove those duplicate brand blocks and back links (the shared header has the
   logo and nav). Keep each page's own kicker, title and intro, restyled as the landing's section
   heading (gold kicker, a large heading, muted intro), left aligned in the shared content width.
3. **Old footer lines remain** at the bottom of several pages (for example "TEELINE GOLF HOME ·
   PRIVACY POLICY" and "TEELINE GOLF HOME · TEE TIMES AND PAIRINGS · PLAYER ROSTER · LEADERBOARD · NGAP
   FAQ") in dark text on the dark ground, unreadable. Remove them; the shared footer covers this.
4. **Light cards on the dark ground.** `/rules` sections (the accordion), the fact tiles, `/pairings`
   group cards, the roster, results and leaderboard tables are ivory/white boxes. Restyle them as the
   landing's dark raised cards (`#1d241f` to `#202823`, hairline `rgba(247,245,238,0.15)` border, 14 px
   radius, ivory text, muted secondary text at AA contrast, gold for marks only). Tables: dark rows with
   hairline separators, tabular numerals. Keep information density and every value.
5. **`/events/[id]`: the published pairings section lists all 80 groups**, making the page about 12,000
   px tall. Show a compact summary instead: the first 6 groups as cards plus a clear "See all published
   pairings" button to `/pairings`, and the same for results (top 3 plus "See all scores"). The rules
   section shows the organizer's rules text, or when the event has none, a card linking to
   "Conditions of Play" (`/rules`) for the 24th Bamboo Tee. Keep the release checks as they are (only
   presentation changes; you may edit `src/app/(public)/events/**` for this).
6. Check `/`, `/events`, `/events/<id>`, `/feedback`, `/rules`, `/pairings`, `/roster`, `/leaderboard`,
   `/results`, `/results/all`, `/faq`, `/privacy`, `/terms`, `/demo`, `/join` at desktop and phone for
   the same problems and fix them the same way.

## You own

`src/components/public/**` (except `FeedbackLink`'s link behaviour), `src/app/(public)/**` page markup
and classes, `src/components/landing/**` only if needed for consistency, and any CSS those use.
Data loading, release checks, validation and submit logic stay exactly as they are.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass (update render tests whose markup you changed; never
weaken an assertion about data, release state or validation). Print styles keep working. Final report
as in the common rules, listing every page you changed.
