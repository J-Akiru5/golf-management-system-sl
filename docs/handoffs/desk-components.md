# Handoff: registration-desk and shell components (feat/desk-components)

Written 18 Oct 2026 on `feat/desk-components`, branched from `develop` at `b0fa981`. This branch adds
**presentational components only**: no fetching, no store, no Supabase, no auth. The assembler wires
them to the repositories in `src/lib/data/adapters.ts` when the data layer is connected.

## What is here

| Path | What it is |
| --- | --- |
| `src/components/desk/PlayerQuickPick.tsx` | Type-to-search over saved players (combobox + listbox) |
| `src/components/desk/RegisterConfirm.tsx` | The confirm step: event, routing facts, eligibility, duplicates, missing event fields, payment choice |
| `src/components/desk/RegistrationRow.tsx` | `RegistrationRow`, `RegisteredBy` chip, `OverriddenBadge` |
| `src/components/desk/SessionBar.tsx` | Signed-in member, role badge, last saved / saving / error, sign-out slot |
| `src/components/desk/RoleGate.tsx` | Cosmetic hide/disable by role (not a security control) |
| `src/components/desk/DataStatusBanner.tsx` | `DataStatusBanner` (demo / loading / error+retry) and `SaveTruth` |
| `src/components/desk/logic.ts` | Pure helpers: search ranking, eligibility wording, required fields, time labels, role gate |
| `src/components/desk/logic.test.ts` | 36 tests for the above |
| `src/components/desk/types.ts` | The types those components need that the domain does not have yet |
| `src/components/desk/fixtures.ts` | Fictional players for the preview page and tests |
| `src/components/desk/index.ts` | Barrel export for the assembler |
| `src/app/(desk)/components-preview/page.tsx` | Dev-only preview of every component and state (not in the nav, `notFound()` in production) |

36 new test cases; the whole suite is 18 files / 250 tests.

## Where the assembler plugs each one in

1. **PlayerQuickPick** (`/register`, step 1; also any "add a player to the event" flow).
   Props: `items` (build from `players.list()` / `players.search()`, one `PlayerPickItem` per player
   with the frozen `index`, `categoryName`, `playingHandicap` and `alreadyRegistered`),
   `status`/`errorMessage`/`onRetry` (from the load state), `onSelect` (move to the confirm step),
   optional `query`/`onQueryChange`, `selectedId`, `maxResults`, `label`, `hint`, `disabled`,
   `autoFocus`. It never fetches: pass what the repository returned.

2. **RegisterConfirm** (`/register`, step 2, after the player is picked).
   Props: `event` (name, dates, cut-off, format, plus the sample-name and Day-4 warnings),
   `participant` (`item` + `role` + `onRoleChange`), `routing` (category/tee/flight/playing
   handicap/index + the source note), `eligibility` (status/reasons/maxIndex — same values as
   `DeskRegistration`), `duplicate` (from `registrations.list()`), `missingFields` (the event's
   required `RegistrationField`s with no answer yet), `fieldValues` + `onFieldChange`,
   `paymentStatus` + `onPaymentStatusChange`, `paymentNote`, `saveTarget` ("session" or "database")
   and `onConfirm`. On confirm the assembler builds a `NewEntryInput` from the values and calls
   `registrations.add(tournamentId, input)`.

3. **RegistrationRow / RegisteredBy / OverriddenBadge** (`/register` list, draw side panel, any
   "entries" list). Props: identity, role, status, index, playing handicap, flight, payment, shirt,
   tee preference note, `audit` (`addedByName`, `addedAt`, `overridden`, `overrideReason`) and an
   `actions` slot. Every audit prop is optional, so the row renders before the audit columns exist.
   `now` can be passed to make the time labels deterministic.

4. **SessionBar** (desk shell header, above the page content). Props: `member`
   (`{ displayName, role } | null | undefined`), `lastSavedAt`, `saving`, `error`, `onRetry`,
   `signOutSlot` (put the existing server-action form in there; the component must not import auth).
   `undefined` means "no auth in this build", `null` means "signed out".

5. **RoleGate** (around anything the desk role should not touch, e.g. publish, delete, payment
   edits). Props: `role`, `allow`, `mode` ("hide" | "disable"), `disabledReason`. Documented in the
   file: cosmetic only, real enforcement is RLS and the server actions.

6. **DataStatusBanner / SaveTruth** (top of every desk screen). Props: `status`
   ("demo" | "loading" | "ready" | "error"), `errorMessage`, `onRetry`, `detail`, `variant`
   ("banner" | "inline"). `DEMO_DATA_NOTICE` is exported so the wording stays in one place; the
   existing shell badge text can read from it.

## What the components assume (inferences, not verified facts)

- **Eligibility**: `blocked` is true only for `ineligible` (index above the event maximum). A
  `needs_review` player can still be saved; the copy says the entry is kept for review. This matches
  the current desk behaviour, and the engine's own reasons are preferred over generated wording.
- **Duplicates**: a matching entry is shown as a warning and does not block unless the assembler
  passes `duplicate.blocking = true`. Nothing here deduplicates.
- **Payment**: the four `PaymentStatus` values are offered with the existing `PAYMENT_LABEL` text;
  the component says payment is recorded by hand and never claims verification.
- **Audit**: the `addedByName` / `addedAt` / `overridden` columns do not exist yet, so they arrive as
  optional props. The wording assumes a display name and an ISO timestamp.
- **Roles**: `owner | organizer | desk`, the values in the `club_members` check constraint. They are
  redefined in `types.ts` because components may not import `src/lib/auth`.
- **Consent**: photos are shown through `photoOf()`, so a photo without consent never renders.
- **Preview path**: the task asked for `(desk)/_components-preview`; Next treats underscore folders
  as private and never routes them, so the page is at `(desk)/components-preview` instead and is
  blocked with `notFound()` in production.

## Deliberately not in this branch

No data fetching, no Supabase, no auth, no self-service, no account linking, no activity-log screen,
no hole map, no print or scorecard components. Nothing in `src/lib/store`, `src/lib/data`,
`src/lib/supabase`, `src/lib/auth` or `supabase/` was edited.

## Verify

```bash
pnpm typecheck
pnpm test          # 250 tests, 18 files, includes the 36 new logic tests
pnpm lint          # biome: the new files pass
pnpm build
pnpm dev           # then open /components-preview (dev only)
```
