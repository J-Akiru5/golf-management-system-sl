# Scoring polish: one card once, a scanned card corrected cell by cell, and two usable screens

## Objective

Make it impossible for the scoring flow to record the same card twice through the ordinary
mistakes of a tournament day, make a scanned card reviewable and correctable cell by cell before it
is submitted, and fix the real usability problems on the desk screen and the staff phone screen.

The tournament is being played today, so the work is demo mode only: no `.env`, no real database, no
new migration or RPC. Everything below is in the allowed files and covered by the existing demo seed.

Repository: `golf-management-system-sl`. Worktree: `wt-scoring-polish`. Branch:
`feat/scoring-polish`. Base: `develop` at `a45495f`.

## What changed, in one paragraph

One pure guard (`src/lib/scoring/submission.ts`) answers three questions for both screens: is a request
already in flight, is this the same card that is already in, and is this the same photo. The desk and
the staff sheet call it before every write, the demo repository calls it again, and the Supabase
adapter calls it again after it refreshes the round. The scan review gained a real model of where each
cell came from (`src/lib/scoring/scan/review.ts`) and both screens now show the photo, all 18 cells,
the reader/weak/empty/typed/changed state of each cell, and OUT, IN and TOTAL. A scanned card cannot be
submitted until every empty cell is typed and a person ticks that they checked the photo. The desk
form starts empty instead of at par, the submit button says what it is doing, and Enter moves through
the holes in order.

---

## Duplicate paths

| # | Path | Prevented before | Prevented now | Where |
| --- | --- | --- | --- | --- |
| 1 | Double click on the desk Submit | **No.** `submitCard` ran immediately; `busy` was React state set inside `run`, so both clicks of one tick passed, and each minted its own capture key (`scanCaptureKey \|\| randomUUID()`), so the demo repository stored revisions 1 and 2. Client only. | Yes. A synchronous gate takes the first call and drops the rest on the same tick. The button is also disabled while the request runs and reads "Saving card...". | `src/app/(desk)/scores/page.tsx:348` (`gate.tryEnter`), `:110` (gate), `:907` (disabled), `src/lib/scoring/submission.ts` (`createSubmitGate`). Client. |
| 2 | Double tap on the staff Submit | **No.** Only the `submitting` state, which lands one render later. A second tap in the same tick looped the cards again and minted a new capture key each time (the remembered key was not in state yet). Client only. | Yes. Same gate. The button is disabled while saving and reads "Saving...". | `src/components/staff/GroupScore.tsx:206`, `:89`, `:758`. Client. |
| 3 | Submit pressed again while the request is in flight | Partly. The button was disabled once React re-rendered, but the handler itself did not refuse a second call. | Yes. The handler refuses before it does any work, and the control shows it is working. | Desk `:348`, staff `:206`; labels at desk `:912-921` and staff `:760-766`. Client. |
| 4 | Retry after a network error that actually succeeded | **No.** The desk minted a new capture key on every manual attempt, so a request that reached the database but answered with an error produced a second revision. The staff sheet kept a key per player but reused it even after the card was edited, so an edit could be swallowed as the same submission. | Yes. Both screens remember the capture key of the failed attempt with the signature of the card it was for. A retry of the same card reuses the key (the database treats it as one submission); changing any cell mints a new key. The duplicate check also refuses an identical card when the round was refreshed and shows it. | Desk `:400-410` (`pendingSubmit`), staff `:73-82`, `:250-259`. Client; the database honours `capture_key` in `submit_scorecard`. |
| 5 | The same player's card submitted from the desk and from a staff phone | **No.** Two devices, no shared client state, different capture keys. | Partly. An identical card is refused by the repository-side check when the adapter's refresh sees the other one, and the phone shows a player with a card as "In". A true race (both requests between their refreshes) can still create a second revision. The canonical score is one value per hole, so the second card cannot add a second score; it is redundant evidence the desk sees in the Cards table. | Guard in the repositories: `src/lib/data/scoring.ts:348`, `src/lib/data/supabase/scoring.ts:549`. Closing the race needs the RPC change under "Needs the owner". |
| 6 | The same photo scanned twice | **No** in the demo (every upload gets a new capture key). Connected, the `scorecard_images` unique `(club_id, sha256)` refused it, but the desk saw a raw constraint error ("Could not submit the card: duplicate key ..."). | Yes. `Scorecard.imageSha256` is part of the card, the adapter reads it from `scorecard_images` (read only), and the guard reports "That photo is already attached to <player>'s card. It was not sent again." as a plain notice. The unique key stays as the last line of defence. | `src/lib/scoring/submission.ts` (`same_photo`), `src/lib/scoring/types.ts` (`imageSha256`), `src/lib/data/supabase/scoring.ts:238`, desk `:379`, staff `:262`. Client plus database. |
| 7 | A second card for a player and round when the round requires one card | **No.** `requiredCards` is a round setting and nothing checks the count of active cards against it. | **No.** Not fixed. A second card from a **different marker** is how a required second card arrives, so the client cannot tell a duplicate from a required card without applying the round setting. The canonical score is one value per hole whatever number of cards exists, so an extra card adds evidence, not a second score. | See "Not fixed". |
| 8 | Back button or reload re-submitting | Yes, by construction. There is no form POST and no history state: the screens submit once from a click and never on mount or on popstate. A reload either loses the demo state or shows the saved card. | Yes, unchanged. | No form element in either screen; submission is `scoring.submitCard`. |
| 9 | Two browser tabs | **No** connected: both tabs can submit, each with its own capture key. In the demo the two tabs have separate in-memory repositories, so nothing is shared and no duplicate row can exist. | Partly, same as path 5: the repository guard refuses an identical card when the refresh sees it; a race needs the RPC. | Repositories as in path 5. |
| 10 | A staff submit of several cards that fails half way, then a retry | Yes. Cards already sent were marked `submittedNow`, so the retry only sent the rest, and the key for a player was remembered. | Yes, kept, and the duplicate guard now runs per card before each write. | `src/components/staff/GroupScore.tsx:255-280`. Client. |
| 11 | Double click on Approve, Reject or Resolve | Yes. `busy` disables the control, the demo repository returns early for a card already approved, the RPC refuses a card that is not submitted, and a second resolution is append-only: the latest per hole wins, so the canonical score cannot double. | Yes, unchanged; the desk buttons still disable on `busy`. | Desk `:1330-1376`, demo `src/lib/data/scoring.ts` (`approveCard`, `resolveHole`). Client and repository. |

