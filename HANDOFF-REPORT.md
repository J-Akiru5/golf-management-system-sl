# Handoff report: issue #171, notification mark as read

Worktree: `S:\Dev\golf-management-system-sl\issue-171`
Branch: `fix/171-bell-mark-read`
Base commit: `8dad2e2`
Commits made (not pushed):

- `855800b` Add per-item read rules to the alerts model, with tests
- `8b1c015` Add a per-user read write for one notification
- `690abd8` Add Mark as read and Mark all as read to the alerts panel
- `6607a1d` Check the bell's read controls and navigation close in the browser suite
- `8c8038e` Keep focus on the bell when a panel link navigates away

## What changed and why

1. **Per-item read rules in the alerts model** (`src/components/notifications/alerts.ts`).
   A stored notification row can be marked read whatever its severity, and any info item can be
   marked read. A live draw issue or a live new-entry alert of blocking or warning severity cannot:
   it clears only when the cause is fixed, so a read mark there would hide a problem instead of
   quieting a notice. The badge rule is untouched: unresolved blocking and warning items count
   whatever their read state.

2. **A per-user write for one notification** (`src/lib/data/notifications.ts`, `src/lib/supabase/types.ts`,
   new migration). The existing plural function still backs Mark all as read. A new singular function
   writes one read row for the signed-in member, scoped by the same club membership check and the
   existing RLS policy. Read state is per user and survives a refresh because it is stored in
   `notification_reads`, not in the browser.

3. **The bell's panel** (`src/components/notifications/AlertsBell.tsx`).
   - Each stored notification and each info item has a visible Mark as read button.
   - The panel header has Mark all as read while anything is left to mark.
   - Live blocking and warning issues show a short note instead: "Stays until the problem is fixed."
   - Already-read items show a Read mark and stay listed.
   - Demo mode keeps read marks in local state, as asked. A live info item has no stored row, so its
     mark is local everywhere and goes when the issue goes.
   - The panel closes whenever the route changes, including a click on the rail or the mobile menu.
     A link inside the panel hands focus back to the bell as it closes; a rail or nav click keeps
     focus where the desk went.
   - The page behind the open panel is scroll-locked, and the lock is released on every close path,
     including navigation and unmount.
   - Below `lg` it is still the full-width sheet, with the read controls inside it.

4. **Docs.** `CHANGELOG.md` has an Unreleased Fixed entry. `docs/PLAN.md` row "Alerts" and roadmap
   item 7 now record the per-item read work and name the migration.

5. **Browser suite** (`scripts/verify-ui.mjs`). Added checks for the scroll lock, the per-item
   control, the header control, the non-dismissible note, the badge change, the Read mark, closing
   on rail navigation, focus after navigation, and Mark all as read on the phone sheet.
   Also repaired a stale selector in the existing `/register paging` section: it looked for
   `div.grid.gap-2 > article`, but the list renders team cards inside `div.grid.gap-2.5`, so the
   check was already failing before this change. It now counts the `article` team cards. No check
   was removed, skipped or weakened.

## Files changed

- `src/components/notifications/alerts.ts`
- `src/components/notifications/alerts.test.ts`
- `src/components/notifications/AlertsBell.tsx`
- `src/lib/data/notifications.ts`
- `src/lib/data/notifications.test.ts`
- `src/lib/supabase/types.ts`
- `supabase/migrations/20261108000200_notification_single_read.sql` (new)
- `scripts/verify-ui.mjs`
- `CHANGELOG.md`
- `docs/PLAN.md`

## Migration

File: `supabase/migrations/20261108000200_notification_single_read.sql`

It creates one function, `public.mark_notification_read(p_notification uuid)`. It looks up the
alert's club, refuses a missing alert and a non-member, inserts one `notification_reads` row for the
signed-in user with `on conflict (notification_id, user_id) do nothing`, and returns the row count.
It is **purely additive**: a new function only. No table, column, index or policy is created,
altered or dropped, and the existing plural function is unchanged. It is **written but NOT applied**
to any database.

