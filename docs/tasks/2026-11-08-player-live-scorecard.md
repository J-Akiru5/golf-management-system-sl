# Player live scorecard: what is built now and what needs owner approval

Date: 2026-11-08
Task: T-0008
Issue: #186
Branch: `feat/issue-186-player-scorecard`
Status: implementation complete on the branch; the full unit gates pass; owner decisions listed
below remain open.

## What is built

### 1. Pure team aggregation

`src/lib/scoring/team.ts` is a pure module with no database or browser access.

- The format is an input: `individual`, `four-ball` (also called best ball), `aggregate` or
  `scramble`. An unknown stored value is reported as an unsupported format, not thrown.
- The score basis is an input: `net` or `gross`. It defaults to net, the usual basis for four-ball
  and aggregate. A gross-only event passes `basis: "gross"`.
- Four-ball takes the lower score of the two players on each hole.
- Team aggregate sums both players' scores on each hole.
- Scramble reads exactly one shared team score per hole. Two player entries on a scramble hole are
  refused rather than combined or invented.
- Individual returns no team total and a stated reason.
- A missing player, a missing net score, or an absent hole produces no team score for that hole. The
  hole is named in `incompleteHoles`, the team total stays null, and no missing value is read as
  zero.
- `summarizeTeamHoles()` produces the front nine, back nine and whole-card totals from the same
  per-hole results.

`src/lib/scoring/team.test.ts` covers complete four-ball, aggregate and scramble cards, a net/gross
basis difference, ties, missing net scores, an absent hole, one missing player, invalid scores,
duplicate holes, an unsupported format, an individual event, and nine-hole subtotals.

### 2. Player scorecard view

`src/components/player/ScorecardBreakdown.tsx` now shows:

- par, stroke index, gross, handicap strokes, net, gross points and net points for every hole;
- gross in a sunken cell with a bold value, net in a green-tinted cell with a left rule, so the two
  are distinct without relying on colour alone;
- Out, In and Total subtotals, each with relation to par (`E`, `+4`, `-2`);
- a partner and team section only when a published partner card (or a shared scramble card) is
  supplied and the format supports it;
- a plain "partner card is not published" message when the format needs a partner but no partner
  card is supplied.

A partner or team card is never invented. The connected `/my/card` page still reads only
`player_portal_entries()`, which returns the caller's own published card. It defaults to individual
and says that the team format is not configured and that the partner card is not published.

The card table keeps its own horizontal scroll container and pinned first column, so it stays usable
at 360 px.

### 3. Client-side edit preview

`src/components/player/ScorecardPreview.tsx` is a client-only component used by the demo build. A
reader can:

- switch between four-ball, aggregate and scramble;
- change a gross score in the preview form;
- watch that hole's net and points, the card totals and the team total recalculate locally.

It is labelled "Preview only" and says the preview is not saved. It calls no write RPC and keeps no
state outside the component. The pure recalculation lives in
`withGrossEdits()` in `src/lib/player/scorecard.ts`.

### 4. Wording

The new strings are in `en.ts`, `tl.ts` and `hil.ts` with the same keys and placeholders. The
Tagalog and Hiligaynon text is a draft and has not been reviewed by a native speaker at the club.

## What is demo or preview only

- The demo partner card and the demo shared scramble card are fictional fixtures in
  `src/lib/player/demo.ts`. They are never imported on a connected build.
- The format selector exists only in the demo preview. Connected mode has no tournament format to
  read, so it stays individual and says so.
- The edit preview is local state. It proves the recalculation but does not persist a score.
- No real partner card is read. The published projection does not carry one yet.

## Owner decisions needed before live player entry

1. **Format setting.** Where is the event format stored? A `team_format` and a `team_basis` column
   on the tournament, or a separate settings table, with `individual` as the safe default. The
   owner must confirm the allowed values, who may change them, and whether the format is frozen in
   the publication snapshot.
2. **Team membership.** How is a team recorded? A team table, or a team id on the registration or
   round entry. Name matching against the published groups is not reliable enough for a read
   projection. The owner must decide this before a partner card can be returned safely.
3. **Player-group read projection.** A new additive function should return the caller's card, the
   partner or group cards, and the format. It must read only the frozen publication snapshot, never
   the live scoring tables. The payload should carry only what the card needs: player name, gross,
   net and handicap strokes per hole. No contact detail, handicap index, birthdate or photo.
4. **Write permission and attestation.** The scoring domain currently says a player never marks
   their own card. Live player entry needs an explicit exception or a marker-based rule. The owner
   must decide who may write, what attestation is stored (player, marker, time, session, revision),
   and whether the desk must still verify the card before it counts.
