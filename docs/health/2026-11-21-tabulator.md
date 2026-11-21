# Health check: the tabulator view and scoring to the public board

- Date: 21 November 2026
- Code checked: `617a7fa`, tagged `v0.62.0` (`VERSION` is 0.62.0). This is the release production runs.
- Area: `public/scorecard/**`, `src/app/scorecard/**`, `src/lib/scorecards/**`,
  `src/app/api/scorecards/**`, `src/app/api/scoring/scan/**`, `src/lib/scoring/**`, `/scores`,
  and the public leaderboard and results.
- Method: read the code and the migrations, ran `pnpm exec vitest run src/lib/scoring
  src/lib/scorecards` and `pnpm exec vitest run src/app/api/scorecards src/app/api/scoring`.
  `gh issue list` and `gh issue view` were refused by this environment's permission layer
  (`Permission denied: shell`), so the issue state below is checked against the code and
  `docs/PLAN.md`, not against GitHub. `pnpm check:ui` was not run.

## 1. Verdict for v1.0.0

**Ready with fixes.** The desk path on `/scores` does publish on save, and the public pages read
only frozen publications. Before the tag, close the P1 findings: the tabulation page still hands
cards to an admin who imports and publishes (T1), unchecked cards are auto-approved on import (T2),
the card-letter tee rule is enforced on the tabulation page but not on `/scores` or the import (T3),
a desk account cannot publish (T4), a later send can replace an unread queue entry (T5), and
tabulator saves have no audit row (T6).

## 2. What is there, and the findings

### 2a. Publish on save: the path from save to the public board

There are two tabulator surfaces and they behave differently.

**Path 1, `/scores` (club staff, React desk, the approval surface).**

1. The desk types or scans a card `src/components/scoring/ScorecardWorkspace.tsx`.
2. Under the event's card rules the save also approves:
   `src/components/scoring/ScoresDesk.tsx:894-923` calls `scoring.saveEventCard(..., { approve: true })`.
3. The save schedules a publication after a two second debounce:
   `src/components/scoring/ScoresDesk.tsx:523-536` (`setTimeout(..., 2000)`).
4. `publishRound` calls the `publish_round` database function:
   `src/lib/data/supabase/scoring.ts:885-895`.
5. The function builds a frozen snapshot and writes a new version into `round_publications`:
   `supabase/migrations/20261110000400_provisional_publication.sql:71-89`.
6. The public pages read only that frozen snapshot (`public_published_rounds`,
   `src/lib/data/public-results.ts:83`) and the team leaderboard RPC
   (`src/lib/data/public-team-leaderboard.ts:251`, cached in
   `src/lib/data/supabase/public-cache.ts:99-105`).
7. The shared public data cache is cleared at once through `/api/revalidate-pairings`
   (`src/lib/data/supabase/draw-sync.ts:140-156`, `src/app/api/revalidate-pairings/route.ts:38-41`).

The default mode is `every`, so a saved and approved card is public about two seconds later
(`src/lib/scoring/publish-mode.ts:20-38`). Importing a tabulator batch publishes once after the
batch under the same mode (`src/components/scoring/SheetImportPanel.tsx:224-255`).

Three gates can still stop or hide a publication, and they are deliberate:

- The round's `provisional_publication` is `off`, or the round is `final` or `draft`
  (`src/lib/scoring/publish-mode.ts:85-96`, `supabase/migrations/20261110000400_provisional_publication.sql:54-59`).
- The browser was left on `checked` or `manual` for that event and day. That choice lives in
  `localStorage`, not on the event (`src/lib/scoring/publish-mode.ts:45-59`).
- The desk's results release switch can hold the leaderboard even after a publication
  (`src/app/(public)/leaderboard/page.tsx:121-133`).

