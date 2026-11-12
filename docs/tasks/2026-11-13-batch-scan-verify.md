# Batch scan, match to a player, verify on the card view

Written 13 November 2026, the morning after Day 1 of the 24th Bamboo Tee. Status: **plan, nothing built**.
The owner's answers on 13 November are recorded under "Decisions". The confirmed scoring rules are in
[`docs/spec/IGCC_Tournament_Desk.md`](../spec/IGCC_Tournament_Desk.md).

## Why

Day 1 AM was not scored in the app. The cards were photographed, read outside the app into a file,
corrected on a standalone page, and released to the database by hand. The slow part was identity: a
card read from a photo carries a handwritten name ("Wormley", "Tony Um", "Carlos Lorona"), and
someone had to work out which registered player it was. The standalone page then needed the class,
the tee and the handicap typed in again, although the database already holds them.

The goal is to do the same work inside the app: photograph a session's cards in one go, let the
system propose which player each card belongs to, and let the desk check each card against its photo
on a card view like the one used on Day 1.

## What the system does today

Read from `origin/develop` at `36fc89b` on 13 November 2026. The database was not read. Three commits
landed on `develop` after the first draft of this plan (the team leaderboard cards and a pickup fix on
the read side); the tables below include them.

| Area | What exists | Where |
| --- | --- | --- |
| Scoring engine | Gross and net Stableford per hole from approved gross scores. Strokes follow the hole stroke index. Each player is scored on the tee in their handicap snapshot. | `src/lib/scoring/stableford.ts`, `standings.ts` |
| Handicap | A snapshot per player per round, worked from the frozen index with the tee's rating and slope, written when the round is opened. | `save_handicap_snapshot` in `20261036000000_scoring_workflow.sql` |
| Desk entry | One card at a time. The desk picks the player, then types 18 scores or scans that one card. The card prints as the paper card. | `ScorecardWorkspace.tsx`, `ScoresDesk.tsx`, `src/lib/scoring/workspace.ts` |
| Staff entry | A phone claims a group from the published pairings and fills each player's card with a stepper. Names come from the database. | `src/app/(staff)/staff/score`, `GroupScore.tsx`, `src/lib/staff/score.ts` |
| Photo scan | A photo is stored in R2 and attached to one card. A reader, when one is configured, proposes strokes and a confidence per hole. The reader's contract already returns the name it read on each row. | `ScorecardScan.tsx`, `src/lib/scoring/scan`, `api/scoring/scan/extract` |
| File import | A transcription file is matched to the open round by player id, or by name when the name matches exactly after case, commas and spaces are ignored. | `src/lib/scoring/import` |
| Names | Stored as `SURNAME, GIVEN`. Search ignores case, accents, punctuation and word order. | `src/lib/names` |
| Corrections | The desk corrects a card with a reason; the earlier revision is kept. | `20261043000000_scorecard_correction.sql`, `20261112000200_desk_can_correct_scorecard.sql` |
| Paper card, read only | The public leaderboard opens both partners' frozen cards in the paper layout: Hole, Par, SI, Score, Net pts, Gross pts, OUT/IN/TOT, footer. A published hole can carry `pickedUp: true`; it shows a red X and adds no strokes. Copied from the Day 1 sheet; no class, partner, tee, checked tick, saved indicator, editing or print layout. | `src/components/public/PaperScorecard.tsx`, `src/lib/player/paper-scorecard.ts`, `src/lib/player/portal.ts` |
| Teams | Aggregate, four-ball and scramble are computed for the player's own card page. | `src/lib/scoring/team.ts` |
| Results | A printable results sheet, and a public release per round. | `src/lib/print/results-sheet.ts`, `/scores/results` |

## What is missing

| Gap | Effect on Day 1 |
| --- | --- |
| **A photo cannot exist without a player.** The scan screen asks for the player first, and a scorecard row needs a player and a marker. | A stack of photos cannot be uploaded and sorted out afterwards. |
| **The name the reader returns is not used.** No screen compares it with the round's players. | Every card's player was found by a person. |
| **Name matching is exact only.** The file import refuses a name that is not an exact match. | "Wormley" does not find GORMLEY; the whole Day 1 file would have been refused. |
| **No pick-up on the write side.** The published snapshot and the public card read `pickedUp`, but the scoring engine, card entry, validation and canonical scores do not: a hole is a whole number or it is missing, and a missing hole blocks the card. | Day 1 AM was released with X counted as 0 by hand, as a stand-in. 28 of 36 cards had at least one X. |
| **No marker, no card.** The database requires a marker who is another player. | The Day 1 cards were read without a marker. |
| **The desk card view lacks the Day 1 fields.** It does not show class, partner or team handicap beside the scores, and has no "checked against the paper" tick separate from approval. The new public `PaperScorecard` is read only and has the same gaps. | The standalone page was built to show them. |
| **Team ranking is not in the standings.** The standings rank individuals. | Day 1 AM team ranks were produced by the release, not by the Scores screen. |
| **Reader status in production is not known.** The reader is optional and set by `SCAN_INFERENCE_URL`. | Day 1 cards were read by a person, not by the reader. This needs checking before step 4. |

