# The staff app at `/staff`

The app a volunteer carries on the course and the desk uses at the registration table. It is not a
smaller copy of the tournament desk: it is four destinations and one job per screen.

| Destination | Screen | The job |
| --- | --- | --- |
| Today | `/staff` | The day, how many have arrived, the group this phone walks with, four ways to start a job |
| Players | `/staff/players` | Search, check in, undo, call, move a player (manager), withdraw from the day |
| Schedule | `/staff/schedule` | Every group in tee order with its hole, flight and arrival count |
| Score | `/staff/score` | The claimed group's sheet, tap scores or scan the paper card |

Supporting screens: `/staff/add` (walk-up), `/staff/schedule/[id]` (one group),
`/staff/groups/[id]/score` (the sheet).

## The ten rules

1. One job per screen.
2. Four destinations, labels always visible, no drawer, no settings, no print, no map.
3. Nothing typed but a search. Scores are + and −.
4. Every write says Saving… then Saved, or what to do next.
5. Nothing irreversible in one tap: arrivals undo, cards go through review.
6. No dead ends; every empty state names the next action.
7. Sunlight legibility: white, near-black, one gold accent, no glass or gradients.
8. Big numbers: scores and times 28px+ mono, names 17px, times never abbreviated.
9. Primary action in the thumb zone above the safe area.
10. No silent failure: an unsaved change stays visibly unsaved with Retry.

## Benchmark

What the products in this market actually document, and what TeeLine copied:

- **Golf Genius scoring stations**: a bounded task, station confirmation, one player at a time,
  review before save; a walking scorer is assigned a group; verification is a later step that locks
  the card.
- **BlueGolf TD App**: a player card carries the name, club, starting time and hole; one-tap check-in.
- **GolfStatus**: a searchable roster with one-tap check-in that syncs between stations, replacing a
  printed list and page-flipping.
- **GGID scoping**: access is scoped to the event, round or foursome, never a general admin console.

Sizes: 48dp Material and 44pt Apple minimum targets, 56px desk rows, WCAG AA 4.5:1 contrast.

## Data and permissions

- Staff roles are unchanged: `owner`, `organizer`, `desk`. `/staff` is a staff area in
  `src/lib/auth/routes.ts`, so the proxy guards it like the desk.
- Arrivals are per playing day on `registration_days` (`checked_in_at`, `checked_in_by`), written by
  `set_entry_day_check_in` in `supabase/migrations/20261106000000_staff_check_in.sql`. Undo clears
  both columns; the audit row keeps the history.
- The group a phone is walking with is kept in this browser only (`src/lib/staff/claim.ts`), keyed by
  event and day. It is not a new table and it is not shared between phones.
- Cards are submitted through the desk's guarded scoring function with the reciprocal marker
  rotation. The staff app never approves, corrects, revokes, publishes or finalizes. A card already
  in is shown as "In, ask the desk".
- Walking up: an existing directory player or a new guest, days and session, written by the same
  registration function the desk uses. A player the rules cannot place stays for review.

## Offline

Reads come from the existing desk snapshot and say when it was saved. A write with no signal fails in
place: "Nothing was saved" with Retry, no queue. Scanning needs a signal because the photo is
uploaded and read server-side; the Scan tab says so and points at tap entry.

## The scanner

The Scan tab is the existing `ScorecardScan` flow: camera or photo, presign, upload to R2, read by
the inference service, then every hole shown with weak reads flagged before submit. It needs
`SCAN_INFERENCE_URL` and the R2 credentials on the deployment. Without them the photo is stored but
nothing is drafted, and the screen offers manual entry.

## Checks before an event

1. Apply `20261106000000_staff_check_in.sql` and check in one real player, then undo it.
2. Walk one group's sheet on a phone and submit the four cards; confirm the desk sees them.
3. Scan one real IGCC card and check the flagged holes.
4. Sign in with a `desk` account: it must not see "Full desk", must not move players, and must still
   check in and score.