5. **Locked holes.** A hole must become read-only after official attestation or submission. The
   owner must decide what locks a hole, who may unlock it, and what audit trail an unlock leaves.
6. **Verification and points.** A player-entered score must stay provisional until the existing
   verification rules accept it. Player entry must not bypass the canonical card checks or turn a
   provisional score into a final result.
7. **Scramble handicap.** A scramble needs a decision on how the team handicap is allocated, or a
   decision that the shared score is gross only. The current preview shows the shared gross score.

## Additive proposal: `player_group_scorecard()`

This is a SQL sketch for discussion only. It is not a migration file and must not be applied until
the owner approves the format setting, the team membership source and the read policy. It assumes
the snapshot carries `teamFormat`, `teamBasis` and a `teamId` on each card. Those fields do not exist
yet.

```sql
-- Sketch only. Not a migration. Depends on owner decisions for format and team membership.
create or replace function public.player_group_scorecard(p_round uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.club_id
    from public.players p
    where p.user_id = (select auth.uid())
    limit 1
  ),
  publication as (
    select rp.snapshot
    from public.round_publications rp
    join public.competition_rounds r
      on r.id = rp.round_id and r.club_id = rp.club_id
    where rp.round_id = p_round
      and rp.club_id = (select club_id from me)
      and r.status in ('provisional', 'final')
    order by rp.version desc
    limit 1
  ),
  my_card as (
    select card
    from publication,
      jsonb_array_elements(coalesce(snapshot -> 'cards', '[]'::jsonb)) as card
    where card ->> 'playerId' = (select id::text from me)
    limit 1
  ),
  partner_card as (
    select card
    from publication,
      jsonb_array_elements(coalesce(snapshot -> 'cards', '[]'::jsonb)) as card
    where card ->> 'teamId' = (select card ->> 'teamId' from my_card)
      and card ->> 'playerId' <> (select id::text from me)
    limit 1
  )
  select jsonb_build_object(
    'roundId', p_round,
    'format', (select snapshot ->> 'teamFormat' from publication),
    'basis', (select snapshot ->> 'teamBasis' from publication),
    'you', (select card from my_card),
    'partner', (select card from partner_card)
  );
$$;

revoke all on function public.player_group_scorecard(uuid) from public, anon;
grant execute on function public.player_group_scorecard(uuid) to authenticated;
```

The returned shape is:

```json
{
  "roundId": "uuid",
  "format": "four-ball",
  "basis": "net",
  "you": { "playerId": "uuid", "playerName": "Name", "holes": [] },
  "partner": { "playerId": "uuid", "playerName": "Name", "holes": [] }
}
```

If team membership is stored in a new table instead, the function joins that table to the caller's
registration, resolves the partner player ids, and still returns only cards found in the publication
snapshot. The live scoring table is never read by this projection.

A write path such as `submit_player_hole()` is deliberately not sketched here. It needs the
attestation and lock decisions first, and it must enforce its own authorization and lock checks
rather than trusting the browser.

## Acceptance criteria that remain unmet

- A connected player can see a real partner card or team score. The current projection returns only
  the caller's own card, and no format is configured.
- A connected player can submit a score and have the team score update from saved data. Only the
  local preview recalculates today.
- Edit capability is limited to active or unlocked holes, with a read-only state after attestation.
  No lock model or player write policy exists.
- Hole yardage is not shown. The published card carries par and stroke index but no yardage. Adding
  yardage requires a publication payload change and an owner decision.
- The issue's real-time language is met only as a client-side preview, not as live persisted entry.

## Verification

Checks run locally in the task worktree:

- `node node_modules/vitest/vitest.mjs run src/lib/scoring/team.test.ts` passed 19 tests.
- `node node_modules/vitest/vitest.mjs run src/lib/player/scorecard.test.ts` passed 18 tests,
  including the team visibility rule that decides when the partner row and the not-published
  message appear.
- `node node_modules/vitest/vitest.mjs run src/lib/i18n/i18n.test.ts` passed 8 tests.
- `node node_modules/typescript/bin/tsc` on `src/lib/scoring/team.ts` passed.
- A focused `tsc -p` check over the changed files and their import graph passed after fixing a
  test-only nullability issue. The temporary config was removed after the check.
- `node node_modules/@biomejs/biome/bin/biome check` on the changed files passed after safe
  formatting fixes.

The full unit gates passed on the rebased tree: `tsc --noEmit` (no output), `biome check .`
(572 files, no fixes) and 147 test files with 1517 tests. The production build, the 360 px browser
review and `agentctl verify` were not run because the host was at resource level red. They remain
part of the integration gate.

No migration, RLS policy, database function or staff scoring screen was changed. No score was
written. No branch was pushed, merged or deployed.
