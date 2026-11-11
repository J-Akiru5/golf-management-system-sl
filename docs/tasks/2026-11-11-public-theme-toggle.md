# Public tournament theme control (issue 217)

## Objective

Show the existing light/dark theme control on the public tournament pages, so a player can switch
between System, Light (Ivory) and Dark (Charcoal) from the pairings, roster, leaderboard and rules
screens.

The theme system itself already existed: `ThemeToggle`, the three choices, `localStorage`
persistence, the pre-paint script, `ThemeSync`, `data-theme` tokens and the contrast tests. Only the
control was missing from the tournament headers.

## Branch

- Repository: `golf-management-system-sl`
- Worktree: `C:\Users\Client\Teeline Golf\wt-217-theme-toggle`
- Branch: `feat/issue-217-theme-toggle`, based on `origin/develop` at `bb790c4`
- Issue: #217

## What changed

- Added `<ThemeToggle compact tone="nav" />` beside the language and help controls on:
  - `/pairings` (`src/app/(public)/pairings/page.tsx`)
  - `/roster` (`src/components/public/RosterView.tsx`)
  - `/leaderboard` (`src/components/public/LeaderboardShell.tsx`)
  - `/rules` (`src/app/(public)/rules/page.tsx`)
- Added the same control to the demo pairings header, so the no-database preview matches the live
  page.
- Added a browser check for all four pages in `scripts/verify-ui.mjs`.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 182 files, 1885 tests passed.
- `pnpm build`: passed.
- `pnpm check:ui`: 171 checks passed, 0 failed, 0 console errors.
- The browser check confirms a `Colour theme:` control on `/pairings`, `/roster`, `/leaderboard`
  and `/rules`.

## Notes

- The control is the existing one from the public home page. No theme tokens, storage or contrast
  behaviour changed.
- The theme labels remain English, as on the public home page. Translating the toggle was not part
  of this issue.
