# Scorecard scan sub-application

Date: 2026-11-12

Branch: `feat/scorecard-scan-subapp`

Status: plan written; UI scaffold complete; local gates pass. No migration, no score write,
no push.

## 1. What the owner asked for

A sub-application that:

1. Takes a photo of a paper scorecard.
2. Digitizes the scores.
3. Lets a person verify and edit every value by hand.
4. Exports the verified cards straight to the admin scoring area.
5. Does not block editing with strict rules, so a wrong reading can always be corrected
   before export.
6. Is reachable from both the organizer desk and the staff phone app.
7. Covers every playing day and session, not only Day 1.

Owner decisions taken on 12 November 2026:

| Decision | Choice |
| --- | --- |
| Deliverable | Plan plus UI scaffold |
| Export target | Submitted cards in `/scores`, not direct canonical scores |
| Entry points | Both the desk and the staff phone area |
| First scope | All days and sessions |
| Export rule | Every hole must have a value before export |
| Card reader | Keep the existing `SCAN_INFERENCE_URL` contract |

## 2. What exists today

Verified in `origin/develop` at `2cfb195`.

- `/scores` is a single-card workspace. It has the player picker, marker picker, scan panel,
  18-hole grid, gross and net Stableford summary, correction path and submit button.
- `/scores/review` holds the cards table, approvals, conflicts, bulk JSON import and round setup.
- `/scores/results` holds standings, publication and finalization.
- `src/components/scoring/ScorecardScan.tsx` already captures or uploads a photo, fingerprints it,
  uploads it to private R2 storage through a signed URL, calls `/api/scoring/scan/extract`, and
  applies the reader result to the card. With no reader configured it says so and leaves the
  scores to manual entry.
- `src/lib/scoring/scan/review.ts` already classifies reader cells as read, weak, empty, changed or
  typed.
- `src/components/scoring/ScorecardImportPanel.tsx` already imports a checked JSON transcription
  file and submits cards through the normal scoring repository.
- `src/components/staff/GroupScore.tsx` already has a phone-first tap and scan view for one group.
- The staff app is phone-first and has four bottom destinations. The desk has a full rail.
- Rounds are per playing day. `ScoresDesk` reads and writes with `drawDay`, so Day 3 never reads
  Day 1 by accident.

The main gap is not the reader or the scoring engine. It is a **guided scan batch** that a
volunteer can walk through without learning the full desk, with one clear place to verify and one
clear export action.

## 3. The product flow

```text
Open scan station
  -> choose playing day and session
  -> choose the card (player or group)
  -> take photo or upload photo
  -> reader drafts the cells
  -> person compares the photo with every cell and edits freely
  -> card joins the export batch
  -> repeat for the next card
  -> Export to Scores
  -> cards appear in /scores/review as submitted cards
  -> the normal approval step still happens there
```

The photo stays attached to the card. The reader never approves a card. A card is never approved
by the scan station, only submitted.

### Desk entry point

`/scan`

- Lives beside `/scores` in the desk rail.
- Uses the same `ScoresSubnav` as Enter card, Review and Results, with a new Scan tab.
- Designed for a tablet or office screen.
- Side-by-side photo and 18-hole grid.
- Shows the whole batch and its export button.

### Staff entry point

`/staff/scan`

- Phone-first, using the staff shell and the same day pills as the other staff pages.
- Opened from a “Scan a card” action on `/staff/score`, not from a fifth bottom-bar tab.
- One card at a time, with a large photo, large hole cells and a sticky primary action.
- Batch summary is kept short because the screen is small.

Both entry points render the same workflow component and call the same export function. Only the
frame and the density differ.

## 4. Rules

### Editing is never blocked

A person can type any value the scoring system accepts, at any time, on any hole. The screen does
not lock a cell because the reader was confident, because a total disagrees, or because another
card exists. Warnings are information, not locks.

### Export gate

The only hard gate is the owner’s rule: every hole must have a value before a card can join the
export batch.

