# Brief: LANDING POLISH (design pass after review)

Branch `landing/polish`, from `feat/landing`, which now has your earlier components composed into the
real page with real data. The orchestrator looked at it in a browser at 1440 px and 375 px. Fix what is
listed below. Same rules as before (attached common rules). You own `src/components/landing/**` except
`types.ts`, and you may restyle `src/app/(public)/demo/page.tsx` and
`src/components/public/DemoRequestForm.tsx` (markup classes and styles only: do not change the form's
fields, validation, submit path or messages).

## What the review found (fix all of these)

1. **The hero has too much dead space.** At 1440 x 900 the hero fills the whole screen with text on the
   left and an almost empty right half, then a full screen of dark space before the product frame
   appears. Make the hero shorter (content-height, roughly 70 to 80 vh at most) and bring the first
   product screenshot **up into the hero's lower edge**, tilted in perspective (Linear's move: a large
   app window, `perspective` on the parent, about `rotateX(18deg)` easing to flat as it scrolls into
   view is acceptable with CSS only, or a fixed gentle tilt; flatten it on phones and with reduced
   motion). The headline and switch stay where they are.
2. **The tee-line artwork is too faint.** The gold line is barely visible. Make the single gold tee line
   clearly visible (it is the brand signature): a confident sweep across the hero, drawn in once on
   load, with the contour field visible but quiet behind it. Keep it decorative (`aria-hidden`).
3. **The proof strip wraps 4 + 1** at 1440 px, leaving "0 downtime" alone on a second row. Show all
   five in one row on desktop, two columns on tablets, one column (or two compact) on phones.
4. **The event carousel looks lonely with one event.** With a single event it shows one small card on
   the left of a wide empty row, with a "1 / 1" counter and arrows. When there is one event, render it
   as a wide feature card (event name large in Cormorant, dates, venue, entered count, Completed chip,
   a row of 3 or 4 facts, and the links as proper buttons) and hide the counter and arrows. With two or
   more events keep the scroll-snap track.
5. **Small text is too small and too low in contrast** across cards (carousel card body, proof details,
   capability diagram labels). Body text at least 15 px on desktop, 14 px for secondary lines, and
   WCAG AA contrast on the dark ground.
6. **/demo** still uses the generic site form look. Give it the landing's dark ground, the TeeLine
   reverse logo linking home, a short left column (what a demo covers, 3 or 4 plain points) and the
   form on the right in a raised card. One column on phones.

Keep everything that works: the switch (it behaves correctly), the event side of the hero, the
quick actions, the sections and their copy, the footer.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass (update your render tests if markup changes, never
weaken them). No new packages, no external assets, no player names, no invented numbers. Final report
as described in the common rules.
