# Handoff: who can edit an index, what the audit says, and whether class follows the pair

Written 14 Nov 2026 on branch `agent/board-edit-check`, from `origin/develop` at `40eaf03`, for
GitHub issue #264. This is a code and migration reading only. I changed no code, migration, plan or
changelog, connected to no database, and pushed nothing. Every claim names a file and a line in this
worktree.

Starting points: `CHANGELOG.md`, section 0.46.0 (the pairings board and Live mode bullets) and
section 0.44.1 (the Edit index bullet), then the UI, the store and the adapters behind them, then the
migrations that enforce or record the writes. Changelog references use the section name because the
0.47.0 release has since added a section above 0.46.0.

## Short answers

| Question | Answer |
| --- | --- |
| Who can edit an index in the UI | Owner or organizer only. The desk role never sees the button (register list, player page, board). |
| Who can edit it in the database | Any club member, desk included. RLS on `registrations` is `for all to authenticated using is_club_member(club_id)` and there is no tighter policy, no column guard and no RPC for this edit. A desk account can do it through the API while the button is hidden. |
| What the edit writes | `registrations` columns: `frozen_index`, `frozen_record_id` (null), `frozen_effective_date`, `frozen_at`, `category_id`, `tee_id`, `playing_handicap`, `flight_id`, `overridden` (true), `answers` (carries the reason), `status`, `reasons`. `players.birthdate` too, when one is entered. |
| Audit row | One row in `public.audit_log`, via the `registrations_audit` trigger: who (`actor_id`), when (`created_at`), the table, the row id and the changed column names. It does **not** store the old value or the new value. The reason is not in `audit_log`; it is the single mutable `answers.overrideReason` on the row. |
| Does class follow the pair average | No. The dialog classes the single player on their own index (or their own playing handicap when the event's `flightBasis` says so). The save also sets `overridden`, so the next draw uses the edited player's stored class for both partners instead of the pair average. |
| Posted scores and published snapshots | Not touched. No scoring table, no `tournaments.published_snapshot`, no `pairings_versions` row. The public roster and public player profile read `frozen_index` live, so those two surfaces do change without a publish. |
| Swap, move, set move, set swap, typed command | Saves the day's board through `save_draw` (groups and group_members replaced, touched groups locked, `draw_revision` +1) and replaces `tournaments.board_overrides` with one `kind: "move"` row per player who changed group, with the dropdown reason and a client timestamp. No `audit_log` row at all. |
| Live mode | Publishes about 2 s after the last board edit, one version per burst. Live mode is owner/organizer only and stops itself on a refusal. Undo restores the previous draw and overrides for that board only, as a new edit that is saved and, in Live mode, published. A publish clears the public data cache through `/api/revalidate-pairings`; an index edit does not. |

## 1. Who can edit a player's index

### The UI gate: owner or organizer only

The same condition is written three times, once per place the control appears:

- Registration desk: `src/app/(desk)/register/page.tsx:151` (`canEdit`), control at lines 610-619.
  The label is "Mark ready" for a `needs_review` entry and "Edit index" for a ready one (line 617).
- Player page, Handicap card: `src/app/(desk)/players/[id]/page.tsx:93-94` (`canEditIndex`), control
  at lines 318-325.
- Pairings board, on a player row: `src/app/(desk)/draw/page.tsx:247-249` (`canEditIndex`), passed to
  the group card at lines 1251-1252, rendered in `src/components/draw/GroupCard.tsx:289-298`.

Demo mode (`status === "demo"`) leaves all three open on purpose. The board wrapper is
`src/components/draw/PlayerIndexDialog.tsx:15-26`; it is the same dialog as the other two, opened in
edit mode, and it saves through `adapters.registrations.overrideReady` (draw page lines 1407-1412).

These are cosmetic gates. The component's own comment says so: `src/components/desk/RoleGate.tsx:26-36`
("This is NOT a security control").

### The database rule: every club member

`registrations` gets its policy from a loop in `supabase/migrations/20261017000000_init.sql:234-249`:
every table in that list, `registrations` among them (line 239), receives
`registrations_member_all ... for all to authenticated using (public.is_club_member(club_id)) with check (...)`.

`is_club_member` checks only that the signed-in user has a `club_members` row for the club
(`20261017000000_init.sql:23-34`); it does not look at the role. The role constraint allows
`owner`, `organizer` and `desk` (`20261018000000_supabase_data_layer.sql:8-12`). The staff auth
migration replaces the `tournaments` and `club_members` policies with role-checked ones but adds no
policy to `registrations` (`20261019000000_staff_auth_audit.sql:34-56`); the audit log gets its own
manager-only read policy later (`20261037000000_player_registration_model.sql:760-763`). Its header
states the intent ("desk: register players and edit registrations", lines 4-8), and that is what the
policy allows: a desk account may update any column of any registration in its club.

Searches that came back empty, so the report does not assume a rule that is not there:

- No `drop policy` of `registrations_member_all` and no `as restrictive` policy anywhere in
  `supabase/migrations`.
- No `grant`/`revoke` on `public.registrations`, so no column-level privilege narrows it.
- No function in `supabase/migrations` updates `registrations.frozen_index` (searched for
  `frozen_index =` and `set frozen_index`), so there is no RPC that could add a role check.
- The index edit's write is a direct table update: `src/lib/data/supabase/adapters.ts:1076-1147`,
  the `.update({...})` at lines 1126-1143.

**Plainly: yes, a desk account can change a player's index through the API even though the button is
hidden.** The browser client uses the anon key plus the signed-in user's session
(`src/lib/supabase/client.ts:6-11`), so the request carries the desk user's JWT and RLS answers
`is_club_member` with true. There is no server-side role check on this path. (This is also consistent
with the role model the migration states: the desk may edit registrations. The mismatch is that the
UI hides one registration edit from the desk. The two do not describe the same rule.)

## 2. What an index edit writes, and what the audit records

### The row that changes

Table: `public.registrations`. The adapter builds a patch (`adapters.ts:1082-1097`) and writes this
object (`adapters.ts:1126-1143`):

| Column | Value |
| --- | --- |
| `frozen_index` | The index entered |
| `frozen_record_id` | `null` (the value is no longer tied to a `handicap_records` row) |
| `frozen_effective_date` | The cut-off record's date if the index equals the cut-off index, otherwise today (`src/components/desk/ReadyOverrideDialog.tsx:141-146`) |
| `frozen_at` | `new Date().toISOString()` at save time (`adapters.ts:1079`) |
| `category_id`, `tee_id` | From the dialog |
| `playing_handicap` | Computed in the dialog from the entered index, the category's tee and the event allowance, plus the committee adjustment (`ReadyOverrideDialog.tsx:88-97`, sent at 157) |
| `flight_id` | The flight the class matches, unless the desk picked one (`ReadyOverrideDialog.tsx:100-118`) |
| `overridden` | `true` |
| `answers` | The whole answers document, rebuilt from the newest row (`adapters.ts:1120-1125`), with `overrideReason` set to the required reason (`src/lib/data/supabase/domain.ts:348-359`) |
| `status` | `"ok"` |
| `reasons` | The dialog's pending notes (`ReadyOverrideDialog.tsx:124-133`, `adapters.ts:1084`) |

`players.birthdate` is written first, and only when the dialog supplied a date (`adapters.ts:1103-1119`).
No `handicap_records` row is created or changed, so the corrected index has no history row of its own.
The players table has no index column; the event index lives on the registration only
(`20261017000000_init.sql:72-84` has no index field).

The dialog also requires a reason of at least three characters (`ReadyOverrideDialog.tsx:137`). The
reason is a single value on the row, so the next edit overwrites it.

### The audit row

Trigger: `registrations_audit`, `after insert or update or delete on public.registrations`, created in
`supabase/migrations/20261037000000_player_registration_model.sql:1676-1678`. The function is
`audit_row_change` (same file, lines 676-706).

One row in `public.audit_log` (table defined at lines 654-666) is written per edit:

- `actor_id` = `auth.uid()`, so **who** is recorded.
- `created_at` = `now()`, so **when** is recorded.
- `action` = `"update"`, `entity` = `"registrations"`, `entity_id` = the registration id.
- `changed_columns` = the names of the columns whose values differ (lines 693-697), for example
  `answers`, `category_id`, `flight_id`, `frozen_at`, `frozen_effective_date`, `frozen_index`,
  `frozen_record_id`, `overridden`, `playing_handicap`, `status`, `tee_id`, plus `updated_at` and
  `updated_by`, which the stamp trigger always changes.
- `result` = `"ok"`, `detail` = null.

**It does not record the old value or the new value.** The table has no column for either, and the
function's comment says values are never copied (line 675). The reason is not in `audit_log` either:
the `answers` column is recorded as a changed column name, not its contents.

The registration row also carries `updated_by` and `updated_at`, stamped by a before trigger from the
session (`20261019000000_staff_auth_audit.sql:62-94`). That is who and when, but only the latest one,
and it is overwritten by the next change of any kind.

The audit page shows date, action, entity, record, changed column names, actor and result
(`src/app/(desk)/audit/page.tsx:143-179`). It is owner/organizer only in the UI (lines 94-98) and in
RLS (`20261037000000_player_registration_model.sql:760-763`).

## 3. Does class follow the pair average, and what else changes

### The class rule in the code

The rule the event uses is in `src/lib/routing/classify.ts`:

- `averageIndex` (lines 33-42) averages the members' indexes and rounds to one decimal.
- `applyTeamClasses` (lines 44-105) uses that average for a team of two, and caps each member's index
  at the event maximum before averaging (lines 89-96). The maximum is the event setting
  `config.maxIndex`; nothing hard-codes 30. `docs/PLAN.md:40-41` records the event at a 30 cap.
- `matchFlights` (lines 111-113) is the band lookup.

`route()` calls `applyTeamClasses` before grouping (`src/lib/routing/index.ts:241-247`), so both
partners share one class at draw time.

### What the index edit does

`ReadyOverrideDialog.tsx:100-111` builds the class from **one number: this player's own index**, or
this player's own playing handicap when `config.flightBasis` is not `"index"` (line 102). It never
calls `averageIndex` and never reads the partner.

The save then sets `overridden: true` (`adapters.ts:1095`, `1139`). That flag changes how the entry is
classed from then on:

- Desk view: `hasStoredRouting` is true (`src/lib/data/registrations.ts:73-75`), so the entry returns
  the stored `flightId` and `playingHandicap` (`registrations.ts:112-140`), and `buildRegistrations`
  drops the pair key for it (`src/lib/store/state.ts:401-413`, line 406). The partner is left as a
  one-member team, so `applyTeamClasses` skips the pair.
- Draw engine: `routingInputFor` passes the stored `flightId` and `playingHandicap` as the
  player's class and card handicap (`state.ts:475-486`), which `classifyPlayer` treats as a stored
  class and returns early (`src/lib/routing/index.ts:163-169`). Both partners still carry
  `team-<n>` (`state.ts:485`), so `applyTeamClasses` sees one stored class in the pair and puts
  **both** partners into it (`classify.ts:63-81`), with the note "Class follows the pair's stored
  card class."

So the answer is: the edit itself follows the single player's own index, not the pair average, and
after the edit a redraw no longer applies the average at all. It applies the edited player's stored
class to both partners. The desk view is different again: it can show the partner still in their own
class until the board is redrawn. The board reports that as an information note, not a block
(`src/lib/draw/class-mismatch.ts:50-98`, especially lines 67-78 and the info severity at 89-97).

The event's field includes two players above the cap, `LOCSIN, WILSON` 30.5 and `TOBES, JEROME` 30.6
(`docs/PLAN.md:40-41`). For those two, the dialog computes the playing handicap and the class from
the uncapped number (`ReadyOverrideDialog.tsx:88-91`, `102`), while the normal engine path caps at
`maxIndex` (`src/lib/routing/index.ts:118-128`, `160`). The `playingHandicap` helper applies no cap
(`src/lib/routing/handicap.ts:24-26`). The stored path then trusts the saved playing handicap
(`index.ts:156-158`), so saving an index above the maximum from this dialog bypasses the cap for that
player.

### Posted scores and published snapshots

Not touched. The write set is `registrations` and, when a birthdate is entered, `players`, as in
section 2. Specifically:

- No scoring table: the scoring handicap snapshot is written by `save_handicap_snapshot`
  (`supabase/migrations/20261036000000_scoring_workflow.sql:46`, latest body in
  `20261108001100_cap_handicap_snapshot_index.sql:23-75`), and normally called by `open_round` from
  the registration's `frozen_index` at the moment the round opens
  (`20261108000100_open_round.sql:395-437`). A later index edit does not update it. If the round is
  already open, scoring keeps the old index and playing handicap.
- No `tournaments.published_snapshot` and no `pairings_versions` row: neither the publish RPC nor
  the store runs on this path (`src/lib/store/draw-persist.ts:74-140` only reacts to draw actions and
  `publish`/`unpublish`; the index save dispatches `updateEntry`, `adapters.ts:1145`).
- The public pairings group class is frozen in the snapshot (`src/lib/store/state.ts:646-664`), so a
  class change does not reach the pairings page until a publish.

What does change publicly, without a publish, is the roster and the profile. Both read
`registrations.frozen_index` live:

- Roster: `20261110000100_public_release_enforcement.sql:210-237` builds each public player with
  `'index', r.frozen_index` and the live class name, gated by the roster release toggle, not by the
  publication.
- Profile search: `20261108003000_public_profile_leaderboard.sql:108-129`, `'index', r.frozen_index`.

Those reads are cached for 30 seconds (`src/lib/data/supabase/public-cache.ts:29-46`), and the index
edit does not clear that cache (see section 5). So the public roster and profile show the corrected
index within the cache window while the published pairings stay as they were.

## 4. Swap, move, set move, set swap and typed commands

### What is saved

The board actions are `swapPlayers` (`src/lib/store/state.ts:197`), `moveSet` (line 199), `swapSets`
(line 201) and the existing `move` (line 195). They are real board edits
(`BOARD_EDIT_ACTIONS`, `state.ts:274-286`), and each is planned as a `save` job
(`src/lib/store/draw-persist.ts:117-130`). A typed command reuses those actions:
`swap A with B` becomes `swapPlayers`, a multi-name swap becomes `swapSets`, and
`move A, B to group 7` becomes `moveSet` (`src/lib/draw/board-command.ts:188-234`).

`saveDraw` calls the `save_draw` RPC (`src/lib/data/supabase/draw-sync.ts:49-70`). The applied body is
`supabase/migrations/20261108002100_fix_save_draw_round_id.sql:28-147`:

- It checks the role (owner/organizer only, lines 60-62) and the draw revision (63-66), and refuses
  an unnamed save on a multi-day event (84-93).
- It deletes and reinserts the groups and group_members for the named playing day (95-139).
  `group_members.position` follows the new player order.
- Each group row keeps its own `flight_id`; a swap does not change a group's class. The touched
  groups are set `locked = true` by the edit itself
  (`src/lib/draw/player-moves.ts:47, 69-70, 170-171`), and the lock is saved with the group.
- It updates `tournaments.draw_revision` (+1) and replaces `tournaments.board_overrides` with the
  array the client sent (141-144).

`board_overrides` is the manual override list (`20261020000000_shell_domain.sql:34-36`): one row per
player who ended up in another group, built from the before/after difference
(`src/lib/store/state.ts:893-926`). Each row is `{ id, tournamentId, playerId, kind: "move", from,
to, reason, at }` (`src/lib/data/types.ts:351-360`). The timestamp is the browser clock; there is
no actor field. The reason is whatever the "Override reason for the next move or lock" dropdown says
(`src/app/(desk)/draw/page.tsx:35-41, 755-766`), which defaults to `"Organizer request"` and is not
touched per edit. The typed command box uses the same actions and the same dropdown reason
(`src/lib/draw/board-command.ts:155-237`; `src/components/draw/BoardCommandBar.tsx:34-42`; draw page
lines 1111-1119).

The rows are read back on load (`src/lib/data/supabase/load-desk-state.ts:449`) and shown in the
"Manual overrides this session" details panel on the draw page (lines 1330-1364), which is the only
place a swap's reason and time are visible.

### Is there an audit row

No. `save_draw` writes no `audit_log` row (the whole body is `20261108002100_fix_save_draw_round_id.sql:28-147`),
and there are no audit triggers on `groups` or `group_members`. The audit triggers created in
`20261037000000_player_registration_model.sql:1664-1682` cover `players`, `player_memberships`,
`tournament_days`, `registrations` and `registration_days` only. The groups tables are read-only for
members and written only through `save_draw` (`20261022000000_versioned_publish.sql:39-45`).

So a swap's record is: the new board (the old one is gone, because the rows are replaced), the
`board_overrides` array rows with from/to/reason/time and no actor, and the `draw_revision` number.
`/audit` cannot show any of it, and a client that sends a shorter override array can drop earlier
rows.

## 5. Live mode: what publishes, how a burst is batched, what Undo restores, the cache

### What triggers a publish

Live mode is turned on with the switch in `src/components/draw/LiveModeBar.tsx:50-66`, which is
restricted to owner/organizer (same lines). The choice is remembered per browser and off by default
(`src/lib/store/state.ts:239-256`; read on mount at `desk-store.tsx:353-359`).

A board edit schedules a publish only when the action is in `BOARD_EDIT_ACTIONS`
(`state.ts:274-286`) or is `undoBoard`, through `changesBoard` (`desk-store.tsx:775-776, 941-942`):
move, group slot swap, group move, hole queue, lock, withdraw, restore, place, player swap, set
move, set swap, and undo. The index edit is not in that set, so it never publishes.

The publish itself uses the ordinary path and refuses for the ordinary reasons
(`livePublishPlan`, `state.ts:848-891`): no board, the desk role, an account with no role, a failed
save, or blocking draw issues. If nothing players would see has changed, it skips (887-889). A
refusal turns Live mode off with the reason and a toast (`desk-store.tsx:579-590, 1006-1022`).

### Batching

Every scheduled publish restarts one timer of `LIVE_PUBLISH_DELAY_MS = 2000`
(`state.ts:241-245`; `desk-store.tsx:592-604`). A burst of edits therefore produces one publish, one
publication version and one cache clear. Each edit is still its own `save_draw` call and its own
revision, so the database sees N saves and then 1 publish, not 1 save.

`runLivePublish` reads the board on screen at the moment the timer fires, not the board from when the
edit was made (`desk-store.tsx:977-1000`). The draw queue preserves order, so the publish is written
after the saves (`desk-store.tsx:606-653`).

### What Undo restores

`undoLastChange` takes the newest snapshot for the board on screen (event + playing day) and
dispatches `undoBoard` with that snapshot's `draw` and `overrides`
(`src/lib/store/desk-store.tsx:1024-1062`; reducer `src/lib/store/state.ts:1472-1487`).

- It restores the groups and the manual override array, not the published snapshot, not an index
  edit, and not anything outside the board.
- The stack is in memory, belongs to the tab, and is gone on reload; it keeps 20 snapshots
  (`src/lib/draw/board-history.ts:10-16, 25-28, 38-45`). It never crosses to another event or day
  (`board-history.ts:54-71`).
- The restore is itself a new board edit: it is saved through `save_draw` and, in Live mode, it
  schedules another publish (`desk-store.tsx:776, 942`), which is what the toast says
  (`desk-store.tsx:1055-1061`; `LiveModeBar.tsx:91-97`).
- Because the restored snapshot carries the earlier `overrides` array, the rows of the edit being
  undone are removed from `board_overrides`. The undo leaves no audit row either.

### Does a publish clear the public cache

Yes, as a best effort. `publishPairings` and `unpublishPairings` are followed by
`refreshPublicPage` (`desk-store.tsx:643-650`; `src/lib/data/supabase/draw-sync.ts:78-109, 111-127`).
That posts the user's token to `/api/revalidate-pairings`, which checks for an owner/organizer
membership, then calls `revalidatePath("/pairings")` and `revalidateTag(PUBLIC_DATA_TAG)`
(`src/app/api/revalidate-pairings/route.ts:13-42`). The tag covers every cached public read
(`public-cache.ts:29-46`). If the request fails, the 30-second window is the backstop
(`draw-sync.ts:111-127`).

An index edit does none of this: `overrideReady` never calls `publicDataChanged`/`refreshPublicPage`
(compare `adapters.ts:1076-1147` with the other registration writes that do, e.g. lines 1214, 1235).

Publishing writes one `pairings_versions` row (version, snapshot, note, `published_by`,
`published_at`) and updates `tournaments.published`/`published_snapshot`
(`20261022000000_versioned_publish.sql:18-35, 138-196`). The desk calls the RPC without a note
(`desk-store.tsx:643-646`; `draw-sync.ts:78-91`), so a Live publish records who and when but not
what changed. No notification row is written; the 0.46.0 Live mode bullet says publishing sends no
notifications, and the function has no notification insert
(`20261022000000_versioned_publish.sql:138-197`).

## 6. Gaps

| # | Gap | Where | Severity |
| --- | --- | --- | --- |
| 1 | A desk account can change `frozen_index` (and every other registration column) through the API, because the only database rule is club membership while the UI hides the button. | `20261017000000_init.sql:234-249`, `20261018000000_supabase_data_layer.sql:8-12`, `20261019000000_staff_auth_audit.sql:34-56`, `src/components/desk/RoleGate.tsx:26-36`, `src/lib/data/supabase/adapters.ts:1126-1143` | Wrong output |
| 2 | The index edit classes only the single player, not the pair average, and setting `overridden` makes the next draw give both partners the edited player's stored class instead of the average. | `src/components/desk/ReadyOverrideDialog.tsx:100-118`, `src/lib/data/registrations.ts:73-75, 112-140`, `src/lib/store/state.ts:401-413, 475-486`, `src/lib/routing/index.ts:163-169`, `src/lib/routing/classify.ts:63-81` | Wrong output |
| 3 | An index above the event maximum is saved with a playing handicap and class computed from the uncapped number, and the engine's stored path trusts it, so the 30 cap is bypassed for that player. | `src/components/desk/ReadyOverrideDialog.tsx:88-91, 102, 324-330`, `src/lib/routing/handicap.ts:24-26`, `src/lib/routing/index.ts:118-128, 156-158` | Wrong output |
| 4 | `audit_log` records who, when and the changed column names but never the old or the new index, so the previous value cannot be recovered from the audit trail. | `20261037000000_player_registration_model.sql:654-666, 676-706`, `src/app/(desk)/audit/page.tsx:170-172` | Wrong output |
| 5 | The override reason is a single mutable field on the registration, not in `audit_log`; a second edit replaces the first reason. | `src/lib/data/supabase/domain.ts:348-359`, `src/components/desk/ReadyOverrideDialog.tsx:352-366`, `src/lib/data/supabase/adapters.ts:1140` | Wrong output |
| 6 | A swap, move, set move, set swap, typed command or undo leaves no `audit_log` row at all; the only record is `tournaments.board_overrides`, with no actor and a default reason. | `20261108002100_fix_save_draw_round_id.sql:28-147`, `20261037000000_player_registration_model.sql:1664-1682`, `src/lib/store/state.ts:893-926`, `20261020000000_shell_domain.sql:34-36` | Wrong output |
| 7 | Undo rewrites `board_overrides` back to the earlier array, deleting the record of the edit it takes back, and leaves no audit row of its own. | `src/lib/store/state.ts:1472-1487`, `src/lib/store/desk-store.tsx:1036-1054`, `src/lib/draw/board-history.ts:25-28` | Wrong output |
| 8 | An index edit changes the public roster and profile index within 30 seconds without a publish or a cache clear, while the published pairings stay frozen, which breaks the "players see only the frozen Published snapshot" rule for those fields. | `AGENTS.md:41`, `20261110000100_public_release_enforcement.sql:210-237`, `20261108003000_public_profile_leaderboard.sql:108-129`, `src/lib/data/supabase/public-cache.ts:29-46`, `src/lib/data/supabase/adapters.ts:1076-1147` | Wrong output |
| 9 | An index correction after a round is open does not update the scoring handicap snapshot, so scores keep the old index and playing handicap. | `20261108000100_open_round.sql:395-437`, `20261108001100_cap_handicap_snapshot_index.sql:23-75`, `src/lib/data/supabase/adapters.ts:1100-1146` | Wrong output |
| 10 | After one index edit the entry is permanently `overridden`, which suppresses the stale and outdated index flags and hides Re-freeze on the register list, so a later import cannot be used to refresh that entry from the desk. | `src/lib/data/registrations.ts:73-75, 112-140`, `src/app/(desk)/register/page.tsx:627-631`, `src/lib/data/supabase/adapters.ts:1165-1194` | Wrong output |
| 11 | `flightBasis` is honoured by the correction dialog but ignored by the routing engine, which always classes on the index, so the two disagree when the event uses course handicap. | `src/components/desk/ReadyOverrideDialog.tsx:102`, `src/lib/routing/index.ts:118-128, 163-186` | Wrong output |
| 12 | A publish records the version, publisher and time but not what changed, so a version cannot be tied to the swaps or override rows it contains. | `src/lib/store/desk-store.tsx:643-646`, `src/lib/data/supabase/draw-sync.ts:78-91`, `20261022000000_versioned_publish.sql:186-189` | Cosmetic |
| 13 | The public pages clear on publish, but the pairings version endpoint keeps its own HTTP cache for 10 seconds, so a version poll can lag behind the page. | `src/lib/api/pairings-version.ts:44-46`, `src/lib/data/supabase/public-cache.ts:29-46` | Cosmetic |
| 14 | A desk account can open the draw and use the swap, move and command controls, then every write is refused with "Not saved"; the controls should be disabled for that role. | `src/app/(desk)/draw/page.tsx:247-249, 1111-1119`, `20261108002100_fix_save_draw_round_id.sql:60-62` | Cosmetic |

## 7. Manual test list for production

Run these on golf.syntaxure.dev with one spare registration and one spare group. Steps 3 to 10 make
real edits, and several of them publish, so reverse each with a second edit. Step 2 uses values the
row already has; step 5 changes the index twice.

1. Sign in as the desk account. Open `/register`, one player page, and `/draw`. Confirm **Edit
   index** appears nowhere, the Live mode switch is disabled, and the swap and move controls are
   still visible (gap 14).
2. Still as the desk account, confirm the database rule without changing a value: in the SQL editor
   run `select policyname, cmd, qual, with_check from pg_policies where tablename = 'registrations';`
   and confirm the policy is `ALL` with an `is_club_member` qual. To confirm the API path, send one
   PostgREST `PATCH` on that one registration with `frozen_index` and `overridden` set to the values
   they already hold; expect HTTP 200, and expect one new `registrations` row in `/audit`. This
   changes `updated_at`/`updated_by` and adds an audit row, and no index value changes.
3. Sign in as the owner. On `/draw`, pick one player whose index needs correcting, note their class
   badge and their partner's class, press **Edit index**, enter the corrected index with a reason,
   and save. Confirm the player stays in the same group, the class badge or mismatch note changes,
   and the partner's class does not change.
4. Open `/audit`. Find the `registrations` update row from step 3. Confirm it has the actor and the
   time, lists `frozen_index`, `flight_id`, `playing_handicap`, `overridden` and `answers` among the
   changed columns, and shows no old or new values (gaps 4 and 5).
5. On the registration row, confirm `overridden = true`, `frozen_record_id` is null,
   `frozen_effective_date` is today (unless the new index equals the cut-off index, in which case it
   keeps the cut-off record's date), and the reason is in `answers.overrideReason`. Edit the index
   again with a different reason and confirm the first reason is gone (gap 5).
6. On `/draw`, swap two players between groups, move a pair into another group, and run one typed
   command (`swap A with B`). Confirm the board changes, each touched group shows Locked, and
   "Manual overrides this session" lists one row per player who changed group with the dropdown
   reason and the time.
7. Open `/audit` and confirm there is no `groups` or `group_members` row for any of those edits. If
   you have SQL access, check that `tournaments.board_overrides` holds the rows, that
   `draw_revision` went up, and that no row names who made the change (gap 6).
8. Turn Live mode on. Make two swaps within about two seconds. Confirm the page shows one new
   publication version, the public `/pairings` page shows the new order after the cache clear, and
   no notification arrives (section 5).
9. Press **Undo last change**. Confirm the board returns to the previous order, the overrides list
   drops the undone rows, a new version is published after about two seconds, and `/audit` still has
   no row for the undo (gap 7).
10. With Live mode still on, edit one index. Confirm no new publication version appears. Open
   `/pairings` signed out, with the roster surface released: the roster index and class change within
   about 30 seconds while the published pairings stay as they were (gap 8).
11. If a round is open for that player, open `/scores` and read the handicap snapshot. It should
   still show the old index and playing handicap; record that as gap 9. If no round is open, mark
   this step untested.
12. Reload `/draw`. Confirm Undo is empty, the board shows the saved state, and the overrides panel
   still lists the saved rows (section 5).

## Limits of this review

- No database was read. The RLS findings come from the migrations in this worktree. A policy added
  in the Supabase dashboard would not appear here.
- No runtime test was run. Every UI and database claim is from the code paths named.
- The migrations are the local source. `docs/PLAN.md:120` records the live schema as in step with the
  local migrations on 21 Oct 2026, and later entries record later migrations as applied. I did not
  verify the live project.
- I did not find an RPC, trigger or column privilege that performs or narrows the index edit. If one
  exists outside `supabase/migrations`, this report does not see it.
- `origin/develop` moved from `40eaf03` to the v0.47.0 release (`793bae0`) after this reading. Its
  diff touches no source or migration file cited here. Among the docs cited here it changes only
  `CHANGELOG.md` and `docs/PLAN.md`; the changelog is cited by section name above, and the cited
  `docs/PLAN.md` lines (40-41 and 120) are unchanged.