- A number from 1 to 20 counts.
- `X` counts as a recorded value in the scan station.
- A blank cell blocks export and names the hole.
- An invalid value (zero, above 20, a decimal, text) blocks export and names the hole.

The card can still be edited with a blank or invalid cell. The gate is checked when the person
presses Add to batch or Export, not on every keystroke.

### Warnings do not block

These are shown but do not stop export:

- Reader confidence below the threshold.
- Reader left a hole blank and a person typed it.
- Total written on the card does not match the visible hole scores.
- A card for the same player and day already exists.
- No marker has been chosen yet.
- The player row on a group sheet does not match a published player exactly.
- The photo is rotated, dark or cropped.

### Existing card

If the player already has a card for that day, the station warns and creates a **new revision**
through the normal submission path. It never overwrites the old card. The old revision stays in
the audit and the new one needs approval.

### Marker

The scoring schema requires a marker (scorer) and refuses a player marking their own card. The
scan station should propose the reciprocal marker from the published group, the same way the
existing desk does. The person can change it. If the group has no second player, the card is held
for a marker decision because the database cannot accept a null marker without a schema change.

A “desk marker” account would be a schema and policy change and is not part of this scaffold.

## 5. Screens and routes

| Route | Purpose | Frame |
| --- | --- | --- |
| `/scan` | Desk scan workspace | Desk shell, `ScoresSubnav` with Scan active |
| `/staff/scan` | Phone scan station | Staff shell, staff day pills |
| `/scores` | Existing single-card entry | Unchanged |
| `/scores/review` | Submitted cards and approvals | Unchanged |
| `/scores/results` | Standings and publication | Unchanged |

Navigation changes:

- Desk rail: add “Scan cards” after “Scores”.
- Scores subnav: add a “Scan cards” tab.
- Staff Score page: add a “Scan a card” action card above the group list.
- Staff bottom bar stays four destinations.

Shared components:

- `src/components/scoring/ScanStation.tsx`: the workflow shell for both frames.
- `src/lib/scoring/scan/station.ts`: pure step definitions and the export readiness rule.
- `src/lib/scoring/scan/station.test.ts`: tests for the export rule.

## 6. Export contract

Export means **submit**, not approve.

For every card in the batch:

1. Read the chosen player, marker, day, round and holes.
2. Convert the cell values to the scoring repository’s entry shape.
3. Call `scoring.submitCard(tournamentId, input)` with:
   - `source: "upload"` when a photo is attached, otherwise `"manual"`.
   - a capture key derived from the batch id and card key, so a repeated export does not create a
     second revision.
   - `extraction` metadata containing the batch id, reader engine, engine version, confidence map
     and the original transcription notes.
   - the photo path, SHA-256, MIME type and byte size when attached.
4. The card lands in `/scores/review` as `submitted`.
5. The approval step stays in Review. The scan station never calls `approveCard`.

The batch is a client-side object in phase 1:

```json
{
  "batchId": "scan-2026-11-12-<random>",
  "tournamentId": "...",
  "dayNumber": 1,
  "session": "AM",
  "createdBy": "...",
  "cards": []
}
```

A server-side `scan_batches` table is a phase 4 option. It would need owner approval because it is
a schema change. It is not required to prove the flow.

### JSON import and export

The scaffold implements a JSON round-trip in the existing `teeline-scorecard-import` format.

- Import reads a file, validates it with `parseScorecardImport`, and shows the cards and every
  structural problem. A valid file loads its cards into the station preview.
- Export returns the imported file. When nothing is imported, it downloads a blank template for
  the open round with every player and proposed marker and null holes. The template must be filled
  before it can be imported again.
- The same file can be imported on `/scores/review` through the existing bulk import panel.
- The direct `submitCard` path remains the primary export for the wired station.

The scaffold’s export is deliberately a file download only. It does not write a score or call the
reader.

### X and pick-up scores