## Decisions, owner, 13 November 2026

| # | Decision |
| --- | --- |
| D1 | **Batch scan, then verify** is the main way cards come in for the rest of the event. |
| D2 | **The system suggests, the desk confirms.** A scanned card is never assigned to a player without a person confirming it. |
| D3 | **The app's conversion is the handicap.** Scoring uses the course handicap worked from the index with the tee's rating and slope, as confirmed on 5 November. The number written in the card's HDCP box is shown for comparison only. |
| D4 | **Build for this event.** The work is wanted before the event ends on 15 November, including the database changes. |

D3 settles the open point about a decimal in the HDCP box for the days still to be scored: the box is
not used, so nothing is dropped. It also means **Day 1 AM, which was released on the card handicap,
was scored by a different rule from the other days.** Whether Day 1 AM is released again on the app
conversion is not decided; see "Open questions".

## The flow being built

1. **Upload.** Staff or the desk pick a round and session and add photos or a scanned PDF, many at
   once. Each page becomes one scan in an inbox. Nothing is a scorecard yet.
2. **Read.** Where a reader is connected it proposes the 18 scores, a confidence for each, the name
   and the total written on the card. Its contract today (`docs/SCORECARD_SCAN.md`) has no tee, no
   HDCP-box number and no group, so those stay empty or are typed by the desk until the reader is
   extended. Where no reader is connected, the scan waits with its photo and nothing is invented.
3. **Match.** For each scan the system lists up to four players from that round and session, best
   first, with the reason for each ("surname one letter off, same group, handicap within 1"). A player
   who already has a card for the round is marked. The desk confirms one, searches for another, or
   sets the scan aside.
4. **Verify.** The confirmed scan opens on the card view with the photo beside it. Name, class,
   partner, team handicap, tee and playing handicap come from the database. The desk corrects any
   score, marks pick-ups, and ticks "checked against the paper card".
5. **Submit and approve.** The card goes through the existing submit and approval rules. A card
   typed by hand from the group list uses the same card view, so a photo that will not read is never
   a dead end.
6. **Print.** Cards print three to a page from the same view; the results sheet prints the ranking.

## The card view to copy

The standalone Day 1 page is the reference. It is kept outside the repository because it holds real
names and scores; its behaviour is listed in the spec under "Day 1 working sheet". The public
`PaperScorecard` is already a read-only copy of its layout, with its numbers in
`src/lib/player/paper-scorecard.ts`. The desk and staff card must reuse those helpers and that table
layout, so the public card and the editing card never drift apart. Already covered by `PaperScorecard`:
the two nine tables, par, SI, score, net and gross points, OUT/IN/TOT, the X for a pick-up and the
footer. To add for the desk, the staff app and print:

- a header line with class, partner and team handicap, group, tee, playing handicap and the total written on the card;
- a doubtful reading shaded, a changed score marked, an X shown in red;
- under the tables, the playing handicap and the total written on the card (the public footer already has strokes, holes with a score, net and gross Stableford);
- a "checked against the paper card" tick, and a saved indicator that says when the last change was stored;
- Enter moves to the next hole;
- print: three cards to a page at a fixed height, dark hole numbers on a light band so they survive a printer that drops backgrounds, the TeeLine mark top right.

Differences from the standalone page: the name, class, tee and handicap are read from the database
and are not typed; the handicap is the app's conversion (D3); saving goes to the database, not the
browser.

## Steps

Each step is one branch and one worktree, merged to `develop` after `pnpm check` and, where a user can
see it, `pnpm check:ui`. A step that changes the schema is applied to the database only after the
owner approves that migration by name.

| Step | What | Schema | Depends on |
| --- | --- | --- | --- |
| 1 | **Name matcher.** A pure function in `src/lib/scoring/match`: given the name, tee, handicap and group read from a card and the round's players, return ranked candidates with reasons. It never picks one. Built on `src/lib/names`. Tests use the Day 1 misreadings as fixtures: Wormley for GORMLEY, Um for LIM, Lorona for LORENA, Homaros for HENARES, Uhlman for LAGMAN, Aunsanan for ALINSANGAN, Alquinos for ALQUIROS, Jabinugay for JABINIGAY, Clayero for CLAVERO. | None | Nothing |
| 2 | **Editable card view on the shared layout.** Extend the table layout and helpers behind `PaperScorecard` into one card the desk workspace and print both use, with the header line, doubtful and changed marks, the checked tick, the saved indicator, Enter to the next hole and three-to-a-page print. `PaperScorecard` itself keeps working for the public pages. Submit, approval and correction stay as they are. | None | Nothing |
| 3 | **Pick-up on the write side.** A hole can be recorded as picked up: 0 points, counted as a played hole, no gross total shown for that card. The published snapshot and public card already read `pickedUp`; the scoring engine, card validation, canonical scores and card entry learn it, which replaces the "X is 0" stand-in from the Day 1 AM release. | Yes | Owner approves the migration |
| 4 | **Scan inbox.** A table for scans that are not yet cards (round, session, image, what was read, suggested player, state) and the upload, match and verify screens. The reader's name feeds step 1; tee, HDCP box and group are optional matcher inputs that the reader does not return today. | Yes | Steps 1 to 3; reader status checked |
| 5 | **Marker for a scanned card.** The rule today is a marker who is another player. Decide how a scanned card gets one (see "Open questions"), then build it. | Maybe | Owner's answer |
| 6 | **Staff app.** The group score screen uses the shared card view and can open the inbox for its own group. | None | Steps 2 and 4 |
| 7 | **Team ranking and class in standings.** The Scores screen ranks teams on aggregate net points by class, and lists a player whose partner has no card as not ranked. | None expected | Step 3 |

