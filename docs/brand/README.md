# TeeLine Golf brand assets

Everything needed to put the TeeLine Golf logo on a page, a deck, a banner or a shirt.

## Vector masters: `public/brand`

| File | Use it on |
| --- | --- |
| `teeline-logo.svg` | Ivory or white. The primary lockup. |
| `teeline-logo-reverse.svg` | Forest or a photo. |
| `teeline-logo-mono.svg` | One colour only: engraving, embroidery, fax, single-ink print. |
| `teeline-symbol-light.svg` | Forest symbol, where the name is already known. |
| `teeline-symbol-reverse.svg` | Ivory symbol, for a forest background. |
| `teeline-app-icon.svg` | Home screen, avatar, favicon. |

The three wordmarks are **outlined**: the letters are paths, not live text. No font has to be
installed for them to render, so a print shop, Illustrator, Inkscape and a browser all show the same
shapes. The app itself draws the wordmark from `src/components/TeeLineLogo.tsx`, which uses the
bundled Manrope webfont.

## Raster exports: `docs/brand/exports`

Transparent PNGs, three sizes per wordmark.

| Width | Use |
| --- | --- |
| 4400 px | Tarpaulin, banner, print at 300 dpi up to about 370 mm wide. |
| 2200 px | Decks, large screens, social covers. |
| 880 px | Web and chat. |

`docs/brand/logo-sheet.png` shows every variant on its intended background.

## Colours

| Name | Hex | Where |
| --- | --- | --- |
| Forest | `#073D2E` | Primary ink, app background. |
| Gold | `#B89550` | The middle fairway, the flag. |
| Gold ink | `#755719` | The "GOLF" descriptor on light. |
| Ivory | `#F7F5EE` | Reverse wordmark, light background. |
| Reverse gold | `#D4B46F` | Gold on forest. |
| Muted green | `#8DB39B` | The lower fairway on forest. |
| Ink | `#202522` | Monochrome wordmark. |

## Using it

- Keep clear space around the logo of at least the height of the flag.
- Minimum width: 120 px for the wordmark, 24 px for the symbol.
- Do not stretch, outline, add shadows, or recolour outside the palette.
- Do not put the light wordmark on a dark background. Use the reverse file.
- Do not rebuild the lockup from separate pieces. Use the files above.
