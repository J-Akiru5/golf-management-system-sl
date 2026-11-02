# Player mobile and PWA quality pass

Date: 2 November 2026. Branch: `feat/player-mobile-pwa`, based on `origin/develop` at `8bc468a`.

## Objective

Make the public and signed-in player side feel like a mobile app, not a desktop page folded down,
and make the installed PWA trustworthy before the 24th Bamboo Tee on 12 November 2026.

Owner decisions:

- Public pages and the signed-in `/my` portal are both in scope.
- Installable PWA with offline fallback and cached public/own data; no push notifications yet.
- Keep the TeeLine brand and add a mobile app shell rather than a new template.
- The owner turns off Supabase email confirmation; the app assumes an immediate session.
- The public programme migration is already applied (26 October 2026).
- Target: Lighthouse mobile 90+ where measurable, tested at 360, 390 and 430 widths and one real
  phone before the event.

## Baseline audit

The read-only benchmark found the player side functionally sound but with eight high-leverage
defects: the landing nav ran together at phone widths, no `viewport-fit=cover`, a white iOS status
bar, five surfaces without `<main>`, an orphaned `/leaderboard` with no H1 or bar, 40px primary
controls, an active tab at 4.34:1, and a hard-coded service-worker version that could serve stale
pages forever. Lab timings at 390x844 were LCP 1.6-1.9s, CLS 0, 319-382 KB of JS and no horizontal
overflow. The full report and screenshots are in the audit output from 2 November.

## What changed

- Root viewport: `viewport-fit=cover`; iOS status bar `black-translucent`.
- Public pages: `<main>` on entry, pairings, leaderboard, FAQ and offline; the demo pairings page
  too. The player bar is on the public home, pairings, leaderboard, entry and FAQ.
- Leaderboard: its own title, a real H1, the player bar, and a phone card list that replaces the
  six-column table below `sm`.
- Mobile targets: `.btn` and form inputs are 44px; inputs are 16px on mobile so iOS does not zoom;
  the password toggle is 44px; nav and footer links have 44px targets; the first-run welcome
  controls are 44px.
- Active tab colour is `#d7b568` (7.73:1 on forest).
- The landing nav gap is 14px at phone widths, so "Player pairings" and "NGAP FAQ" no longer run
  together.
- Auth: removed `autoFocus`; login and signup have their own titles; the entry page has a server
  layout for its title.
- PWA: the manifest opens at `/my` and its shortcuts are player-first (`My golf`, `Pairings`,
  `Leaderboard`). The service worker version comes from the build id in the registration URL, so a
  deploy creates new caches and deletes the old ones.
- A dismissible install prompt appears on player/public pages after the platform prompt or, on iOS,
  after six seconds with the Share steps. It is skipped on entry, auth and offline screens and
  remembers a dismissal for 30 days.

## Verification

- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm test`: 891 passed, including a new server-render test for the leaderboard cards and table.
- `pnpm build`: pass.
- Playwright at 360x800, 390x844 and 430x932 with an iPhone UA:
  - one `<main>` on every checked page;
  - player bar on home, pairings, leaderboard, FAQ, entry and `/my`;
  - zero horizontal overflow;
  - zero small buttons/nav/footer targets;
  - the install prompt appears on iOS with the Share instructions.
- The entry form renders 22 inputs with 44px/16px fields. Radio and checkbox inputs remain 18px
  inside their labels; the label is the touch target.

## Remaining

- The owner still needs to turn off **Authentication > Providers > Email > Confirm email** in
  Supabase. Until then a new account waits for a confirmation email.
- Test the installed app on a real iPhone and Android phone: safe areas, status bar, install prompt
  and offline reload.
- The public pairings and leaderboard show empty states until the desk publishes. The programme
  migration is applied, but `public_programme()` returns null until the event is published.
- JS payload reduction, image-cache caps and the offline RSC fallback are later work; the audit
  measured 319-382 KB of JS on a mostly static player site.
- No push notifications and no offline writes in this pass, by decision.

## Rollback

Revert the branch and redeploy the previous tag. The changes are UI, manifest and service worker
only; no database migration and no stored-data change.