## Commands run and results

Targeted tests during the work:

```
pnpm vitest run src/components/notifications/alerts.test.ts src/lib/data/notifications.test.ts
 Test Files  2 passed (2)
      Tests  52 passed (52)
```

Final gate, run once at the end:

```
pnpm typecheck
> tsc --noEmit
(no output, exit 0)

pnpm lint
> biome check .
Checked 454 files in 178ms. No fixes applied.

pnpm test
 Test Files  120 passed (120)
      Tests  1203 passed (1203)
   Duration  8.59s
```

Browser check, demo mode, `pnpm dev --port 3171`, headless Chromium:

- Targeted script (gitignored scratch file, not committed): **19 passed, 0 failed**.
  Observed: the open panel locks page scroll; a locked group produces a live info item with Mark as
  read; the header shows Mark all as read; 19 live blocking/warning items show the "Stays until the
  problem is fixed." note; marking one read leaves a Read mark and keeps the item listed; the badge
  went from `Alerts, 20 need attention` to `Alerts, 19 need attention`; clicking the rail's Players
  link closed the panel, left the URL at `/players`, released the scroll lock, and focus stayed on
  the `/players` link; Mark all as read marked the item and removed the header control; Escape
  returned focus to the bell; the 390 px sheet was 390 px wide, started at y=84, had no sideways
  overflow and offered Mark as read.
- Repo suite `node scripts/verify-ui.mjs` with `UI_BASE=http://localhost:3171`: **120 passed,
  0 failed**. The added bell checks passed, including "following Fix returns focus to the bell rather
  than the page body". The process still exits 1 because the suite fails on any console error, and it
  collected two pre-existing hydration mismatch errors from `/admin`: `DivisionsPanel` renders an
  SVG arc whose path numbers are rounded differently on the server and client (for example
  `...57691` against `...576902`). That is unrelated to this change: it is in the course-map panel,
  and it was present in the first browser run before any bell checks were added.

The dev server was stopped afterwards; nothing is listening on port 3171.

## What could not be verified

- **No live Supabase project was touched.** The connected mark path is covered by fake-client tests
  that assert the exact RPC names and arguments and the error handling. Per-user persistence relies
  on the existing `notification_reads` RLS policy and the new security-definer function; it was not
  exercised against a real database because the migration is not applied.
- **The migration is not applied**, so connected mode will return an RPC error for a single item
  until it is applied. Mark all still works on the plural function.
- The browser checks ran in demo mode only.

## Risks and notices

- A live info item (for example "1 group locked") has no stored row. Its read mark is local and
  clears on refresh when the derived issue changes. That is intentional, but a desk member may
  expect it to persist like a stored notice. The panel copy says read marks are per person, not that
  a derived info item resets.
- Mark all as read calls the plural function, which marks every outstanding stored alert for the
  event, including rows de-duplicated out of the visible list. The badge is unaffected for blocking
  and warning, so no problem is hidden, but the write is broader than the visible list.
- The scroll lock is applied at every breakpoint, not only below `lg`. This prevents background
  scrolling on desktop too and is the behaviour the browser check asserts.
- The two `/admin` hydration console errors make `verify-ui` exit non-zero even when every check
  passes. This is a pre-existing repo issue, not introduced here.

## Follow-up issues noticed

1. **Pre-existing hydration mismatch in the control room's divisions dials** — `DivisionsPanel`
   renders an SVG arc path with floating-point values that differ between server and client, so
   `pnpm verify:ui` logs two React hydration errors on `/admin` and exits non-zero despite 120
   passing checks.
2. **Apply `20261108000200_notification_single_read.sql` to the development project** — Per-item
   Mark as read needs the new function before it can work in connected mode; the plural path is
   already live and unaffected.
3. **Decide whether a live info read mark should persist** — Today it is local because the issue is
   derived from the draw. If the desk wants "5 groups locked" to stay read across a refresh, it would
   need a stored acknowledgement keyed by issue, which is a design change.