Steps 1 and 2 change no data and can go out during the event with little risk. Steps 3 to 5 change
what a scorecard is in the database.

## Progress, 13 November 2026

| Step | State | Notes |
| --- | --- | --- |
| 1 Name matcher | **Built**, `src/lib/scoring/match`, 40 tests, merged to `develop`. | Checked against the seed roster (`supabase/seed/bamboo-tee-2026-schedule.psv`) with surname only: on the 35 players scheduled for Day 1 AM, 8 of the 9 Day 1 misreadings rank first and the ninth (Uhlman for LAGMAN) is not in the pool, because LAGMAN is scheduled for days 2 and 3 in the seed. Against all 301 names, 6 rank first, Homaros ranks second, Um is a tie between the two LIMs, and Uhlman ranks third in a three-way tie. The matcher accepts any player list, so the scan inbox must offer the whole event as a second pool and mark a player who is not scheduled for the session ("not scheduled this session"). |
| 2 Card view | **First slice built, merged to `develop`**: a context line (day, marker, class, partner, team handicap, tee, group, playing handicap, card HDCP), and a "Print this card" button that prints one card on white with the TeeLine mark. | The desk does not load class, partner, team handicap, tee name or group yet, so for now the line shows day, marker and playing handicap. It leaves out what the caller does not pass and says "Not set" only for a value the caller looked up and found empty. The first review found the card printing dark cells in the dark theme and claiming "Not set" on every card; both are fixed. Print was checked by applying the print rules on screen, not in a real print preview. `class` is available as `flightId` on each round entry, and the desk results table shows that raw id; resolving it to the class name and loading the partner from the registration pairs (`20261108002000_registration_pairs.sql`) are reads of existing data, no schema change; the exact columns are still to be read from the code. |

Design findings from the browser check of the desk card (demo mode, `develop` at 4dc4a4d), not yet
fixed and not part of the first slice:

- The sticky player and marker block is 318px tall on a 375px phone, 39% of the screen, and hides the
  player name and the context line when the card is scrolled into view.
- Score cells are 32px high; the design system's standard button is 44px.
- A nine-hole table is 640px wide inside a phone, so each nine scrolls sideways and shows four holes
  at a time.
- Labels differ between the desk ("Hcp row", "Net pts" or "Gross pts") and the public paper card
  ("SI", both point rows).
- "Fill with par" writes scores nobody read, next to Submit.

## Releasing during the event

D4 asks for everything before 15 November. These rules keep a playing day safe:

- Nothing goes to `main` between a session's first tee time and that session's results being released.
- Every migration is additive. No published round, card or result is rewritten by a migration.
- Each step goes to `staging` first and is tried there with the Day 1 AM cards before `main`.
- The standalone page and the manual release method stay available as the fallback for every remaining
  session. A step that is not ready is not a reason to hold a result.
- The previous production deployment is the rollback. A step that cannot be rolled back by redeploying
  is not released on a playing day.

Honest sizing: steps 1 and 2 are about a day together. Steps 3 and 4 are the large ones and each needs
a migration, tests and a staging run. All seven before 15 November is unlikely without cutting tests,
which the project rules do not allow. The realistic outcome is steps 1 and 2 in use during the event,
step 3 if a quiet window allows, and the rest finished after it.

## Done means

- The nine Day 1 misread names each put the right player first or second in the candidate list.
- No scan becomes a card without a person confirming the player.
- A card with pick-ups can be submitted and approved, and shows 0 points on those holes.
- A session of 36 cards can go from upload to all checked without a name being typed.
- Day 1 AM's cards, entered through the new flow on `staging`, give the same hole scores as the cards released on 12 November.
- Cards print three to a page.

## Open questions

| # | Question | Who | Blocks |
| --- | --- | --- | --- |
| Q1 | Day 1 AM was released on the card handicap. Under D3, is it released again on the app conversion, or left as it is? | Owner and organizer | Whether the four days are scored by one rule |
| Q2 | Who is the marker on a scanned card: the name signed on the card, the other team in the group as the rules sheet says, or the staff member who uploaded it? | Organizer | Step 5 |
| Q3 | Is the card reader running in production, and how well did it read the Day 1 cards? | Owner | Step 4; without a reader the inbox still works but every card is typed |
| Q4 | Does "checked against the paper card" count as approval, or is approval a second person's step? | Organizer | Step 4 |
| Q5 | Is the two-point pick-up penalty recorded by the desk in the app, or handled on paper? | Organizer | Step 7 |