**Path 2, `/scorecard` (the tabulation team, static page).** Saving keeps the card in the private
bucket document. Pressing **Send to admin** freezes the checked cards and returns a submission
payload, but it publishes nothing. The admin must open `/scores/review`, review the submission,
press Import, and the import then publishes. This is stated in the code itself:
`public/scorecard/index.html:2038-2040` ("Nothing is approved here: the admin imports the frozen
cards with a staff session and publishes them") and
`src/components/scoring/TabulatorSubmissionsPanel.tsx:63-65`. So the owner's live-event rule is
true on `/scores` and not on `/scorecard` (finding T1).

### 2b. Handicap on save

- The WHS playing handicap is the only source on `/scores`. The HDCP box is read as a note
  (`src/components/scoring/ScorecardWorkspace.tsx:150-193`,
  `src/lib/scoring/event-rules.ts:238-249`), and every approval writes or checks the snapshot
  (`src/lib/data/supabase/scoring.ts:646-658`, `734-764`).
- The event maximum is applied at both steps as the owner asked: the index is capped at the maximum
  and the playing handicap is held to the same maximum (`src/lib/scoring/event-rules.ts:184-203`).
- The **tee source diverges**. `/scores` and the import use the registration tee only:
  `src/lib/scoring/event-card.ts:144-156`, `src/lib/scoring/import/sheet.ts:357-364`, and the
  field's `playingHandicap` is the registration figure (`src/lib/scorecards/field.ts:355`).
  The tabulation page uses the letter on the card when there is one:
  `public/scorecard/index.html:786-797` and the tee selector at `:904`.
  A card written "L" for a player registered on White shows one number on `/scorecard` and is
  scored on White when the admin imports it (finding T3).
- A card tee the page has no rating for silently falls back to the stored registration-tee figure
  and is still scored net (`public/scorecard/index.html:846-848`, finding T7).
- Index 0 is handled two ways. The tabulation page refuses to score net and shows gross only
  (`public/scorecard/index.html:791`, test at `src/lib/scorecards/page-handicap.test.ts:139-146`).
  `/scores` scores index 0 off the WHS figure and publishes it, with the "index 0 on file, check
  WHS" warning (`src/lib/scoring/event-rules.ts:190-198`, `src/lib/scoring/event-rules.test.ts:94`).
  Finding T8.

### 2c. Scanning and the QR plan

What exists:

- The tabulation page reads a photo and shows a draft for review before anything is stored.
  `public/scorecard/index.html:2276-2322` shrinks the photo and posts it to
  `POST /api/scorecards/scan`; `src/app/api/scorecards/scan/route.ts:13-45` calls the reader
  through `src/lib/scorecards/scan.ts`. The photo is not stored on this path
  (`src/lib/scorecards/scan.ts:4-11`).
- The desk scan path uploads the photo, reads it, and returns a draft where the desk confirms
  every value and picks the player: `src/components/scoring/ScorecardScan.tsx` (phase machine,
  player combobox, manual entry) and `POST /api/scoring/scan/extract`
  (`src/app/api/scoring/scan/extract/route.ts:20-107`).
- Manual override is the normal path. Cells are editable and the scan has to be confirmed before
  submit (`src/components/scoring/ScoresDesk.tsx:479-480`).
- A fuzzy name matcher exists and is tested, including the GORMLEY/Wormley and LIM/Um cases:
  `src/lib/scoring/match/match-player.ts:1-398`,
  `src/lib/scoring/match/match-player.test.ts`. A scan inbox state machine and suggestion helpers
  also exist: `src/lib/scoring/inbox/**`.

What is missing:

- The reader service exists in the repository, with a card template, cell cropping, an ONNX
  adapter and tests (`scripts/scan/`, `scripts/scan/models/README.md:1-74`). No model binary is
  committed (`scripts/scan/models/README.md:3`), and the project notes say digit accuracy on raw
  phone photos is not production ready (`:72-74`). Without `SCAN_INFERENCE_URL` the routes return
  `available: false` and tell the desk to type the card (`src/lib/scorecards/scan.ts:42-48`).
- The fuzzy matcher and the inbox are not wired to any screen. `git grep "scoring/inbox"` over
  `src/app` and `src/components` returns nothing; the only callers are the helpers' own tests.
  The tabulation page matches scans by an exact normalised name key, not the fuzzy matcher
  (`public/scorecard/index.html:2344-2369`).
- The `scorecard_scans` table is designed but the migration is marked "NOT APPLIED"
  (`supabase/migrations/20261113000100_scorecard_scans.sql:3`) and nothing reads it.
- **QR code on the scorecard: not started.** There is no QR in the tabulation page
  (`git grep -ni qr public/scorecard` returns nothing) and no QR generator on the printed card
  (`src/components/print/Scorecard.tsx`). The only QR in the product is the join/claim code
  (`src/components/onboarding/JoinQr.tsx`). The plan is a sentence in `docs/PLAN.md:1117`, and
  `docs/SCORECARD_SCAN.md:144` says a QR is not on the current card. Nothing of the "QR holds
  the card id, reader looks up the player, manual pick when damaged" flow exists. Finding T12.

### 2d. A separate tabulator app

Today's boundary:

- `/scorecard` is a redirect to a self-contained static HTML page, `public/scorecard/index.html`
  (3,570 lines), served by the main Next app (`src/app/scorecard/page.tsx:1-9`). It has its own
  CSS and JavaScript and its own copy of the handicap formula, held equal to the engine by
  `src/lib/scorecards/page-handicap.test.ts`.
- Its API is the main app's route handlers: `/api/scorecards/[slug]`, `[slug]/snapshot`,
  `[slug]/export`, `field`, `session`, `scan`, `submit`, `submissions`.
- Auth is separate from club staff. The role is `scorecard_role = "tabulation"` in the Supabase
  user's app metadata, or an email allowlist in `SCORECARD_TABULATION_EMAILS`
  (`src/lib/scorecards/access.ts:16-40`); `scripts/scorecard-role.mjs` grants it. A tabulation
  account must not be in `club_members`, because that table's RLS opens the desk's data
  (`src/lib/scorecards/access.ts:17-21`).
- The shared document is a private bucket, `scorecard-documents`, with the service role used only
  on the server (`src/lib/scorecards/store.ts:81-101`).
- The desk surface is a React tab inside the main app (`/scores`, `/scores/review`) and shares
  `src/lib/scoring`, the design system, and the club session.

What a split would involve:

- The repository already has the pattern: `apps/ops` is a second Next app in the pnpm workspace
  with its own port, checks and Vercel project (`apps/ops/package.json`, `pnpm-workspace.yaml`,
  `docs/PLAN.md:64`).
- A tabulator app would need its own deployment and its own entry in the deployment allowlist,
  its own auth callback and cookie handling on its domain, and the `/api/scorecards/**` handlers
  either copied or extracted into a shared package. The bucket and the Supabase project can stay
  shared.
- The reusable pieces are already isolated enough to extract: `src/lib/scorecards/{document,merge,store,field,access}.ts`,
  `src/lib/scoring/{handicap,event-rules,publish-mode}.ts`, `src/lib/scoring/scan/**` and
  `src/lib/scoring/match/**`. The static page's duplicated handicap block would either move into
  that package or keep the parity test.
- The hard part is not the UI split. It is that the tabulation page has no approval or publish
  authority today. A separate app still cannot call `publish_round` (owner/organizer only) and
  still has no staff session for the import. Splitting the app does not remove the admin step
  unless a server-side approval path is designed at the same time (T1, T4).

### 2e. Findings

| id | severity | area | what is wrong | evidence | suggested fix | suggested owner |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | P1 | Publishing | The tabulation page's Send to admin only freezes cards into the day document. The admin must review, import and publish, so a card approved there does not reach the public board on save. | `public/scorecard/index.html:2038-2040`, `:2188-2193`; `src/components/scoring/TabulatorSubmissionsPanel.tsx:63-65`; `src/app/api/scorecards/submit/route.ts:76-80` | Either make the tabulation page a real approval surface (a server route that writes canonical scores with a verified tabulation identity and calls the publish function) or state plainly in the product that the tabulation page is a hand-off and `/scores` is the only publish-on-save surface. | Lou (code), Jeff (approval and publish authority), Karl (event process) |
| T2 | P1 | Approval queue | Every card in a tabulator submission is imported as `verified: true`, including cards the tabulator did not tick as checked. The import therefore approves and can publish an unchecked card. | `src/components/scoring/TabulatorSubmissionsPanel.tsx:128-145` (line 132); `src/lib/scoring/import/sheet.ts:391` (`approve: card.verified`); `public/scorecard/index.html:1383`, `:2213` (send all scored, including unchecked) | Carry `checked` into `verified`, so an unchecked card is saved but not approved, or refuse it at import with a named reason. | Lou |
| T3 | P1 | Handicap | `/scores` and the import compute the playing handicap on the registration tee. The tabulation page computes it on the letter written on the card. A card whose tee differs from the registration is scored two ways, and the published number is the registration one. | `src/lib/scoring/event-card.ts:144-156`; `src/lib/scoring/import/sheet.ts:357-364`; `src/lib/scorecards/field.ts:355`; `public/scorecard/index.html:786-797`, `:904` | Add a card-tee field to the `/scores` card and to the import, resolve the tee ratings from the card letter with the registration tee as fallback, and test both paths for the same player. | Lou |
| T4 | P1 | Auth and publishing | `publish_round` accepts only owner and organizer, but the screen enables the publish controls for the `desk` role. A desk user can save and approve, then the automatic publish is refused, and the cache clear is refused as well. | `supabase/migrations/20261110000400_provisional_publication.sql:51-53`; `src/app/api/revalidate-pairings/route.ts:29-36`; `src/components/scoring/ScoresDesk.tsx:1565-1569`, `:557-561` | Decide who may publish. If desk should, add `desk` to the function, the revalidate route and their tests; if not, remove desk from the screen gate and say who publishes. | Jeff (RPC and RLS), Lou (screen) |
| T5 | P1 | Queue data safety | A day document holds one `submission`. A second send replaces it. Cards already marked `sentAt` are never sent again, and editing a card is the only thing that clears `sentAt`, so an earlier un-imported batch can drop out of the admin queue. | `public/scorecard/index.html:2055-2060`, `:2162`; `src/lib/scorecards/merge.ts:214-224` (incoming spread over stored); `src/app/api/scorecards/submissions/route.ts:44-48` | Keep submissions append-only (a list or a small table keyed by send time), and let the admin mark one imported. Do not let a later send overwrite an earlier unread one. | Jeff (storage and schema), Lou |
| T6 | P1 | Audit (#265) | A tabulator save is not written to any audit table. The document records only the last writer's email, and a snapshot is taken only before Reset or Replace. There is no durable record of who changed a hole. | `src/app/api/scorecards/[slug]/route.ts:110-116`; `supabase/migrations/20261035000000_scoring_schema.sql:350-362`; `public/scorecard/index.html:1102-1119` | Write an append-only audit row per save or per card revision (actor, time, card id, old and new holes), and take snapshots on a schedule, not only on destructive actions. | Jeff |
| T7 | P2 | Handicap | A card tee with no rating falls back to the stored registration-tee playing handicap and is still scored net, so the card plays off a tee that is not the one written on it. | `public/scorecard/index.html:792-796`, `:846-848` | Refuse net scoring and name the missing tee rating instead of using another tee's figure. | Lou |
| T8 | P2 | Handicap | Index 0 is treated as "no index" on the tabulation page (gross only), but `/scores` gives it a WHS figure, approves it and publishes it. | `public/scorecard/index.html:791`, `:839-841`; `src/lib/scorecards/page-handicap.test.ts:139-146`; `src/lib/scoring/event-rules.ts:190-198` | Pick one rule with the owner and apply it on both surfaces. If zero-index players are held for the admin's WHS check, hold them from publication too. | Lou, Karl (confirm with WHS) |
| T9 | P2 | Setup | The round's rules version is free text. A typo makes `eventRulesFor` return null, so the event handicap rule and the approval snapshot are silently skipped. | `src/components/scoring/OpenRoundPanel.tsx:148-158`; `src/lib/scoring/event-rules.ts:62-66`; `src/lib/data/supabase/scoring.ts:646-648` | Offer a select of the known rule sets and refuse an unknown value when opening the round. | Lou |
| T10 | P2 | Queue display | The queue's "card/system handicap difference" count is always zero for cards sent by the current submit route. It filters `handicapSource === "card"`, which the route never sets. | `src/app/api/scorecards/submissions/route.ts:78-83`; `src/app/api/scorecards/submit/route.ts:188-190` | Compare `cardHdcp` with `systemHcp` and count a real difference. | Lou |
| T11 | P2 | Scanning | No model binary is committed and the project notes say digit accuracy is not production ready. The fuzzy matcher and scan inbox are implemented but have no screen, and the tabulation page matches scans by exact name only. Whether production sets a working reader cannot be checked without a live call, so this is suspected for the deployed app and proven for the repository. | `scripts/scan/models/README.md:3`, `:72-74`; `src/lib/scorecards/scan.ts:42-48`; `git grep "scoring/inbox" -- src/app src/components` returns nothing; `public/scorecard/index.html:2344-2369` | Finish the reader to a measured accuracy, then wire the inbox screen and `matchPlayers` as suggestions with the desk confirming. | Karl (service and model), Lou (screen) |
| T12 | P2 | QR on the scorecard | Nothing exists. There is no QR on the card, no card id carried in a QR, no reader lookup, and no damaged-QR manual pick. | `git grep -ni qr public/scorecard` returns nothing; `src/components/print/Scorecard.tsx`; `docs/PLAN.md:1117`; `docs/SCORECARD_SCAN.md:144` | Design the card-id payload and print it on the card, add a QR scan mode that looks the card up and opens the player, and keep the existing manual pick as the fallback. | Lou (print and reader), Jeff (id design) |
| T13 | P2 | Concurrency | Two tabulators saving the same card at the same moment keep the newer whole card. The losing score is only written into the card's note, so one person's hole can disappear without anyone reading it. | `src/lib/scorecards/merge.ts:72-114`, `:180-185`; `src/lib/scorecards/store.ts:34-38` | Show the clash on the card and require a person to pick the value, instead of relying on a note. | Lou |
| T14 | P2 | Concurrency and retention | The save lock is a 10 second lease with takeover. A slow save can be taken over and two writers can run. Snapshots have no retention, and the queue lists at most 200 objects and downloads them one by one. | `src/lib/scorecards/store.ts:49-50`, `:164-195`, `:221-243`, `:283-302` | Extend the lease or heartbeat it, add a small conflict token on write, cap and prune snapshots, and index submissions instead of listing the bucket. | Jeff |
| T15 | P2 | Publish freshness | The public cache clear is fire and forget and swallows errors. If it fails, the board can be up to 30 seconds stale and nothing reports it. | `src/lib/data/supabase/draw-sync.ts:140-156`; `src/lib/data/supabase/public-cache.ts:33-36` | Record a failed clear and retry, or log it where the desk can see it. | Lou |
| T16 | P2 | Product shape | There is no separate tabulator app. The static page is served by the main deployment and calls the main app's API routes, so a tabulator deploy is a full app deploy. | `src/app/scorecard/page.tsx:1-9`; `public/scorecard/index.html`; `apps/ops/package.json`; `docs/PLAN.md:64` | Follow the `apps/ops` pattern: a second workspace app with its own deployment, its own entry in the deployment allowlist, and a shared package for the scorecard and handicap code. | Jeff, Karl |

Additional small note: the tabulation page still carries bundled tee ratings
(`public/scorecard/index.html:269-271`) and only adopts the event's ratings after a successful
field load (`:3267-3271`). A card that is not linked to a field player is not scored net at all
(`:786-789`), so this is contained, but the bundled numbers must not be presented as IGCC's real
ratings if they are ever used on screen.

## 3. Open issues checked

| Issue | State in the code | Evidence |
| --- | --- | --- |
| #301, WHS handicap on save and approval, publish per day | **Partly done.** The `/scores` save-and-approve path and the import path publish on save with three modes and a per-day browser setting. The tabulation page still hands off to the admin, so the same owner rule is not met there. | `src/components/scoring/ScoresDesk.tsx:523-565`, `:894-923`; `src/components/scoring/SheetImportPanel.tsx:224-255`; `src/lib/scoring/publish-mode.ts:20-38`; hand-off at `public/scorecard/index.html:2038-2040` |
| #296, WHS playing handicap from the index and tee | **Partly done.** WHS is the only source on save and approval, and the maximum and allowance are applied. The tee is the registration tee on `/scores` and in the import; the card letter is used only on the tabulation page. | `src/lib/scoring/event-card.ts:144-156`; `src/lib/scoring/import/sheet.ts:357-364`; `public/scorecard/index.html:786-797` |
| #265, audit coverage behind every fast change | **Not done for the tabulator document; partial in the scoring database.** Card saves, approvals, corrections and publishes write `scoring_audit` rows with an `after` payload. A bucket save writes only `updatedBy`. | `supabase/migrations/20261035000000_scoring_schema.sql:350-362`; `supabase/migrations/20261114000100_card_handicap_snapshot.sql:152-164`; `src/app/api/scorecards/[slug]/route.ts:110-116` |
| #303, tabulator branding, pinned bar, system handicap, add a card | **Done.** Brand row, sticky toolbar, system handicap text, and "Add card for a player" are all present, and the browser checks exercise them. | `public/scorecard/index.html:51`, `:67`, `:215-216`, `:240`; `scripts/verify-ui.mjs:2145-2209` |

I could not read the issues themselves because `gh` is blocked in this environment. This table is
the code state, not the issue thread.

## 4. What works, so it is not touched

- The public board reads a frozen publication, never the live desk tables:
  `src/lib/data/public-results.ts:83`, `src/lib/data/supabase/public-cache.ts:54-119`,
  `supabase/migrations/20261110000400_provisional_publication.sql:81-89`.
- The `/scores` save under the event rules saves and approves in one step, then publishes after a
  two second debounce, one publication per burst:
  `src/components/scoring/ScoresDesk.tsx:519-536`, `:894-923`.
- The publication mode is a clear three-way setting, defaults to every save, and a corrupt stored
  value falls back to publishing rather than going quiet: `src/lib/scoring/publish-mode.ts:20-59`
  and `src/lib/scoring/publish-mode.test.ts`.
- A batch import publishes once after the batch under the same mode:
  `src/components/scoring/SheetImportPanel.tsx:224-255`.
- The shared day document is merged card by card with revision numbers and tombstones, and the
  read-merge-write is held by a lease, so one tabulator's save does not erase another's cards:
  `src/lib/scorecards/merge.ts:1-229`, `src/lib/scorecards/store.ts:139-201`.
- The page keeps a local copy, saves every two seconds, polls for other tabulators every three
  seconds, and warns before closing when the browser copy could not be written:
  `public/scorecard/index.html:662-680`, `:3055-3145`, `:3421-3423`, `:3557-3559`.
- The static page and the scoring engine share one handicap rule, and a test holds them equal over
  an index grid, three tees and two allowances:
  `src/lib/scorecards/page-handicap.test.ts:92-124`.
- The tabulator page uses the card letter for the handicap and keeps the card's HDCP box as a note:
  `public/scorecard/index.html:742-808`, `:904`, `:925-955`.
- Every approval, including an imported card, gets a WHS card handicap snapshot before it counts:
  `src/lib/data/supabase/scoring.ts:646-658`, `:752-761`.
- A destructive Reset or Replace takes a snapshot first and refuses to run if the snapshot fails:
  `public/scorecard/index.html:1100-1119`, `src/app/api/scorecards/[slug]/snapshot/route.ts:13-58`.
- The scan review screen never auto-approves. The desk sees every value, can retype it, picks the
  player, and confirms before submit: `src/components/scoring/ScorecardScan.tsx`, and
  `src/components/scoring/ScoresDesk.tsx:479-480`.
- The fuzzy name matcher is implemented and tested for the real Day 1 misreads, even though it is
  not wired to a screen yet: `src/lib/scoring/match/match-player.ts`, `match-player.test.ts`.
- Tabulation access is independent of club membership and the service role stays on the server:
  `src/lib/scorecards/access.ts:16-40`, `src/lib/scorecards/store.ts:81-101`.

### Tests run

```
pnpm exec vitest run src/lib/scoring src/lib/scorecards
Test Files  52 passed (52)
Tests       698 passed (698)

pnpm exec vitest run src/app/api/scorecards src/app/api/scoring
Test Files  1 passed (1)
Tests       4 passed (4)
```

There is no component test for `scheduleAutoPublish` or `publishVerified`; only the pure decision
is tested (`src/lib/scoring/publish-mode.test.ts`). The Playwright checks do cover `/scores` and
`/scorecard/index.html` (`scripts/verify-ui.mjs:314-560`, `:2145-2209`), but I did not run
`pnpm check:ui` here.
