# Scorecard tabulation page

Date: 2026-11-13

Branch: `feat/scorecard-scan-subapp`

Status: built and gated locally; no database migration and no schema change.

## 1. What this is

A standalone editable scorecard page for the tabulation team, separate from the player-facing
scorecard and from `/scores`. It opens at `/scorecard`, which redirects to the static page at
`/scorecard/index.html`.

The page is a local-first table:

- Every hole is an input. Scores can be typed over, cleared, or marked `X` for a red X.
- Totals and net Stableford points update as the team types.
- The working state is written to the browser's `localStorage` on every change.
- When a tabulation session is present, the same state is saved to a private Supabase Storage
  object every two seconds, and loaded from it when the page opens.
- The page can print the cards, save a PDF, export JSON, and import a JSON file.
- A system check compares each card's name, class, group, tee and playing handicap with the live
  tournament field and can copy the system values onto the card.
- Review batches group cards for a reviewer and expose filters for the cards that still need
  attention.

The page is deliberately not the scan station. The scan station scaffold (`/scan`, `/staff/scan`)
stays a separate, unconnected workflow.

## 2. Access

The tabulation team is a role, not club staff. Adding these accounts to `club_members` would give
them the desk's player and event data through RLS, so the role lives elsewhere:

- `app_metadata.scorecard_role = "tabulation"` on the Supabase user, granted with
  `pnpm scorecard:role -- person@example.com` (add `--remove` to revoke); or
- an address on `SCORECARD_TABULATION_EMAILS`.

`src/lib/scorecards/access.ts` checks either one. Club staff (owner, organizer or desk) can also open
the page through their existing `club_members` role, because they work the same handoff; player
accounts cannot. The API returns 401 when there is no session and 403 when the account is not on the
team. Local development can set `SCORECARD_AUTH=off`; production builds ignore that switch.

The sign-in redirect is allowed to return a staff or unlinked account to
`/scorecard/index.html` (`src/lib/auth/routes.ts`).

## 3. Storage and environment

The saved document is one JSON object per card page in a private Supabase Storage bucket:

- `SCORECARD_BUCKET` (default `scorecard-documents`).
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for the server-side store
  and the field check. The service role never reaches the browser.
- The bucket is created on first use if it does not exist. That needs a key with Storage admin
  rights. No SQL migration is involved.
- `src/lib/scorecards/store.ts` refuses a document that is not a complete object.
- `src/lib/scorecards/document.ts` validates the page state: a `cards` array, at most 200 cards,
  and exactly 18 holes per card. A hole is `1`-`20`, `X`, or blank. It is a structural check, not a
  golf-rule check.

The field check reads `tournaments`, `registrations`, `players`, `flights`, `tees`, `categories`,
`registration_pairs`, `group_members` and `groups` with the service role
(`src/lib/scorecards/field.ts`). It uses the stored class first and the class formula as a fallback,
and it maps White/Blue/Red/Silver to the card letters W/B/L/S.

## 4. What changed

- `src/app/scorecard/page.tsx` redirects to the static page.
- `src/app/api/scorecards/field/route.ts` returns the field for the tabulation check.
- `src/app/api/scorecards/[slug]/route.ts` reads and writes the document.
- `src/app/api/scorecards/[slug]/export/route.ts` downloads the saved payload.
- `src/lib/scorecards/access.ts`, `document.ts`, `field.ts`, `store.ts` and their tests.
- `public/scorecard/index.html` is the page itself; `scripts/scorecard-role.mjs` grants the role.
- `.env.example`, `.gitignore` and `package.json` carry the new configuration and script.
- The sign-in landing rule now keeps a tabulation account on the scorecard path.

## 5. Limits and open items

- **One page per event and day.** The event, label, slug, par, stroke index and tee ratings are
  constants in the page (`SRC`). A new day or event needs a new page or a generated copy. That
  generation is not built.
- **Last write wins.** Two people editing the same slug overwrite each other; there is no revision
  or conflict check. The review batches are a client-side list, not a server record.
- **Trusted role.** The field check uses the service role, which bypasses RLS. It is available only
  to tabulation accounts and club staff. A deployment with more than one club should scope the read
  to the account's club rather than trusting the event name. `club_members` is read with `.limit(1)`,
  so a user in more than one club is not disambiguated yet.
- **No player data is bundled.** The page starts with no cards; the team imports a JSON file or
  loads the saved document.
- **Photo and scan paths are not connected.** This page edits values; it does not read a photo.
- **Retention.** The bucket keeps one object per slug and has no deletion or retention rule yet.

## 6. Verification

- `pnpm check` passed: typecheck, lint, 203 test files, 2,105 tests, and the production build. The
  build lists `/scorecard` as a static route and the three `/api/scorecards` handlers as dynamic.
- `pnpm check:ui` result is recorded below when it has run.

No migration, no schema change, and no change to the existing scoring tables.
