# Issue #151: remaining optimistic writes

Branch `fix/151-optimistic-writes`, worktree `S:\Dev\golf-management-system-sl\issue-151`.
Three local commits. Nothing pushed or merged. No database was contacted, no migration written.

## What changed and why

The desk used to change its own state before the database answered in three places. A refusal then
left the screen showing a value that was never saved until a reload. Each operation now has its own
answer:

### `updateEntry`, through `registrations.update`

- Before: the patch was shown at once and a refusal put the whole previous entry back, which could
  erase a later edit. The row sent to the database was built from the render the adapter was created
  in, and an offline refusal (which happens before the queue starts) never ran the rollback at all.
- After: still shown at once, because the inline payment control has to answer the tap. A refusal
  restores only the fields this write set, and only while they still hold that value. The row is read
  when the write runs, so it carries an earlier queued edit instead of overwriting it. An offline
  refusal puts the value back too.

### `overrideReady`

- Before: it already wrote before showing (fixed in an earlier issue), but it dispatched the whole
  entry from a call-time snapshot, and the register page also wrote the player birthdate
  optimistically. A refused registration could leave the database and the screen disagreeing about
  the birthdate, and a later player save could write the older date back.
- After: it writes the player row and the registration row, shows the birthdate as soon as its own
  row lands, shows the ready state only when the registration row lands, and dispatches only the
  fields the override sets.

### Setup saves (`setup.save`, `setup.confirmCourse`)

- Before: the draft went into the desk state before the database answered, only the card-confirmation
  flag had a partial put-back, and a refused confirmation tick stayed on screen.
- After: both are dispatched only after their writes land, laid over the event as it is now so a
  change made in the meantime is not reverted. The Settings screen waits for the confirmation write
  and puts the tick back when it is refused.

### One store bug found by the review

`latest.current` was only advanced by the draw branch and by `apply()`. Ordinary actions
(`updateEntry`, `saveSetup`) dispatched straight to the reducer and left the ref behind until the
next render, so an adapter reading it from the next queued write could see the state from before its
own dispatch. The store now sets the ref in the same call that dispatches, which is what its own
comment already claimed, and the adapters read it through the new `currentState` option.

Demo mode (no Supabase) is untouched: the mock adapters still change state instantly.

## Files

- `src/lib/data/supabase/adapters.ts` (the fix: `currentState`, `refusedPart`, `shownSetup`, the
  three operations, `confirmCourse`)
- `src/lib/store/desk-store.tsx` (set `latest.current` before the render; pass `currentState`)
- `src/lib/data/adapters.ts` (`confirmCourse` may resolve, so a screen can wait for it)
- `src/app/(desk)/register/page.tsx` (stop the second, optimistic birthdate write)
- `src/app/(desk)/setup/page.tsx` (wait for the confirmation; put the tick back on refusal)
- `src/lib/data/supabase/optimistic-writes.test.ts` (new)
- `src/lib/store/state.ts` was not touched, and no migration file was added.
  `git diff 8dad2e2..HEAD -- src/lib/store/state.ts` is empty.

## Commands run and results

- `pnpm vitest run src/lib/data/supabase/optimistic-writes.test.ts` -> 21 tests passed.
- `pnpm vitest run src/lib/data/supabase/ src/lib/store/` -> 20 files, 182 tests passed.
- `pnpm typecheck` -> `tsc --noEmit`, no diagnostics.
- `pnpm lint` -> `biome check .`, 454 files, no fixes applied.
- `pnpm test` -> 121 files, 1208 tests passed.
- `pnpm build` was not run; the orchestrator runs it.

## What the tests cover

A small harness keeps the newest state behind a getter, applies actions through the real reducer,
and answers each database write on demand (accept or refuse). It mirrors the provider now that the
provider advances its ref before rendering.

- registration edit: success, database refusal, offline refusal, and a refused first edit followed by
  a later edit that lands (the later value survives and its write carries the rolled-back value).
- manual override: success, refusal (still in review, nothing dispatched), an edit queued behind it
  in both directions, and the player-birthdate branch in both directions.
- setup save: success, refusal (nothing dispatched, last saved setup kept), a refused first save
  followed by a later one, the withdrawal of the card confirmation when the setup write is refused,
  and the case where the numbers land but the confirmation-only write is refused.
- course confirmation: success, refusal, and demo mode.
- demo mode: registration edit, override and setup save all apply at once.

## Could not verify

- A real browser round trip. Vitest here only includes `src/**/*.test.ts` and there is no DOM test
  setup, so the provider and the Settings screen were reviewed from code, not exercised in a page.
- The SQL behaviour of `save_event_setup` and the registration updates. No database was contacted;
  the payload shapes are unchanged and were read from the migrations.
- The queue's real network timings. The harness resolves writes on demand.

## Risks

1. The Settings draft is re-seeded from the desk whenever the event object changes. Because the
   setup save now changes it after the round trip, text typed between pressing Save and the write
   landing can be replaced by the saved snapshot. Related and older: `clear(list)` after a save
   removes the unsaved marker of a section the organizer started editing again during the save.
2. `refusedPart` compares values (identity for objects). A later edit that set exactly the same value
   as a refused one could be reverted. In practice the payment control is disabled while saving, so
   it is not reachable from the screen today.
3. `shownSetup` merges top-level fields and one level inside a nested object. If another writer
   changed a nested document that this save also changed, this save's value is taken. The calendar
   is the only other writer, and it reloads after a failure.
4. `registrations.update` and `overrideReady` still use `.update().eq().eq()` without `.select("id")`.
   A row deleted on another device matches nothing and reports success. This is older than this
   issue.
5. When the setup numbers land but the confirmation-only write is refused, the save rejects, so the
   Settings screen says "The setup was not saved" although the numbers were saved. The desk state and
   the database agree (numbers kept, card still confirmed); only the wording is imprecise.

## Follow-up issues noticed

- Desk: keep the Settings draft when a save lands mid-typing. Skip the draft re-seed when the event
  the desk shows is exactly what the screen just sent and the draft has newer edits.
- Registrations: tell a zero-row write from a saved one. Add `.select("id")` and say "no longer in
  this event" instead of reporting success.
- Refused-write rollback: tag each field with the write that set it, so a later edit that happens to
  set the same value is never reverted by an older refusal.
- Players update: build the row from the newest state; `players.update` writes the whole row from the
  adapter render and can put an older birthdate or name back.
- Setup: word a partial failure honestly. When the numbers saved but the confirmation was not
  withdrawn, say that instead of "The setup was not saved".

## Migration

None. No file was added under `supabase/migrations`, and no SQL was applied anywhere.
