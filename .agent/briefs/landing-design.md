# Brief: LANDING DESIGN (the visual layer)

Branch `landing/design`. You are the design builder. Another builder (STRUCTURE) works in parallel on
the data, the page file, the database function and the demo form. You build how the page looks.

## You own

- `src/components/landing/**` except `types.ts` (read-only for you). Replace the stub bodies in
  `index.tsx` with real components. You may split them into more files under `src/components/landing/`
  and re-export from `index.tsx`. Client components (the hero switch, the carousel controls) go in
  their own files with `"use client"`; keep everything else server-rendered.
- `src/components/landing/landing.css`: all landing styles, imported from `index.tsx`. Scope every
  selector under `.tl-landing` (the page wraps everything in `<main className="tl-landing">`) so
  nothing leaks into the rest of the app.

You do not edit `src/app/(public)/page.tsx`, `src/lib/**` or anything else. To see your work, use the
page the STRUCTURE builder will compose; until then, a scratch route is NOT allowed. Instead, add a
temporary story file `src/components/landing/preview-data.ts` exporting realistic sample props (use the
24th Bamboo Tee: Nov 12–15, 2026, 327 entered, first tee 6:00 AM, 4 days, Iloilo Golf and Country Club,
finished) and check your components with a unit test that renders them to static markup
(`react-dom/server` `renderToStaticMarkup`) and asserts the key text and roles. Visual checks happen
later in a real browser by the orchestrator.

## What great looks like here

Study the three references' distinct moves and apply them to golf:

- **Linear**: the real product is the hero image. Show the screenshots in `public/landing/` in a
  perspective frame (a slight 3D tilt, `perspective` + `rotateX/rotateY`, soft fade into the dark
  ground at the bottom edge), crisp 1px borders, very restrained colour, large tight headline type.
- **Raycast**: one ownable artwork. Ours is the **tee line**: an SVG field of golf-green contour lines
  (like the elevation map of a putting surface) in muted green at low opacity, crossed by one single
  gold line (the tee line) that sweeps across the hero. Animate it gently (the gold line draws in once
  with `stroke-dashoffset`; contours drift very slowly). Respect `prefers-reduced-motion` (no motion).
  Pure SVG and CSS, no canvas library, nothing downloaded.
- **DigitalOcean**: atmosphere and proof. A soft radial light behind the hero, and the proof strip of
  stat cards right under the product shot, overlapping the hero's lower edge.

Avoid the AI-template look: no purple or blue gradients, no glassmorphism blobs, no emoji or generic
icon-grid feature cards, no "trusted by" logo walls, no centred-everything sameness. Use asymmetry,
real numbers, tight typographic hierarchy, generous dark space, and small precise details (a version
line, tabular numerals, hairline gold rules, a small "Illustrated layout" note where the screenshot
already says so).

## The components (exports and props are fixed by `types.ts`)

