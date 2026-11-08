# Pairings workspace and granular pair control

Status: decisions taken 8 November 2026. Implementation starts on a local branch; the migration is
written but not applied to the live project.

## Decisions taken

- A pair is always one member and one guest.
- All six pair actions are in the first cut: assign, replace, move, swap, remove, create from two
  solo players.
- A pair change after a draft draw marks the board stale and offers a redraw. Publish stays blocked
  until the board is redrawn or an override reason is recorded.
- The signed-in player sees their own pair and partner before publication, marked not published.
- The pair is stored in new `registration_pairs` and `registration_pair_members` tables. The
  migration and the guarded write path are part of this work.
- The first cut includes both the player workspace and the pair page.
- Owner, organizer and desk may reassign a pair. Every change is audited.

Still assumed unless corrected: the partner picker searches players already entered in the event,
and offers a link to add an unentered player from the directory. The directory add is a separate
step in this cut, not a silent registration.

## The problem

The registration desk shows a member-guest pair as one card, but an incomplete pair has no way
to add, replace or move a partner. The screenshot is Pair 124: the guest is entered and Ready, the
member column says "No member entered for this pair yet", and the only controls are payment, days,
re-freeze and remove.

The same information is split across four screens:

- `/register` owns the entry, the pair card, days, status and payment.
- `/players/[id]` owns the directory record, handicap, photo and account link.
- `/tee-times` owns the per-day tee time, hole and caddie.
- `/draw` owns the group, the lock and the publish.

Working one player means navigating between all four. The player profile also shows the entry and
the current group, but not the pair or the partner. The player's own account profile shows no pair.

## What exists today (verified in this checkout)