The current scoring schema stores `scorecard_entries.strokes` as a number from 1 to 20. It has no
`picked_up` or `no_score` field. The paper cards use a red X for a picked-up hole.

This is the one schema gap the owner must decide before X cards can be exported correctly:

- **Recommended:** add an additive `picked_up boolean not null default false` to
  `scorecard_entries`, and teach the scoring engine that a picked-up hole scores 0 points and does
  not add a gross stroke. This needs a migration and RLS review.
- Alternative: require a numeric score for export in phase 1 and keep X cards in the station until
  the schema is approved.
- Not recommended: encode X as 20. It produces the right points by accident but corrupts gross
  totals and the written-total check.

The scaffold’s pure readiness helper treats X as a filled cell, because that is the product rule.
The export adapter must not be wired to X until this decision is made.

## 7. Data and storage

Phase 1 uses the existing tables and storage:

- `scorecard_images` for the private R2 object key, MIME type, byte size and SHA-256.
- `scorecard_extractions` for the reader engine, version and raw result.
- `scorecards`, `scorecard_entries`, `scoring_audit` through the existing submission function.
- The private R2 bucket and the existing signed PUT and GET flow.

No migration, no new bucket and no new RLS policy is part of the scaffold.

Photo retention is unchanged. The scorecard photo is evidence for the card, not a player photo.
The existing private storage policy applies.

## 8. Reader

The existing contract stays:

```text
POST SCAN_INFERENCE_URL
  image, mode, template
-> players[{ rowIndex, name, writtenTotal, holes[{ hole, strokes, confidence }] }]
```

Rules:

- A hole the reader cannot read is `null`, never a guess.
- Confidence is 0 to 1.
- A malformed result is refused.
- No reader connected means manual entry; the photo is still attached.
- The reader never auto-approves and never bypasses the verification step.

The station shows a per-hole confidence state and a batch count of weak cells. The person can
accept, change or clear any cell.

## 9. Days and sessions

Every playing day has its own round. The station must name the day on every read and write.

- Desk: use the desk’s selected `drawDay`, with the same day control the scoring desk uses.
- Staff: use the staff day context and day pills.
- Session: AM or PM from the day’s stored session. If the day has both, the station filters the
  published groups by the session and shows the start time.
- If the day has no published groups or no open round, the station says so and links to Round
  setup. It does not guess a round.

## 10. Roles and security

- Owner, organizer and desk may open the scan station.
- The existing staff guard protects `/scan` and `/staff/scan`.
- RLS remains the enforcement for every write. The station uses the existing scoring repository,
  not a new privileged endpoint.
- The photo path stays private. No public URL is stored.
- The capture key prevents a retry from creating a second revision.

## 11. Empty, loading and error states

- No event selected: link to the desk.
- No playing days: explain that the event has no dates.
- No published draw: link to the draw or the round setup.
- Round not open: link to `/scores/review` round setup.
- Reader not connected: say so and keep manual entry.
- Upload failed: keep the local preview and offer retry.
- Export partially failed: keep the failed cards in the batch, list the reason per card, and let
  the person retry only those cards.
- Duplicate card: warn, show the existing revision, and export as a new revision only after the
  person confirms.

## 12. Testing and acceptance

Pure tests:

- 18 numeric holes are ready to export.
- 17 numeric plus X is ready.
- 17 numeric plus a blank is not ready and names the missing hole.
- 0, 21, 4.5 and text are invalid and named.
- Warnings never change `ready`.
- An empty hole list is not ready.

Browser acceptance:

- Desk route renders with the Scan tab active.
- Staff route renders inside the staff shell.
- Staff Score page links to `/staff/scan`.
- The export button is disabled until 18 values are present in the scaffold’s sample state.
- No console error.

Integration acceptance, after the workflow is wired:

- Scan a card, read it, change one weak cell, add it to the batch, export.
- The card appears in `/scores/review` as submitted.
- The old card, if any, stays as an older revision.
- A repeated export does not create a second revision.
- The photo is attached and the extraction metadata names the reader.
- All days can be selected and the correct round is written.

## 13. Phases

### Phase 0: scaffold (this branch)

- Plan document.
- `/scan` and `/staff/scan` routes.
- Shared `ScanStation` shell with the four steps and the export rule.
- JSON import and export in the existing `teeline-scorecard-import` format, with a validated
  import preview and a blank template export for the open round.
- Desk rail and Scores subnav entry.
- Staff Score action link.
- Pure export-readiness helper and tests.
- No reader call, no photo upload, no score write.

### Phase 1: capture and read

- Reuse `ScorecardScan` and the existing R2 signed upload.
- Add the day and session picker.
- Add the batch list and per-card state.
- Wire the reader result into the batch.

### Phase 2: verify and edit

- Reuse `ScorecardHoleGrid`, extended for an X cell.
- Add the photo alongside the grid on desk and a collapsible photo on phone.
- Add warnings for confidence, written total, duplicate card and marker.
- Add the batch review screen.

### Phase 3: export

- Add the export action using `scoring.submitCard`.
- Add the JSON fallback in the existing import format.
- Add per-card retry and a partial-failure result.
- Add the X mapping after the owner approves the `picked_up` change.

### Phase 4: batch record and operations

- Optional `scan_batches` table and batch audit.
- Offline queue if the club needs it.
- Reader accuracy dashboard.
- Retention policy for scorecard photos.

## 14. Open decisions and risks

1. **X / pick-up storage.** The one blocker for a fully faithful export. Needs owner approval for
   an additive `picked_up` column and engine change.
2. **Marker rule.** The database requires a marker different from the player. The station proposes
   the reciprocal marker. A one-player group cannot export without a schema or policy decision.
3. **Reader accuracy.** Handwriting, glare and rotated photos will produce weak cells. The design
   keeps a person in the loop and never auto-approves.
4. **Duplicate cards.** A second card for the same player and day is a new revision, not an
   overwrite. The person must see that before export.
5. **Offline.** The station is online-only in phase 1 because the photo upload and reader need a
   connection. A local queue is phase 4.
6. **Photo retention.** The club should state how long scorecard photos are kept. The station does
   not add a new retention rule.
7. **Group sheets.** One photo can contain four players. The batch must let the person map each
   row to a player and skip empty rows. This is the most error-prone part and needs the most
   verification time.

## 15. What the scaffold does and does not do

Includes:

- A real route on both frames.
- A visible four-step workflow.
- The export rule as a pure tested helper.
- Navigation from the desk, the scoring subnav and the staff score page.
- Copy that states the future behaviour and the current limits.

Does not include:

- A camera or file upload on the new routes.
- A reader call.
- A score write.
- A new database table, migration or RLS policy.
- Approval or publication.
- X export.

The live `/scores` card workspace remains the working path until the scan station is wired.

## 16. Scaffold verification

Checked on 12 November 2026 in this worktree.

- `pnpm check` passed: TypeScript, Biome, 200 test files and 2,085 tests, then the production
  build. The build lists `/scan` and `/staff/scan` as static routes.
- `pnpm check:ui` with `UI_PORT=3101` passed 192 checks and 0 failures, with 0 console errors.
- A separate Playwright check opened `/scan` and `/staff/scan` against the production build and
  found the heading “Scan a card”, the export rule, the scaffold notice and no console errors.
- The JSON round-trip was checked in the browser: the template downloaded, four cards were filled
  and imported with 0 structural problems, and the imported file downloaded again.
- The first `pnpm check:ui` used an unrelated server already running on port 3100 and failed at
  `/players` because that server showed the sign-in page. It was not a failure of this branch. The
  rerun on a clean port passed.
- `node_modules` was installed from the frozen lockfile; the lockfile was not changed.

The scaffold does not call the reader, upload a photo, write a score or touch the database.
