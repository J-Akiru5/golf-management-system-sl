# TeeLine Golf logo

The stacked lockup: the course-and-flag symbol above the wordmark, with **GOLF** between two rules.

## Files

| Folder | What is in it |
| --- | --- |
| `svg/` | The vector masters. Every lockup is outlined, so no font is needed to open or print it. |
| `png/` | Transparent renders: 2400 px for the lockups, 1600 px for the symbol, 1024 px for the icons. |
| `teeline-logo-pack.zip` | The whole `svg/` folder in one download. |
| `logo-sheet.png` | Every variant on its intended background, plus the palette. |

## Which file to use

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
| `teeline-monogram.svg` | A square or circular space too small for the wordmark. |

## Colours

| Name | Hex | Where |
| --- | --- | --- |
| Forest | `#073D2E` | Primary ribbon, wordmark, background. |
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
- Do not rebuild the lockup from separate pieces.

## Relationship to the running app

The site still renders the earlier side-by-side lockup from `src/components/TeeLineLogo.tsx`, and
`public/brand/` still holds the matching files. This folder is the stacked mark, ready to adopt.
Adopting it means updating that component, the app icons and `public/brand/`.