| Topic | Current behaviour | Evidence |
| --- | --- | --- |
| Pair number | `teamNo` on `RegistrationEntry`, stored inside `registrations.answers` JSONB | `src/lib/data/types.ts:283-297`, `src/lib/data/supabase/domain.ts:137` and `:343-355` |
| Pair writes | No screen sets `teamNo`; the import and seed set it, and the generic registration update would carry it if a caller patched the field. The new-entry form has no pair field | `scripts/apply-bamboo-tee-field.ts:233`, `scripts/seed-bamboo-tee-field.ts:206`, `src/lib/data/adapters.ts:70-82`, `src/lib/data/supabase/adapters.ts:1005-1027` |
| Pair display | The desk groups entries by `teamNo`, then puts the first member and first guest side by side | `src/app/(desk)/register/page.tsx:242-276`, `src/components/desk/RegistrationTeam.tsx` |
| Pair class | Both partners take the class that covers the average of their indexes | `src/lib/routing/classify.ts:44-68`, `src/lib/store/state.ts:313` and `:387` |
| Pair in the draw | `teamKey` keeps partners in one group | `src/lib/routing/index.ts`, `src/lib/store/state.ts:387` |
| Player profile | Shows entry, role, group (current day's hole and time), handicap; no pair or partner | `src/app/(desk)/players/[id]/page.tsx:137-162` |
| Player profile page | `/my/profile` shows contact, handicap and membership; it does not show the pair. The `/my` home shows published group mates after publication | `supabase/migrations/20261108000300_player_self_profile.sql`, `src/app/(player)/my/profile/page.tsx`, `src/components/player/PlayerHomeHero.tsx` |
| Publish | The public page reads only the frozen published snapshot | `src/lib/data/public.ts`, `supabase/migrations/20261022000000_versioned_publish.sql` |

Two consequences matter:

1. An entry created from the desk or the public form is solo until someone edits the database; there
   is no supported UI path into a pair.
2. Changing a pair after a draw changes the pair average and the partner grouping, but nothing marks
   the stored draw or the published snapshot as out of date.

## Target

1. **One pair record per event.** A pair has a number and two slots (member and guest), and a player
   can belong to at most one pair in the event.
2. **One player workspace.** The existing player page becomes the single place to read and change a
   player's event record: pair, entry, days and sessions, tee time and hole, draw group, scoring and
   account. The other screens remain as deep links, not as the only way in.
3. **Granular pair control.** Assign a missing partner, replace a partner, move a player to another
   pair, swap partners, remove a player from a pair, and create a pair from two solo players.
4. **The pair is visible to the player.** The player's own account shows their pair number and
   partner. Public pages still read only the published snapshot.
5. **Pair changes are safe.** Every change is audited, a draw made before the change is marked stale,
   and a published snapshot is never rewritten in place.

## Proposed data model

### Recommended: a pair table with one member row per side

```sql
create table public.registration_pairs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number integer not null check (number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, number)
);

create table public.registration_pair_members (
  pair_id uuid not null references public.registration_pairs (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  side text not null check (side in ('member', 'guest')),
  primary key (pair_id, side),
  unique (registration_id)
);
```

The member table allows an incomplete pair (one side empty) while `unique (registration_id)`
enforces the real rule: a player can be in only one pair in the event. The `(pair_id, side)` key
allows at most one player per side. A trigger validates that each registration belongs to the same
club and tournament and that its `membership_type` matches the side. A guarded
`save_pair(p_pair, p_member, p_guest, p_reason)` RPC is the only write path and writes an audit row.
Both tables are SELECT-only for staff; the API cannot bypass the rules.

Why this shape: it matches the club sheet (one member and one guest), makes "one player, one pair"
a database rule, and gives the workspace a stable id to link to. It also removes the current
ambiguity where three entries with the same `teamNo` silently become two cards.

The backfill reads `answers.teamNo` once, inserts one row per number, and reports:

- numbers with exactly one member and one guest (clean);
- numbers with only one side (incomplete, allowed);
- numbers with duplicates or wrong roles (left for review, not guessed);
- players whose `teamNo` is missing (solo, no row).

The JSON field stays readable during the transition and stops being written once the table is live.

### Alternative: keep `teamNo` in the JSON

Add only a `PairRepository` that reads and writes `answers.teamNo`, with the same pure validation in
the app. No migration, faster to ship, but two browser tabs can still create a duplicate number and
a direct API write can put a player in two pairs. This does not meet the "single source of truth"
goal; use it only if the table is not approved before the event.

## Proposed screens

### Player workspace at `/players/[id]`

Keep the existing route so every current link keeps working. Reorganise it into:

1. **Identity and pair header.** Photo, name, NGAP id, membership, entry status, pair number and
   partner. The pair card is the first thing the organizer sees.
2. **Pair card.** Two slots, Member and Guest. Each slot shows the player or "Empty", a link to the
   other player, and the actions:
   - Assign partner (empty slot);
   - Replace partner;
   - Move to another pair;
   - Remove from pair.
   The card also shows the shared class (average index) and any schedule mismatch.
3. **Entry.** Status, role, class, frozen index, playing handicap, payment, sponsor, shirt. Actions:
   confirm, mark ready, re-freeze, remove from event.
4. **Schedule.** One row per playing day: AM or PM, tee time, start hole, caddie, check-in. Edit in
   place, using the existing day editor and tee-time editor as components.
5. **Draw.** Group number, hole and time for the selected day, lock state, and a Move group control.
   A link opens the full Draw screen on the same day.
6. **Scoring.** Round entries and cards when they exist; otherwise "not opened".
7. **Account.** Link the account, keep the existing photo and contact controls.
8. **History.** The existing handicap records and the audit trail for this player.

The right rail keeps the photo, account, private details and poster.

### Pair card in `/register`

The existing pair card stays the quick view. The empty slot gets **Assign partner**. Each player
gets a small **Change pair** action. Opening either action uses the same dialog and the same
repository as the workspace, so the two screens cannot disagree.

### Player account

`/my/profile` and the `/my` home show:

- the player's pair number and partner;
- a "not published" label when the event has no published snapshot;
- a link to the public pairings only when a published snapshot exists.

This is the player's own entry, not public data. The public `/pairings` page is unchanged and keeps
reading the frozen snapshot. If the owner prefers to show the pair only after publication, the line
comes from the published snapshot instead; this is a decision below.

## Reassignment flows

| Flow | Entry point | Rule |
| --- | --- | --- |
| Complete a pair | "Assign partner" on an empty slot | Picker lists entered, unpaired players of the matching role; search by name or NGAP id |
| Add an unentered partner | "Add from directory" inside the picker | Creates the registration first, then fills the slot; never silently creates two entries |
| Replace a partner | "Replace partner" | The old partner becomes solo; the old partner is not removed from the event |
| Move to another pair | "Change pair" on the player | Target pair must have an empty matching slot; if full, offer a swap |
| Swap partners | Pair dialog, two pairs | Both players stay in the event; both pairs keep their numbers |
| Remove from pair | Pair dialog | The player becomes solo; the other slot and the number stay |
| Create a pair | "Pair two players" on the register list | Both must be solo; use the next free number or a typed number |

Validation, in plain language:

- a player can be in only one pair in this event;
- the member slot takes a member, the guest slot takes a guest;
- a pair number is unique in the event;
- both registrations belong to this event;
- a partner with different playing days or sessions is allowed but warned, because the draw can
  only group them on days both play;
- a partner with a different assigned tee time is warned, with a link to Tee times;
- every change writes from, to, actor and reason to the audit log.

## What a pair change does to the draw and the publish

| State when the pair changes | Behaviour |
| --- | --- |
| No draw yet | Nothing extra; the class is the new pair average |
| Draft draw, not published | Mark the day's board stale. Offer **Redraw this day** (recommended) or **Keep the board**, which records an override reason. Never move players silently |
| Published draw | The live board changes; the published snapshot stays frozen. The desk shows "newer changes"; players keep the old pair until the organizer publishes again |
| Round already open for scoring | Block the change and name the open round; the organizer must withdraw or reopen first. This rule is open for confirmation below |

The Draw screen already has the issue list, the lock controls and the "changed since publish"
state. The pair change adds one issue type, "pair changed since this board was made", with a link
to the pair and the player.

## Permissions and audit

- Owner and organizer can reassign. The desk can view; whether the desk can assign on the day is a
  decision below.
- Writes go through one RPC, so the rule is in the database, not only in the component.
- The audit row records `pair.assign`, `pair.replace`, `pair.move`, `pair.remove` and
  `pair.create`, with the old and new registration ids.

## Phases

**Phase 1, before the 12 November event (the agreed first cut)**

- `registration_pairs` table, backfill, `save_pair` and `swap_pair_members` RPCs, repository and
  tests. The migration is written and reviewed but applied to the live project only with owner
  approval.
- Registration desk: assign, replace, move, swap, remove and create a pair.
- Pair page at `/pairs/[number]`: both players, shared class, schedule and the pair actions.
- Player workspace at `/players/[id]`: pair header and pair card, plus the entry status, days and
  current draw group. The remaining controls keep their existing screens as deep links.
- Player account: pair line on `/my/profile`, marked not published when appropriate.
- Draw: a blocking issue when partners are in different groups, and a publish guard that asks for a
  redraw or an override reason.
- Print: the draft pairings sheet shows the pair number when the club wants it (optional).

**Phase 2, finish the single page**

- Move the tee-time editor, caddie, check-in, scoring and the draw move control into
  `/players/[id]`.
- Extract the tee-time editor from `/tee-times` so the workspace and the old screen share it.
- Keep `/register`, `/tee-times` and `/draw` as board-wide tools, not as the only way to reach a
  player.

**Phase 3, pair board and bulk tools**

- `/pairs` list with search and filters.
- Print a pair sheet.
- Bulk pair import and renumber.
- Swap wizard for a whole flight.

## Acceptance criteria for Phase 1

- An incomplete pair can be completed from the registration desk or the player workspace, and both
  player records show the same pair and partner.
- A player can be moved to another pair or removed from a pair; the old pair shows the gap.
- One player cannot be in two pairs, a pair number cannot be duplicated, and a role mismatch is
  refused with a plain message.
- A pair change after a draw is detected and blocks publish until the board is redrawn or an
  override reason is recorded.
- The player's own profile shows the pair and partner; public pages still show only the published
  snapshot.
- Every change is in the audit log.
- Unit tests for the pure pair rules, adapter tests for the write path, and a browser check of the
  three main flows.
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.

## Risks

- The backfill must be idempotent and must report anomalies instead of guessing. A wrong backfill
  splits a pair and changes its draw class.
- The stored draw groups are not moved by a pair change. The warning and redraw are the safe path.
- The published snapshot is immutable by design. Do not rewrite it to make the screens agree.
- The event is four days away. Phase 1 has to stay small; the full workspace is Phase 2.

## Remaining assumptions

These do not block the first cut; say if any is wrong.

1. The partner picker searches players already entered in the event and shows a link to add an
   unentered player through the directory. It does not silently create a registration.
2. A pair change is blocked while a scoring round is open, with the round named in the message.
3. A new pair uses the next free number, and the organizer can type another number.
4. The pair page lives at `/pairs/[number]`; the registration desk and the player workspace link to
   it.
5. The draft pairings sheet shows the pair number only when the club asks for it, so the current
   sheet layout does not change by default.
6. The `answers.teamNo` JSON stays as a read-only fallback for one release, then is removed from the
   write path.