1. **`LandingHero`** (`LandingHeroProps`). Contains the top nav and the hero.
   - Nav: `TeeLineLogo` (reverse) linking to `/`; anchors `#product`, `#how-it-works`, `#proof`;
     links `/pairings` (Player pairings), `/rules` (Tournament rules), `/faq` (NGAP FAQ); at the end a
     quiet `Sign in` link to `/login` and a light **Request a demo** button to `/demo`. On a phone the
     links collapse; keep Sign in and Request a demo reachable.
   - The **switch**: a two-option segmented control, "For clubs" and "Now hosting" (show the featured
     event's short name or "Now hosting" when it is long). Accessible as a `tablist` with two `tab`s
     and arrow-key support; it swaps the hero body without a page load and without layout jump. Starts
     on `defaultView`. When `featured` is null there is no switch and only the clubs side renders.
   - **For clubs** side: a short uppercase Bebas headline (two lines at most) and one plain sentence,
     about running a golf tournament from entries to results from one desk. Write it yourself; no
     marketing words. Buttons: Request a demo (light, `/demo`) and See it in use (quiet, `#product`).
   - **Now hosting** side: `eventEyebrow` as the kicker with a small gold rule; the event name in
     Cormorant Garamond (sentence case) with `dateLabel` under it; the venue and `enteredLabel`; the
     `quickActions` as buttons (the `primary` one light, the rest quiet), each an `<a>`/`Link` to its
     `href`; then `eventStats` as a row of 4 compact stat cells (Bebas figures). If `featured.finished`
     show a small "Completed" chip with a check mark next to the eyebrow.
   - The tee-line artwork sits behind both sides.
2. **`ProductShowcase`** (`{ shots }`). Section id `product`. The first shot large in perspective under
   the hero; the others smaller beside or below, each with its caption. Use `next/image` with the given
   width and height and real `alt` text. Make the large frame feel like an app window (thin top bar
   with three muted dots is fine; no fake browser URL).
3. **`ProofStrip`** (`ProofStripProps`). Section id `proof`. 4 or 5 stat cards (Bebas figure, label,
   one-line detail) and the `source` line under them in small text. Cards: dark raised surface, 1px
   border, no coloured side bar.
4. **`CapabilitySections`** (no props; write the copy). Section id `how-it-works`. Three to five short
   sections, alternating text and a small diagram you draw in SVG/HTML (no screenshots with names).
   Facts you may use (all true of the product):
   - Registration desk and online entry; handicap index import; each player's category, tee, flight,
     group and start slot worked out from the tournament's own settings (allowance, max index, age
     bands, group size, gap between start times are settings, not hard-coded).
   - A player the rules cannot place is flagged for review, never given a guess.
   - Shotgun or tee-time starts; the organizer reviews the draw, fixes what is flagged, then publishes.
   - Players see only the published pairings, on their phones, without an account. Private profile
     details stay private.
   - Score entry hole by hole, checked against the card; live public leaderboard with a results
     blackout and a timed reveal; clubhouse display for the TV; printed start sheets and scorecards;
     audit log of every change; staff app for marshals and tabulators.
   - Built in Iloilo by Syntaxure Labs; first run live at Iloilo Golf and Country Club.
5. **`EventCarousel`** (`EventCarouselProps`). Make it premium: a horizontal track with scroll-snap,
   large cards (event name in Cormorant, date, venue, entered count, a state chip: **Live** (a soft
   pulsing dot, reduced-motion safe), **Upcoming**, or **Completed** with a check mark), and per-card
   links: Pairings (`/pairings`) and Scores (`/results/all`); when `entriesOpen` also Enter
   (`/enter`). Previous/next buttons, a position indicator, keyboard and touch friendly, no autoplay.
   A finished event card looks settled (quieter, gold check), not disabled. Read
   `src/components/public/TournamentCarousel.tsx` for the existing behaviour and routes; yours replaces
   it on the home page (do not delete the old file).
6. **`DemoCta`**. A closing band: a short headline, one sentence, a light **Request a demo** button to
   `/demo`, and a quiet line "Already a TeeLine club? Sign in" to `/login`.
7. **`LandingFooter`** (`{ versionLabel }`). Logo; columns Product (Published pairings `/pairings`,
   Tournament rules `/rules`, Public leaderboard `/leaderboard`, Request a demo `/demo`), Club (Iloilo
   Golf and Country Club), Legal (`/privacy`, `/terms`); the "Powered by" Converge logo
   (`/partners/converge-logo.svg`) as the current footer has; bottom bar with "Developed by Syntaxure
   Labs · {versionLabel}" and Sign in.

## Layout and quality bar

- Dark in both app themes (the landing sets its own dark ground). Readable contrast (WCAG AA).
- Works at 390px, 768px and 1440px with no sideways scroll. The perspective frames flatten on phones.
- Semantic HTML, one `h1` (`id="hero-title"`), visible focus styles, `prefers-reduced-motion` honoured.
- Fast: no client JavaScript except the switch and the carousel controls.

## Acceptance

`pnpm typecheck`, `pnpm lint` and `pnpm test` pass; your render test covers both hero sides, the
Completed chip, the quick actions, and the carousel state chips. Every export in `index.tsx` keeps its
name and props type. Nothing outside your paths changed.
