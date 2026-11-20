# Brief: PUBLIC DESIGN (one look across every public page)

Branch `public/design`, from `feat/public`. Common rules attached. A structure builder is building the
Events pages and the tick-box feedback form at the same time; a chatbot builder is working on the chat.
Do not touch their paths (listed under "Not yours").

## The owner's words

"On the public page, when we swap to feedback it feels like another dimension, same on tournament
rules." "The desktop site on the complaints does not use the full width with correct padding."
Tournament rules leaves the top navbar; an Events portfolio takes its place.

## You own

- New `src/components/public/PublicShell.tsx` (server component) and `src/components/public/public.css`.
- New `src/components/public/PublicHeader.tsx` and `PublicFooter.tsx`.
- `src/app/(public)/layout.tsx` (markup and classes only; keep the i18n provider, `lang`, the install
  prompt and the feedback link behaviour).
- The nav in `src/components/landing/LandingHero.tsx` (only the nav links) and `landing.css` if needed.
- Markup classes and styles (not data, logic or copy meaning) of these existing pages:
  `src/app/(public)/pairings/**`, `results/**`, `roster/**`, `leaderboard/**`, `faq/**`, `enter/**`,
  `join/**`, `privacy/**`, `terms/**`, `demo/page.tsx`.

## Not yours

`src/app/(public)/events/**`, `rules/**`, `feedback/**`, `src/components/public/FeedbackForm.tsx`,
`src/lib/**`, `supabase/**`, `src/app/api/**`, `src/components/chat/**`.

## Build

1. **`PublicShell`** (`{ children, wide?: boolean }`): the shared frame for every public page: the
   `PublicHeader`, a `<main className="tl-pub">` content area, and the `PublicFooter`. It imports
   `public.css`. Content width follows the landing: `max-width: 1280px` with side padding
   `max(24px, calc((100vw - 1280px) / 2))` on desktop (so wide screens keep correct margins and the
   ground spans the full viewport), 20 px on phones. `wide` allows full-bleed sections.
2. **`PublicHeader`**: the landing's nav, shared: reverse TeeLine logo to `/`, links **Events**
   (`/events`), **Player pairings** (`/pairings`), **Results** (`/results/all`), **NGAP FAQ** (`/faq`),
   **Feedback** (`/feedback`), and on the right Sign in and the light **Request a demo** button. Mark
   the current page (`aria-current`). On phones collapse to the logo plus a menu button (a small client
   component) or keep the existing bottom bar (`PublicBottomBar`); choose the cleaner one and keep the
   bottom bar if pages rely on it.
3. **`PublicFooter`**: the landing footer's look (logo, the three partner links from
   `src/lib/public/about.ts`, privacy, terms, feedback, sign in). Reuse, do not duplicate data.
4. **The landing nav**: replace "Tournament rules" with "Events" (`/events`) in `LandingHero.tsx`.
5. **`public.css`**: tokens and shared classes in the landing's language, scoped under `.tl-pub`:
   `tl-pub-kicker`, `tl-pub-title` (Bebas or the landing h2 style), `tl-pub-section`, `tl-pub-card`
   (raised dark card, hairline border, 14 px radius), `tl-pub-chip` (+ `is-live`, `is-done`,
   `is-upcoming`), `tl-field`, `tl-input` (dark inputs, 48 px tall, 16 px text), `tl-check-grid`,
   `tl-check` and `tl-radio` (custom-styled, large: 28 px box, ivory border, gold fill and check mark
   when ticked, the whole row clickable, focus ring in gold; native inputs kept for accessibility,
   visually replaced with `appearance: none`), `tl-reveal-field` (indented follow-up, slides in with
   opacity and transform only), buttons reusing the landing's `tl-button` look.
6. **Apply the shell** to the pages you own: wrap them in `PublicShell` and move their visual styling
   to the shared classes so they read as one product with `/`. Keep every piece of data, every
   release check and every link exactly as it is. Print styles (`no-print`, print pages) must keep
   working.

## Performance

No new client JavaScript except the small phone menu if you build one. Transform and opacity only for
motion; respect reduced motion. Images lazy with `sizes`.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass (update render tests whose markup you changed, never
weaken them). Final report as in the common rules, with a list of every page you restyled.