The shared signature check treats a card as identical by its 18 cells, in hole order, and ignores
which render order the entries arrived in (`cardSignature` in `src/lib/scoring/submission.ts`).

---

## Scan review

What was missing:

- The desk kept only a confidence per cell. It could not tell "the reader left this empty" from "the
  reader was unsure", and a cell the person retyped kept its amber "check" flag, so the hint said
  "typing a value does not clear the flag until the card is submitted fresh".
- The desk never showed the photo it had just taken, although the preview URL was sitting in state.
- The desk showed only a written total and par, not OUT and IN, and had no notion of a cell changed
  by a person.
- The staff sheet showed 18 cells but no photo, no OUT/IN/TOTAL, no distinction between empty,
  changed and weak, and the only way to change a cell was "tap the cell, then find the stepper".
- Nothing stopped a scanned card with a cell the reader left empty from being submitted.

What changed:

- `src/lib/scoring/scan/review.ts` now has one model, `reviewScannedCard`, with five cell states:
  `read` (the reader produced a value and was confident), `check` (low confidence or no confidence
  given), `typed` (the reader left it empty and a person filled it), `changed` (a person replaced the
  reader's value) and `blank` (nothing filled). It returns the counts, the list of blank holes, and
  the OUT, IN and TOTAL of the filled cells. A blank cell stays blank: nothing is filled with par,
  zero or a guess.
- The older confidence-only `scanReview` is kept and is now derived from the same computation, so its
  seven existing tests pass untouched.
- The desk shows the photo beside the cells, the four badges, the OUT/IN/TOTAL line, and the state
  next to each hole. Any cell can be typed. The submit button is disabled while a cell the reader
  left empty is empty and until the person ticks "I compared every flagged cell with the photo...".
- The staff sheet shows the photo, all 18 cells as numeric inputs (the number keypad, not a
  stepper), each with its state badge, plus OUT/IN/TOTAL and a count of what still needs a person. Its
  sticky bar becomes "Review totals" / "One hole at a time" while a scan is open.
- Correcting a weak cell now marks it "Changed" instead of leaving a stale amber flag. A weak cell
  the person did not touch is still sent to the desk as unconfirmed (`manuallyConfirmed: false`), so
  the approval rule still catches it.

---

## Usability fixes

| Screen | Problem | Fix |
| --- | --- | --- |
| Desk, entry form | The form started at par for all 18 holes, so Submit without typing recorded a card nobody read. | It starts empty. "Reset to par" became "Fill with par", an explicit action. |
| Desk, entry form | An empty hole produced "Every hole needs a whole-number score." and `Number("")` read as 0. | `readCardValues` names the hole: "Hole 7 is empty. Type the score from the card." and refuses 0, 21 and 4.5. |
| Desk, Submit | The button stayed "Submit card" while the request ran. | It shows a spinner and "Saving card..." and is disabled. |
| Desk, after a save | The form and its notices vanished, so the page jumped and the next card was not obvious. | The form keeps its values and shows a green "Saved." notice plus "Start another card", so nothing moves under the pointer. |
| Desk, second submission | An identical card was written as a second revision with no message. | "Already recorded. This card is already in for <player>. It was not sent again." as an info notice, not an error. |
| Desk, keyboard | Enter did nothing; a whole card had to be typed with the mouse or Tab only. | Enter moves to the next hole and, from hole 18, to Submit. Tab already followed the DOM order. |
| Desk, 1366 x 768 | Unverified. | Checked: no horizontal scroll at 1366 x 768 and the entry card is readable. |
| Desk, scan | No photo, no OUT/IN, no change state. | Photo, state per cell, OUT/IN/TOTAL, and an acknowledgement before submit. |
| Staff, 360 px | The group sheet could not be reached in the demo (see "Not fixed"), so the picker and its empty state are the checked surface. | The picker does not scroll sideways at 360 px, its day chips and bar items are 44 px or more, and a day with no draw says so in plain words. |
| Staff, scan review | No photo, no totals, no way to type a correction. | Photo, 18 numeric inputs (number keypad), state badges, OUT/IN/TOTAL, blank-hole message. |
| Staff, save result | A card that was already in was retried or silently skipped. | The save line and the toast say "N saved" and "M already in and not sent again". |
| Both | The "check" flag survived a hand correction. | A corrected cell is labelled "Changed"; only an untouched weak read stays "Check". |
| Both | Low-contrast or new colours? | No new colour tokens. The scan cell borders use the existing `--s-line`, `--s-forest` and `--warning-soft`; the desk uses `border-warning` and `border-info`. Light and dark themes were checked in the browser run. |

The staff sheet's steppers keep their 48 px targets and the sticky bar its 52 px minimum. The new scan
cells are labels at least 68 px tall around the input, so the whole cell is a thumb target.

---

## Not fixed

- **A warning when a player already has the required number of cards.** `requiredCards` is a round
  setting and the second card may be the required one, so a warning needs a product decision on what
  it should say and when it should block. Documented under "Needs the owner" as a rule decision.
- **The staff group sheet has no browser check.** The demo starts with an empty draw, and the demo
  seed is outside this task's file scope, so `/staff/groups/<id>/score` cannot be reached from a
  fresh page load. The staff picker and its empty state are checked at 360 px instead. The scan review
  itself is checked on the desk, where the same component and the same demo reader are used, and its
  model is covered by unit tests.
- **The staff one-hole stepper still starts from par when a cell is blank.** A volunteer who taps +
  on a blank cell gets par + 1. That is existing behaviour and it is an explicit tap, not an
  automatic fill; changing it would change the tap flow the volunteers already use during play.
- **The desk Cards table does not show the card's photo.** The photo is shown while the card is being
  entered and corrected, which is when a person compares cells. Showing it in the table needs a
  signed read URL for a private object, which is the same open item `docs/SCORECARD_SCAN.md` already
  records.
- **A third card for one player from a third marker is allowed.** Nothing counts cards against
  `requiredCards`; see the first item.

## Needs the owner

1. **`submit_scorecard` should refuse a no-op revision.** It currently accepts a new capture key with
   the identical 18 cells and writes revision n+1. The client guard and the adapter's refresh stop the
   ordinary cases, but a two-device race can still create a duplicate revision. A small change inside
   the function (compare the entries of the latest revision for the round, player and scorer, and
   return the existing card id when they match) closes it. Reason it was not made here: it is an RPC
   change and this task forbids touching `supabase/`.
2. **Map the image unique-key error to a plain sentence inside `submit_scorecard`.** The client guard
   prevents the ordinary same-photo path, but a race can still surface
   `duplicate key value violates unique constraint` to the desk. The RPC can catch the `scorecard_images`
   unique key on `(club_id, sha256)` and raise a readable message. Same reason: RPC change.
3. **Decide whether the desk should warn when a player already has `requiredCards` active cards.** The
   rule is unconfirmed in `docs/spec/SCORING_IMPLEMENTATION.md` (decision S2). With the count confirmed,
   the desk can warn before a third card is entered; whether it should block is the organizer's call.
4. **No production database change is needed for this work.** No migration was added or edited.

---

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed (Biome).
- `pnpm test`: 189 files, 1964 tests passed. New: `src/lib/scoring/submission.test.ts` and the
  `reviewScannedCard` block in `src/lib/scoring/scan/review.test.ts`, plus the demo repository's
  duplicate and correction cases in `src/lib/data/scoring.test.ts`.
- `pnpm build`: passed.
- `pnpm check:ui`: 183 checks passed, 0 failed, 0 console errors. New: `/scores duplicate submit`
  (triple click writes one card, an identical resubmit adds no revision and is a plain notice,
  no sideways scroll at 1366 x 768), `/scores scan review` (photo shown, 18 cells, the reader's empty
  cell stays empty, OUT/IN/TOTAL, changed state, Enter moves to the next hole, the acknowledgement
  unlocks Submit, one card saved) and `staff score sheet on a 360px phone` (picker, empty state,
  44 px targets, no sideways scroll).
- One existing check was adapted, not weakened: the `/scores player links` section used to submit a
  card that was pre-filled with par. It now clicks "Fill with par" first, because a manual card starts
  empty. Its assertions about the links, the card rows and both boards are unchanged.
- One existing test held the bug this task fixes: `src/lib/data/scoring.test.ts` "stores a correction
  as a new revision" changed hole 4 from its par of 5 to 5, so the "correction" was identical to the
  original card and the test asserted that an identical card creates revision 2. It now changes hole 4
  to 6 (a real correction) and two new cases assert that an identical resubmission and a no-op
  correction write nothing.
