# Brief: three desk-card design fixes from the UI/UX check (components only)

You are a builder. Work only in this worktree (branch `agent/design-fixes`). Do not push, merge,
deploy or touch any other branch. Read `AGENTS.md` first and follow it. Then read the design tokens
and classes the project already uses (`src/app/globals.css`: `--surface`, `--surface-raised`, `--ink`,
`--ink-muted`, `--line`, `.btn`, `.pill`, `.hint`, `.notice`) so you stay on the design system and
do not add colours or fonts.

## Why

The owner asked for the desk scorecard to be checked for UI/UX and for fit to the design system. The
check was done in the browser on a 375px phone and a 1280px desk screen. Three findings are clear
fixes and are in this brief. Two others (a nine-hole table that is 640px wide, and the "Fill with
par" button) need a product decision and are **not** part of this brief: leave `min-w-[640px]`
alone and do not touch "Fill with par" (`scripts/verify-ui.mjs` clicks it).

## Scope

Only these files: `src/components/scoring/ScorecardWorkspace.tsx` and
`src/components/scoring/ScorecardHoleGrid.tsx`, plus a test if one of them already has a test file
next to it. If you need a change in another file, stop and say so in your report. Do not change
props, data flow, ids used by tests (`#score-submit`, `#hole-N`, the aria-labels of the cells) or the
scan states.

## Fix 1: the sticky block is too tall on a phone

`ScorecardWorkspace.tsx` renders one `sticky top-0` block with the Player combobox, the Marker
combobox, the status pill, the Submit button, up to three blocker hints and a line with the player's
index and handicap. On a 375px phone it is 318px tall, 39% of the screen, and it covers the card.

Make the part that stays on screen small on a phone and leave the desk layout (`lg` and up, 1024px)
looking the same or better:

- On screens below `lg`, the two comboboxes and the profile/index line scroll with the page. What
  stays stuck at the top is a slim bar: the player's name (truncate with an ellipsis), the status
  pill and the Submit button. The stuck part must be at most about 25% of a 667px-high phone
  (roughly 110px), and the player's name must be visible in it.
- Keep a single element with `id="score-submit"` and the same button text and states; do not render
  the button twice.
- The blocker hints (`!ready && blockers.length > 1`) stay visible in the page flow, not inside the
  stuck bar.
- On `lg` and up keep the current one-row layout: Player, Marked by, then the pill and Submit.
- Keep keyboard order sensible: Player, Marker, then Submit.
- Use existing tokens and classes only. Dark mode must still look right (the block uses
  `bg-surface-raised`; keep a solid background so scrolling cards do not show through).

## Fix 2: score cells are 32px high

In `ScorecardHoleGrid.tsx` the score input is `h-8` (32px). The design system's standard control is
44px (`.btn` is 44px; a small button is 32px on a desk and 36px on a phone), and these are tapped
all day on a phone.

- Below `lg`, the input must be at least 44px high. At `lg` and up it may stay compact (about 36px).
- Keep the width, the number input, `inputMode`, the scan-state classes and the 10px state label
  line. Do not change the input type: another change is about to allow the letter X in it.
- Check that the cell's focus ring still shows and the row does not look unbalanced against the
  Par and SI rows.

## Fix 3: row labels disagree with the rest of the product

The desk grid labels the stroke-index row "Hcp row", which is easy to confuse with the player's
handicap (the HDCP box on the paper card). Read `src/components/print/Scorecard.tsx` (row labelled
"Stroke index") and `src/lib/player/paper-scorecard.ts` with the component that renders it to see
what the public side says, then use one shared wording on the desk:

- Label the row `SI` and give it the full meaning: `<abbr title="Stroke index">SI</abbr>` plus a
  visually hidden " (stroke index)" so a screen reader says the full words. Do not rename anything
  in the public or print components in this change.
- Leave "Net pts" and "Gross pts" as they are.
- While you are there, make the left label column of each nine table (`Hole`, `Par`, `SI`, `Score`,
  points row) stay visible while the table scrolls sideways: `position: sticky; left: 0` with a solid
  background that works in light and dark mode (use the same background class the cell already has,
  or `bg-surface`), and a z-index that keeps it above the scrolling cells. Do not change the table's
  minimum width.

## Rules to respect

- Strict TypeScript, no `any`, no new dependency, no inline hex colours, no external fonts.
- Do not weaken or delete any existing test. If an existing component test fails because of a label
  or class change you made, update the assertion to the new text only when the old text was exactly
  what you were told to change ("Hcp row"), and say so in your report.
- Plain language in code comments, no em-dash pile-ups.
- Do not run `pnpm check:ui` (it starts a dev server and other builders are running); the
  orchestrator runs it. In your report list which parts of `scripts/verify-ui.mjs` could be affected
  by your changes (selectors, texts, sizes) so they can be checked.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/components/scoring` and run the three again. Commit with one plain
subject line and stop. Do not push. In your final message list the files changed, the classes you
used for the 44px cell and the sticky bar, every judgment call, and anything outside scope you found.
