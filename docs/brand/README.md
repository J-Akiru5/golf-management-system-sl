# TeeLine Golf logo

The stacked lockup: the course-and-flag symbol above the wordmark, with **GOLF** between two rules.
Every file here is traced from the club's brand board, `public/photos/TeeLine Golf Brand Identity
Board.png`, so the letterforms and curves are the board's, not a font approximation.

## Files

All masters live in `public/brand`, so they are served from the site as well as stored with the
project.

| File | Use it on |
| --- | --- |
| `teeline-lockup-primary.svg` | Ivory or white. The default. |
| `teeline-lockup-reverse.svg` | Forest or charcoal. |
| `teeline-lockup-mono.svg` | One colour: engraving, embroidery, single-ink print. |
| `teeline-horizontal-primary.svg` | A wide space: site header, letterhead, email signature. |
| `teeline-horizontal-reverse.svg` | The same, on forest or charcoal. |
| `teeline-symbol-primary.svg` | Forest symbol where the name is already known. |
| `teeline-symbol-reverse.svg` | Ivory symbol, for a forest background. |
| `teeline-app-icon-ivory.svg` | Home screen, avatar, favicon. |
| `teeline-app-icon-forest.svg` | The same, reversed. |
| `teeline-monogram.svg` | A square space too small for the wordmark. |

Raster copies are in `docs/brand/png` (2400 px lockups, 1600 px symbol, 1024 px icons), the whole
vector set is in `docs/brand/teeline-logo-pack.zip`, and `docs/brand/logo-sheet.png` shows every
variant on its background.

## Colours

| Name | Hex | Where |
| --- | --- | --- |
| Forest | `#073D2E` | Wordmark, upper ribbon, background. |
| Gold | `#B89550` | Middle ribbon, flag, rules on light. |
| Gold light | `#D4B46F` | Gold on forest. |
| Ivory | `#F7F5EE` | Reverse wordmark, light background. |
| Muted green | `#8DB39B` | Lower ribbon on forest. |
| Charcoal | `#171C19` | The dark background variant. |

## Using it

- Keep clear space around the lockup of at least the height of the flag.
- Minimum width: 120 px for the stacked lockup, 90 px for the horizontal, 24 px for the symbol.
- Do not stretch, outline, add shadows or recolour outside the palette.
- Do not put the light lockup on a dark background. Use the reverse file.
- Do not rebuild the lockup from separate pieces. Use the files above.

## Where the app uses it

- `src/components/TeeLineLogo.tsx` carries the traced wordmark paths for the headers and auth
  screens, in the light, reverse and mono palettes.
- The app icons in `public/icons` are rendered from `teeline-app-icon-forest.svg` by
  `scripts/make-pwa-icons.mjs`, and the manifest and Apple touch icon point at them.
- The social image in `public/og` is built by `scripts/make-og-image.mjs` from
  `teeline-horizontal-reverse.svg`.
- The stacked lockup is the primary mark for anything that has the room: hero panels, print, decks.

## Surface by surface

Where each surface reads its brand values from. A `.tsx` under a group is that group's shell; the
colours and type are always the tokens in `src/app/globals.css` (`--forest`, `--gold`,
`--gold-on-forest`, `--on-forest`, `--on-forest-muted`, `--on-forest-quiet`, `--f-sans`,
`--f-display`, `--f-serif`), mapped to Tailwind as `--color-*` in the same file's `@theme` block.

| Surface | Name and mark | Tokens |
| --- | --- | --- |
| Player app header | `src/components/ui/AppTopBar.tsx` (`TeeLineLogo variant="reverse"`, `/brand/teeline-horizontal-reverse.svg`), mounted by `src/app/(player)/layout.tsx` | `.shell-chrome.band`, `--forest`, `--on-forest`, `--gold` |
| Player bottom bar and wide nav | `src/components/MobileTabBar.tsx` | `.player-tabbar`, `--surface-raised`, `--ink-muted`, `--forest` for the current tab |
| Player page titles | `(player)/layout.tsx` metadata `template: "%s | TeeLine Golf"`; each page sets `title` | — |
| Player home and cards | `src/app/(player)/my/**`, `src/components/player/**` | `--forest`, `--gold-soft`, `--ink`, `--f-serif` for headings |
| Install and launcher | `src/app/manifest.ts` (`TeeLine Golf · IGCC`, short `TeeLine`, `#073d2e`/`#f7f5ee`), `public/icons/*` from `teeline-app-icon-forest.svg` | the manifest repeats `--forest` and `--surface`, which `src/app/manifest.test.ts` pins |
| Favicon, Apple icon, status bar | `src/app/layout.tsx` `icons` (`/brand/teeline-app-icon-forest.svg`), `appleWebApp.title: "TeeLine"`, `viewport.themeColor` | `#073d2e` light, `#171c19` dark (`--surface` of the dark theme) |
| Sign in, reset, recovery | `src/components/auth/AuthShell.tsx` (`TeeLineLogo` reverse and light), `src/app/(auth)/**` | `.auth-brand` panel, `--on-forest`, `--on-forest-muted`, `--on-forest-quiet`, `--gold-on-forest` |
| Public pages (pairings, roster, leaderboard, enter, faq, feedback) | each page's `public-head` header with `TeeLineLogo variant="reverse"`, e.g. `(public)/pairings/page.tsx` | `.public-head`, `--forest`, `--on-forest`, `--gold-on-forest` |
| Organizer desk and staff app | `src/components/AppShell.tsx` (sidebar) and `src/components/staff/StaffShell.tsx` → `AppTopBar` | `--forest`, `--nav-width`, `--r-*`, `--f-sans` |
| Emails | `src/lib/email/templates.ts` — plain text, signed `TeeLine Golf`, no logo and no colour (a text mail cannot carry either) | — |
| Printed pairings and scorecards | `src/components/print/PairingsSheet.tsx` (`/brand/teeline-horizontal-primary.svg`, `TeeLine Golf`), `src/components/print/print.module.css` (Arial on purpose: print fidelity) | `public/brand` SVGs, fixed ink for paper |
| Offline | `src/app/offline/page.tsx`; the service worker's first-visit fallback in `public/sw.js` inlines the forest band, gold label and name | `#073d2e`, `#f7f5ee`, `#cad7cf`, `#d7b568` copied into the worker, which cannot read CSS |
| Error and 404 | `src/app/error.tsx`, `src/app/not-found.tsx` — the public header with the reverse lockup | `.public-head`, `--on-forest-muted` |
| Social card | `src/lib/seo.ts` `OG_IMAGE` → `/og/teeline-og.jpg`, built by `scripts/make-og-image.mjs` from the reverse horizontal lockup | baked into the image |
| Club display (spotlight) | `src/app/(display)/spotlight/[id]/page.tsx` shows the club and event names, deliberately without the TeeLine wordmark: the screen belongs to the club and no app chrome is on it | `--forest`, `--gold` |
