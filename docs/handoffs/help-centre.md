# Handoff: the help centre

What it is, where the pieces live, and how to change them without breaking the checks.

## The shape

- A **"?" in each shell**: the desk's top bar (`AppShell`, next to the alerts bell), the player
  header (`(player)/layout.tsx`), and the pairings page head (`(public)/pairings`, both the real and
  the demo page). It opens a side panel with a step list for whatever screen the reader is on.
- A **step that names a control** carries a "Show me" button. It closes the panel, scrolls the
  control into view, moves focus to it if it takes focus, and rings it for about two and a half
  seconds. Screens "opt in" by putting `data-help="<anchor>"` on the control.
- A step whose control is on **another screen** carries a route (or inherits its guide's first
  route). "Show me" remembers the anchor, navigates there, and rings the control only once that
  page has rendered and its box has stopped moving. Two shells mounted by the navigation cannot
  draw two rings; the request is claimed once.
- A **first-run welcome**, one per audience (desk, player). Dismissed once per person.
- A **printable cheat sheet** as Print center's fourth tab ("How to"). Its player half prints in
  English, Tagalog or Hiligaynon, for the clubhouse board.

## Where things live

| Piece | File |
| --- | --- |
| Guide content, desk (English literals) and player (dictionary keys) | `src/lib/help/guides.ts` |
| The shape of a guide, and `helpText()` | `src/lib/help/types.ts` |
| The "show me" ring | `src/lib/help/highlight.ts` + `.help-ring` in `src/app/globals.css` |
| Seen-state (database + localStorage) | `src/lib/help/seen.ts` |
| The panel, button, welcome and cheat sheet | `src/components/help/` |
| The player copy, in three languages | `help.*` in `src/lib/i18n/dictionaries/{en,tl,hil}.ts` |

## Changing copy

- **Desk guide**: edit the literal in `guides.ts`. There is one copy and it is English by decision
  (see decision 18 in `docs/PLAN.md`).
- **Player guide or the help panel's own words**: edit all three dictionaries. A missing key is a
  compile error, and `pnpm test` fails if a key is empty or loses a `{placeholder}`. The review
  checklist for Tagalog and Hiligaynon is `docs/i18n-review.md`.

## Adding a step that points at a control

1. Put `data-help="my-anchor"` on the control (lowercase, digits and dashes only: it reaches a CSS
   selector). Components such as `SectionCard` and `Panel` accept the same value as a `dataHelp`
   prop.
2. Add the step with `anchor: "my-anchor"` to a guide. If the control is not on the guide's own
   route, add `route: "/the-screen"` to the step.
3. Run `pnpm test`. A test scans `src/` for every `data-help`: a step pointing at a control that does
   not exist fails, a control whose anchor no guide explains fails, and an anchored step with no
   route fails. The three chrome anchors (`help-button`, `help-sheet`, `help-welcome`) are excepted.
4. If the control only exists in some states (pairings before they are published, the claim form
   after a player is linked), the panel says so instead of doing nothing.

## Seen-state

`supabase/migrations/20261028000000_help_seen.sql` creates `help_seen` (one row per person per panel
they dismissed; `user_id` defaults to `auth.uid()`, RLS restricts a row to its owner). **It is
applied** (18 Oct 2026, in the SQL editor) and verified from outside the app: an anonymous select
returns no rows, a select of all three columns succeeds, and an anonymous insert is refused with
`42501`. The app still writes this browser's `localStorage` as well, which is what makes the demo
build behave the same; clearing that key (or deleting the row) brings the welcome back. The preview
page (`/components-preview`) has a forced-open copy of it.

## The panels are not modal, on purpose

Both the welcome and the help panel open non-modally. A modal marks the rest of the page
`aria-hidden` the moment it opens; when that lands while React is still hydrating, React reports the
changed attributes as a hydration mismatch. They are advice, not gates: Escape closes them, the
backdrop takes the click, focus moves into them, and the page behind is never touched.

## Verifying a change

```bash
pnpm typecheck && pnpm lint && pnpm test     # unit tests, including the anchor scan
pnpm dev --port 3112                          # in one terminal
UI_BASE=http://localhost:3112 pnpm verify:ui  # in another
```

The browser script's "help centre", "cheat sheet", "help centre (player, Hiligaynon)" and
"first-run welcome" sections cover the panel, the ring (on this screen and after navigating from
another one), the print sheet and the once-only behaviour.
