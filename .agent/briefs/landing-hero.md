# Brief: LANDING HERO AND POLISH (design pass after the owner's review)

Branch `landing/hero`, from `feat/landing`. Same common rules (attached). You own
`src/components/landing/**` except `types.ts` (read it: it is the contract and it changed), and you may
restyle `src/app/(public)/demo/page.tsx` and `src/components/public/DemoRequestForm.tsx` (markup classes
and styles only: do not change the form's fields, validation, submit path or messages). A structure
builder is changing the data side at the same time (`showcase.ts`, `page.tsx`, the desk); do not touch it.

## The owner's verdict on the current hero

"Remove this trigger, it must be an admin control. And if you don't put any element on the right side,
make the hero centred, and it's too plain for me." The goal is a premium, million-dollar SaaS feel in
the spirit of Linear, Raycast and DigitalOcean, not an AI-template look.

## 1. Remove the switch

Delete the "For clubs / 24th Bamboo Tee" tablist from `LandingHero` entirely, with its state, its
`useTransition` and the event side of the hero. `LandingHero` becomes a **server component** (no
`"use client"`). The new props are in `types.ts` (`featured`, `eventEyebrow`, `quickActions`,
`eventStats`, `heroShot`; no `defaultView`).

## 2. A centred, rich hero

Composition, top to bottom, all centred on one axis:

1. **Announcement pill** (only when `featured` is not null), Linear/Raycast style: a small rounded pill
   with a hairline border and a soft inner glow: a status dot (gold pulse while live, a check while
   finished), "Now hosting", a divider, the event name, and the primary quick action label with an
   arrow, linking to that action's `href`. Example: `● Now hosting | 24th Bamboo Tee · Completed  See all scores →`.
2. Kicker "Tournament operations for golf clubs", then the headline "A better desk for tournament day."
   (keep the words; Bebas, very large, tight leading, centred, max two lines on desktop), a one-line
   subtitle, then the two CTAs side by side ("Request a demo" primary light button to `/demo`, "See it in
   use" secondary to `#product`).
3. A quiet proof line under the CTAs using only real values from the page's data or copy you already
   have: "First run at Iloilo Golf and Country Club · 327 entries · 0 downtime". (Take the figures from
   `PROOF_STATS` passed down if you need them, or keep this line static text; never invent a number.)
4. **The product window rising into the hero's lower edge** (Linear's move): `heroShot` in a large app
   window frame (traffic-light dots, hairline border, deep shadow, a faint top highlight), on a parent
   with `perspective`, tilted about `rotateX(18deg)` and slightly scaled, its lower part fading into the
   page ground with a mask/gradient. `next/image` with `priority` and correct `sizes`. Flat on phones and
   under `prefers-reduced-motion`. Since the hero now shows this shot, `ProductShowcase` should start with
   the second and third shots (or show the first again only if the layout clearly needs it; avoid the
   same screenshot twice in a row).
5. **Featured-event band** (only when `featured` is not null), directly under the hero window or
   overlapping its bottom edge as a raised glass panel: left, the eyebrow (`eventEyebrow`) with a
   Completed / Live chip, the event name large in Cormorant, the date label, venue and entered count;
   middle, the `eventStats` as a stat row (Bebas numerals); right, the `quickActions` as real buttons
   (the primary one light, the rest outlined). Stack cleanly on phones.

Atmosphere, so it is not plain:
- The gold tee line is the brand signature: one confident sweep across the full hero width behind the
  headline, clearly visible (not 10% opacity), drawn in once on load with CSS (stroke-dashoffset), with
  a small gold "ball" at a point on the line. `aria-hidden`.
- A visible but quiet contour field (topographic lines like a green's slope map) behind it.
- Layered radial light: a soft green glow behind the headline and a faint warm (gold) glow near the
  window's top edge; a very subtle grain/noise (an inline SVG `feTurbulence` data URI is fine, no
  external asset) and a faint grid that fades out toward the edges.
- Hero height is content-driven (roughly 85 to 100 vh including the rising window on desktop); no screen
  of empty dark space before the next section.
- Mark the elements a later motion pass will animate with data attributes (no JS now):
  `data-tl-parallax="0.15"` on the contour layer, `data-tl-parallax="0.35"` on the tee line layer,
  `data-tl-parallax="-0.1"` on the glow, `data-tl-draw` on the tee line path, `data-tl-tilt` on the hero
  window, `data-tl-reveal` on section headings and cards, `data-tl-stagger` on card grids,
  `data-tl-count="<number>"` on each proof figure (the visible text stays the final formatted value).

## 3. The rest of the review (still required)

1. **Proof strip**: all five figures in one row on desktop (no 4 + 1 wrap), two columns on tablets, one
   column or two compact on phones.
2. **Event carousel with one event**: render it as a wide feature card (event name large in Cormorant,
   dates, venue, entered count, Completed chip, a row of 3 or 4 facts, links as proper buttons), no
   "1 / 1" counter, no arrows. With two or more events keep the scroll-snap track.
3. **Small text**: body at least 15 px on desktop, 14 px for secondary lines, WCAG AA contrast on the
   dark ground (carousel card body, proof details, capability diagram labels, footer).
4. **/demo**: the landing's dark ground, the TeeLine reverse logo linking home, a short left column (what
   a demo covers, 3 or 4 plain points) and the form on the right in a raised card. One column on phones.
5. Capability diagrams: make them feel crafted, not like grey boxes (hairline gradients, a gold accent on
   the result node, subtle inner shadows), keeping their labels and meaning.

Keep everything that works: the sections and their copy, the quick actions, the footer.

## Performance

Transform and opacity only for any CSS animation; no `filter: blur` animation; `will-change` only on the
tee line during its draw. Every image other than the hero window is lazy with `sizes`. No new packages,
no external assets or fonts.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass (update `landing.test.ts` render tests for the new
markup, never weaken them: add a test that the hero renders no switch/tablist, renders the pill and the
band only when `featured` is set, and renders neither when it is null). `preview-data.ts` must follow the
new contract. If `typecheck` fails ONLY in `src/app/(public)/page.tsx` or `src/lib/public/showcase.ts`
because the structure builder has not landed yet, say so in the report and leave it. Final report as in
the common rules.
