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

## Relationship to the running app

The app still renders the earlier side-by-side lockup from `src/components/TeeLineLogo.tsx` and the
older files `public/brand/teeline-logo*.svg`. The traced stacked set above is ready to adopt; doing
so means changing that component, the manifest icons and the social image.
