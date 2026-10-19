# Mobile experience and offline use

Status: built on `feat/issue-60-mobile-pwa` (19 Oct 2026). The browser checks below were run on a
desktop Chrome at a 390 px mobile viewport and at a 1280 px desktop viewport. Nothing has been
tested on a physical phone yet.

## The two bottom bars

Both bars are client components in `src/components/MobileTabBar.tsx`, driven by the pure lists in
`src/lib/ui/mobile-nav.ts`. They are fixed to the bottom, include `env(safe-area-inset-bottom)` in
their own padding, reserve the same space under the page content, and are hidden from 1024 px up
where the existing left rail takes over. Every item is at least 44 px tall (the browser check
measured 56 px) and keeps its text label.

### Desk bar (staff)

| Item | Goes to | Why it is there |
| --- | --- | --- |
| Today | `/admin` | What needs attention now, before the next wave. The benchmark found this is the first question on the course. |
| Draw | `/draw` | The live board is the reason to carry the phone on the course. |
| Register | `/register` | The raised centre action: entries, withdrawals and changes on the day. |
| Players | `/players` | Find a member, their index and their contact number. |
| More | opens the existing drawer | Print, Settings, Import, Tournaments, Course and Spotlight. |

The register item is a destination rather than the benchmark's action sheet because the three
things that sheet would do (check in, add a walk-up, withdraw) all live on `/register` today, and
this issue must point at screens that already exist. Print is deliberately not in the bar: the
benchmark's point that A4 output is a desk job, not a phone task, is right, so it sits in More.
The drawer stays on phones. The bar holds four destinations and the desk has eleven; replacing
the drawer would leave no way to reach the rest. The header's menu button and the bar's More
button open the same sheet.

### Player bar

| Item | Goes to | Why it is there |
| --- | --- | --- |
| My golf | `/my` | The player's own entry and published start. |
| Pairings | `/pairings` | The full published list. |
| Club home | `/` | A way back without the browser's back button. |

The bar also appears on `/pairings`, because that is where the Pairings item leads. It does not
appear on the landing page or the entry form. The third item is Club home rather than the
benchmark's Account tab: there is no account screen today. The claim step is on `/my` and sign-out
is in the player header, so an Account tab would either duplicate My golf or open a page that does
not exist.

### How this follows the benchmark

`docs/mobile-benchmark.md` arrived while this was being built, so the first draft was checked
against it and changed.

Followed: four destinations plus one action and a catch-all; Today first; the raised centre
action; labels always visible; short noun labels; one badge rule (none added to the bar); player
bar kept to My golf and Pairings.

Diverged, with reasons: Register is a link to `/register` rather than an action sheet because the
actions live on that existing screen; Club home replaces Account because no account screen exists;
the bar stays on the forest band rather than the page surface because it continues the header and
the gold active state was contrast-checked against the existing tokens.

The benchmark also asked for one navigation source so the rail and the bar cannot drift. The bar
lists live in one pure module, and its test asserts every desk href is in `STAFF_PREFIXES`; the
labels and test ids are narrowed for a thumb. A full shared array would mean moving the rail's
alert counts and order out of `AppShell`, which is a larger refactor than this issue.

### Test ids for the "Show me" tour

The bar and every control have a stable `data-testid`:

- `desk-bottom-bar`, `desk-bar-draw`, `desk-bar-register`, `desk-bar-players`,
  `desk-bar-print`, `desk-bar-more`
- `player-bottom-bar`, `player-bar-my-golf`, `player-bar-pairings`, `player-bar-home`

The ids are asserted in `src/lib/ui/mobile-nav.test.ts`; renaming one is a deliberate contract
change, not a tidy-up.

## Installability

- `src/app/manifest.ts` serves `/manifest.webmanifest` with `display: standalone`, scope `/`,
  forest theme colour, ivory background, and the club crest as 192 px, 512 px and maskable 512 px
  icons. Shortcuts point at Draw, Register and My golf.
- The icons live in `public/icons/` and are committed. `scripts/make-pwa-icons.ps1` regenerates
  them from `public/brand/igcc-crest.png` with Windows `System.Drawing`. No build step fetches an
  icon from a CDN, which keeps the repo's "assets are bundled" rule.
- The crest is a 320 px PNG, so the 512 px icon is an upscale. Replace it when the club supplies
  a vector crest (PLAN.md, decision 11).
- The root layout keeps the light and dark `theme-color` values in its `viewport` export. A
  manifest has one `theme_color`; the two-tag viewport is what a browser actually honours by
  scheme.
- The service worker is registered only in a production build (`next start` or the deployed
  build). Under `next dev` a cache-first worker would serve yesterday's chunks while the
  developer edits, so it is deliberately off there.

## What the service worker does

Next.js 16 has no built-in service worker or PWA guide: the PWA and service-worker pages that
exist in older Next documentation are not present in `node_modules/next/dist/docs` for 16.4.2.
The worker is therefore a plain file at `public/sw.js`, served from `/sw.js`.

- `install` precaches `/offline`, the manifest, the icons and the two brand marks. Each asset is
  optional on its own; one missing file cannot fail the install.
