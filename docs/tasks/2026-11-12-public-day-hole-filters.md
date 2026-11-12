# Public pairings day and hole dropdowns

## Objective

Replace the public pairings day pills with a day dropdown and add a starting-hole dropdown.
The change is for the public pairings view (`/pairings`) and the same component used by the
signed-in player and the organizer's publish preview.

## Branch

- Repository: `golf-management-system-sl`
- Worktree: `C:\Users\Client\Teeline Golf\wt-day-hole-filters`
- Branch: `feat/public-day-hole-filters`, based on `origin/staging` at `a45495f`
- No migration

## What changed

- The `Day 1` / `Day 2` pills are now a labelled **Day** dropdown. The option text keeps the day
  label and date, and the last chosen day is still remembered in `localStorage`.
- A labelled **Hole** dropdown lists only the starting holes present in the current day. It offers
  **All holes** plus one option per hole, and resets to all holes when the selected day has no such
  hole.
- A search still looks across every day. A flight filter now stays within the selected day, so the
  day dropdown remains the authority while browsing. Searching across days keeps the hole options
  scoped to the days being shown.
- The flight selector gets a visible **Flight** label, matching the Day and Hole labels. The filter
  row wraps on narrow screens.
- The empty state treats a hole-only filter like any other filter and offers **Clear filters**.
- Added translations for the new labels in English, Tagalog and Hiligaynon.
- Added browser checks for the day options, the day switch, the hole options and the card-level
  hole filter.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 188 files, 1940 tests passed.
- `pnpm build`: passed.
- `pnpm check:ui`: 170 checks passed, 0 failed, 0 console errors, including the new day and hole
  filter checks.

## Next

Manual review on the local server. If the UX is approved, open a staging promotion PR; no push or
merge has been made from this branch yet.