- Static build files (`/_next/static/`, fonts, images, icons) are cache-first.
- A navigation, or the RSC request behind a real client-side navigation, is network-first and
  cached only after it succeeds. The last successful copy is used when the network fails.
- Next's background prefetches (`Next-Router-Prefetch: 1`) are not cached. A prefetch is not a
  screen the person opened, so it is not the "last seen" screen.
- A page that was never opened gets `/offline`, a static page that explains the state.
- `activate` removes old `teeline-*` caches. Bump `VERSION` in `sw.js` when a release changes the
  shell in a way that must invalidate old copies.
- Cross-origin requests, `/api/` and `/auth/` are never touched. Supabase responses and signed
  photo URLs therefore never enter the cache.

The worker does not queue writes and does not replay anything. It is a read cache only.

## What data is cached

| Data | Where | What it contains | Expiry |
| --- | --- | --- | --- |
| Desk read | IndexedDB `teeline-offline`, key `desk:<auth user id>` | The same `DeskState` every desk screen draws from, the draw revisions and the member label. Player photo URLs are removed before writing. | 30 days |
| Player read | IndexedDB, key `player:<player id>` | The `player_portal_entries` projection: name, NGAP id, entries, published start. The projection has no phone number, birthdate, payment detail beyond the status, or photo. | 30 days |
| Pages and RSC | Cache Storage `teeline-pages-v1` | The last successful response for pages actually opened. | Until replaced or cleared |
| Static files | Cache Storage `teeline-shell-v1` | Build chunks, bundled fonts, icons, brand marks. | Until a new worker version |

Rules that keep it honest:

- A desk restored from IndexedDB is labelled on every desk screen by `DeskStatusStrip`:
  "Showing what was on screen at 6:42 AM. Not connected." with a Try again button. It never says
  live, published or final.
- A player page served from the page cache shows the same sentence when `navigator.onLine` is
  false. The `/offline` page reads the player snapshot and repeats it above the entry.
- If the snapshot is older than 30 days it is not restored at all. The desk shows an error and
  the offline page says no saved copy is available.
- The player copy is built by `toPlayerSnapshot`, which lists the allowed fields explicitly. The
  desk copy runs `stripPlayerPhoto` on every player. Both choices are tested.
- Nothing else from Supabase is cached: no blanket fetch interception, no table response cache.

## Signing out

`SignOutForm` clears the phone before it submits the server sign-out action:

1. Empties the `snapshots` store in IndexedDB.
2. Removes every `teeline:` key from `localStorage`, including the last user and last-seen marks.
3. Deletes every Cache Storage cache whose name starts with `teeline-`, including the cached
   pages, and asks the active worker to do the same.

`OfflineRuntime` also listens to Supabase auth: `SIGNED_OUT` clears everything, and a `SIGNED_IN`
for a different account than the one that wrote the snapshots clears before the new account
loads. That covers a shared phone where the session expired and a second account signed in
without using the button.

Player photos are never in the desk snapshot (the URL is stripped) and Supabase storage is
cross-origin, so the worker never caches the image bytes either.

## Writing while offline

Two checks, in this order:

1. The desk dispatcher refuses a data-changing action before it reaches the reducer when the
   browser reports no connection or the desk is running from a saved copy. The screen is
   unchanged.
2. The Supabase write queue refuses before it starts when `canWrite()` is false, and reports
   `OFFLINE_WRITE_NOTICE`. A network failure inside an attempted write is mapped to the same
   sentence: "You are offline, so this change was not saved. Nothing is queued and nothing is
   sent later. Reconnect, then try again."

There is no background sync and no write queue. A change made with no connection must be made
again after reconnecting.

## Limits and what is not verified

- No physical phone or iPhone safe-area check. The layout was measured in headless Chrome at
  390×844 with `env(safe-area-inset-bottom)` treated as 0; the CSS padding is in place but the
  notch/home-indicator result is unverified.
- The offline desk restore was not exercised against the real Supabase project: that needs a
  signed-in staff account and a real club read. The restore path is unit-tested through the pure
  snapshot rules, and the worker was verified to serve the desk shell with the network disabled,
  but the signed-in cold start is unverified.
- Browser storage can be evicted by the OS. The app then shows the no-saved-copy message rather
  than pretending.
- The benchmark recommends caching only the published snapshot and refusing the live draft board.
  This build caches the full desk read, because the desk's own screens (players, registration,
  handicap review) need it offline; photos are the line it keeps. If the owner wants the stricter
  published-only cache, the desk snapshot should be replaced with the published projection and the
  desk screens should refuse to show cached players.

## Verification run

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (31 files, 359 tests) and `pnpm build` pass.
- Headless Chrome at 390 px: desk bar 5 items, each 56 px, active Draw, no horizontal overflow;
  player bar 3 items, active Pairings.
- Headless Chrome at 1280 px: both bars `display: none`, the left rail `display: flex`.
- Service worker registered and activated; `teeline-shell-v1` and `teeline-pages-v1` created.
- With `Network.emulateNetworkConditions({ offline: true })`, reloading `/draw` still rendered
  the desk shell and the bar from the cache.
- With a seeded player snapshot, `/offline` rendered Maria Santos, Hole 10A at 7:48 AM and the
  "Showing what was on screen at … Not connected." notice.
