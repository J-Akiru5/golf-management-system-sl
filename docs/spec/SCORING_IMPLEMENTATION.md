# Scoring implementation plan

> **Status:** 21 Oct 2026. The deterministic scoring engine is built and tested. The database design
> below is a proposal: no scoring migration has been written or applied, no screen reads the engine,
> and no OCR or public leaderboard exists yet. `docs/PLAN.md` remains the single project plan; this
> document is the scoring design and build sequence behind it.

The requirement source is the scoring specification supplied on 21 Oct 2026. Where that document
leaves a business rule open, this plan keeps it configurable and says what it blocks.

---

## 1. What exists today

`src/lib/scoring/` is a pure module. It has no database, network, clock or random input, so the same
evidence always produces the same result.

| File | Responsibility |
| --- | --- |
| `types.ts` | Evidence, handicap, canonical score, standings and finalization contracts |
| `validation.ts` | Course, tee, stroke-range and verification-policy checks; safe defaults |
| `handicap.ts` | WHS Course Handicap, Playing Handicap and hole stroke allocation |
| `stableford.ts` | Gross and net Stableford, whole or partial rounds |
| `cards.ts` | One card revision validated before the desk can approve it |
| `reconcile.ts` | Multiple cards to canonical hole scores, with desk resolutions |
| `standings.ts` | Provisional gross and net boards, and the finalization gate |

**Verified:** 90 unit tests pass and `pnpm typecheck` is clean. Biome is clean on `src/lib/scoring`.

**Not built, and not claimed:**

- a scoring schema, migration or repository;
- a scorecard screen, webcam capture, upload or OCR worker;
- provisional or final publication, and any public leaderboard;
- a tie-break procedure;
- official results or winner declaration;
- any database transaction, row-level security policy or RPC for scoring.

The app still only prints scorecards. `docs/PLAN.md` records that no scoring exists.

---

## 2. Confirmed rules and open configuration

| Area | Status | Where it lives |
| --- | --- | --- |
| 18 holes per daily competition, each day independent | Confirmed | `ScoreRoundInput.course.holes`, one call per round |
| Gross and net Stableford, both from approved gross scores | Confirmed | `scoreRound` |
| WHS Course Handicap, allowance, Playing Handicap | Confirmed pipeline | `calculateHandicap`, `HandicapSnapshot` |
| Handicap source is the NGAP export; the app never computes an index | Confirmed | `HandicapInput.indexSource` |
| Webcam, upload and manual entry use one validation path | Confirmed | `CardSource`, `validateScorecard` |
| The operations desk approves cards and resolves conflicts | Confirmed | `CardStatus`, `Resolution` |
| Live publication only for scores meeting the verification rule | Confirmed | `deriveCanonicalHoleScores`, `buildStandings` |
| Required scorecards per player | **Unconfirmed** | `VerificationPolicy.requiredCards`; `null` blocks verification |
| Scorer rotation pattern | **Unconfirmed** | Not in the engine; self-scoring is blocked |
| Rounding for a non-100% allowance | **Unconfirmed** | `HandicapRounding`: `"whs"` or `"single"` |
| Tie-break procedure | **Unconfirmed** | `TieBreakPolicy`; `null` blocks finalization |
| Multi-day eligibility | **Unconfirmed** | One round per day; no cross-day totals |
| Provisional publication visibility | **Unconfirmed** | `VerificationPolicy`; default publishes nothing |
| Final approval authority | **Unconfirmed** | `FinalizationInput.approvedBy`; role check is outside the engine |
| Maximum hole score before review | Technical guard | `DEFAULT_STROKE_LIMITS`, 1 to 20, overridable |

A safe default is not a competition rule. `DEFAULT_VERIFICATION_POLICY` sets
`requiredCards: null`, `allowProvisionalSingleCard: false` and `minOcrConfidence: 0.85`. With that
configuration every hole is `pending`, the boards are empty and finalization is blocked. Nothing is
published by accident while the organizer's rules are missing.

---

## 3. Calculation rules

### Gross Stableford

For each hole: `max(0, 2 + par - gross)`. The total is the sum over the holes that were scored.

### Net Stableford

For each hole: net = gross − handicap strokes, then `max(0, 2 + par - net)`. A plus handicap gives
strokes back, so its handicap strokes are negative on the easiest holes.

### WHS pipeline

1. Handicap Index, with its source and effective date.
2. Course Handicap = `round(index × slope ÷ 113 + (course rating − par))`.
3. Competition allowance, stored as a fraction.
4. Playing Handicap:
   - `"whs"`: `round(course handicap × allowance)`;
   - `"single"`: `round(raw course handicap × allowance)`.
5. Hole allocation from the Playing Handicap and the course stroke indexes.
6. Gross and net totals.

At a 100% allowance both rounding modes give the same Playing Handicap. IGCC has confirmed 100% so
far, so the difference is not live. It becomes live the first time a tournament uses another
allowance, which is why the mode is stored in the snapshot rather than assumed.

The existing routing helper `playingHandicap()` in `src/lib/routing/handicap.ts` rounds once at the
end. The scoring engine's `"single"` mode matches it. `"whs"` is the WHS two-step. The two must be
reconciled before a non-100% allowance is used for both draw and scoring.

### Stroke allocation

A Playing Handicap `H` over `N` holes gives `trunc(H ÷ N)` strokes on every hole. The remainder
falls on the lowest stroke indexes, one extra stroke each. A negative remainder falls on the highest
stroke indexes, one stroke given back each. The print centre's `handicapDots()` and the scoring
engine are checked against each other for handicaps from −18 to 36 in `handicap.test.ts`.

### Missing or bad inputs

Gross Stableford needs valid pars and scores. It never needs a handicap. If the snapshot is missing,
net is `unavailable`, not zero and not estimated. If a snapshot is present but its inputs do not add
up, or it was taken on another tee, net is also `unavailable` and the round carries a
`handicap_mismatch` warning. A net board never contains a fabricated value.

---

## 4. Evidence model

A score is not one field. It has five separate records on the way to becoming official:

1. **Original card and image.** The paper card, its scan or photo, and who captured it.
2. **Extraction attempt.** The OCR engine, version, attempt, raw payload and confidence. Attempts
   are immutable.
3. **Card entries.** The current values for one card revision, each with confidence and a manual
   confirmation flag. A correction changes this record; the raw extraction stays.
4. **Reconciliation decision.** A desk resolution with the value, actor, timestamp, reason and the
   cards considered. It is append-only.
5. **Canonical approved score.** At most one current value per player, round and hole, with the
   provenance (`agreement`, `single_card`, `desk_resolution`).
6. **Derived result.** Gross and net points calculated from the canonical scores, with the
   handicap snapshot and rules version that produced them.

### Card lifecycle

`submitted → in_review → approved | rejected`, plus `superseded` when a later revision replaces an
earlier one. Only `approved` cards are evidence. A player can never mark their own card.

### Multiple cards

- Cards are grouped by scorer. For each scorer, the highest approved revision is current.
- Two cards claiming the same scorer and revision are ambiguous. That scorer's evidence is dropped
  rather than guessed.
- If every usable card agrees, the hole is verified when the confirmed number of independent cards
  is present. With two required cards and one present, the hole is provisional or pending according
  to the policy.
- If any usable cards disagree, the hole is a `conflict`. No first card, last card or majority is
  chosen. The desk must resolve it with a reason.
- A resolution is the only way a disputed value becomes canonical. It carries the previous value,
  the actor, the time and the cards considered.

### What the desk sees

`CardValidation` returns `blocking`, `review` and `warning` issues. A low-confidence OCR value is a
`review` item, never an automatic correction. A written total that disagrees with the holes, a
missing hole, an impossible score, a self-scored card or a wrong round blocks approval.

---

## 5. Publication and finalization

`buildStandings()` counts only holes with status `verified` or `provisional`. A pending or conflicted
hole is left out of the points, not filled in. Every row states `holesCounted` and `totalHoles`, so an
incomplete round is visibly incomplete. The result carries `official: false` and never declares a
winner.

`checkFinalization()` blocks until all of the following are true:

| Blocker | Meaning |
| --- | --- |
| `no_players` | There is nothing to finalize |
| `round_mismatch` | The course or a canonical card belongs to another day |
| `course_invalid` | Holes, pars, stroke indexes or tee ratings do not add up |
| `policy_invalid` | The verification policy is not a valid configuration |
| `required_cards_unconfirmed` | The organizer has not confirmed how many cards are required |
| `conflicts_unresolved` | At least one hole still has disagreeing cards |
| `round_incomplete` | At least one hole is not verified |
| `net_unavailable` | A player has no valid handicap snapshot, so net cannot be official |
| `tie_break_unconfirmed` | No confirmed written tie-break rule is on file |
| `not_authorized` | No staff member is recorded as asking to finalize |

The gate checks that a tie-break policy exists. **It does not apply the procedure.** The procedure
must be implemented from the organizer's written rule before a finalization RPC is shipped. Until
then, points standings can be displayed, but no winner is declared.

---

## 6. Database design (proposed, not written)

All tables carry `club_id` and use composite foreign keys, matching the existing schema. The design
follows the existing rule: a table is readable by club staff under RLS, but writes go through a
guarded function.

### 6.1 Rounds and entry

`competition_rounds`

- `id`, `club_id`, `tournament_id`, `day_number`, `play_date`, `hole_count`, `status`,
  `allowance`, `handicap_rounding`, `stroke_min`, `stroke_max`, `required_cards`,
  `allow_provisional_single_card`, `min_ocr_confidence`, `provisional_publication`,
  `tie_break_policy_id`, `finalization_authority`, `rules_version`, `created_at`.
- `status in ('draft','open','scoring','provisional','final')`.
- `required_cards` is nullable; null means the organizer has not confirmed the count, and nothing
  can be verified.
- `provisional_publication in ('off','verified_holes')`, default `off`.
- unique `(tournament_id, day_number)` and `(tournament_id, play_date)`.
- The 18-hole daily competition is one row. Standings never cross rows.

`round_entries`

- `id`, `club_id`, `round_id`, `registration_id`, `flight_id`, `status`.
- unique `(round_id, registration_id)`.
- This is the per-day participation record. It supports separate daily eligibility without changing
  the existing `registrations` unique key `(tournament_id, player_id)`. A player may have one
  tournament registration and a separate entry, result and flight for each day.

`scorer_rotation_policies`

- `id`, `club_id`, `tournament_id`, `kind`, `config jsonb`, `confirmed_by`, `confirmed_at`.
- `kind` names a pattern the rotation validator implements, for example a reciprocal cycle.
- Until the organizer confirms the pattern, no policy row is active and the desk assigns a marker by
  hand. Self-scoring is always blocked.

`scorer_assignments`

- `id`, `club_id`, `round_id`, `player_id`, `scorer_id`, `policy_id`, `assigned_by`, `assigned_at`,
  `active`.
- partial unique `(round_id, player_id) where active`.
- check `player_id <> scorer_id`.
- A trigger checks that both people are active `round_entries` in the same round, and that the
  assignment satisfies the policy when one is configured.

**Existing hole model gap.** `holes` is keyed by `(course_id, number)` with a unique
`(course_id, stroke_index)`, so it cannot represent a different par or stroke index per tee. The
scoring engine accepts a `RoundCourse` whose holes belong to the selected tee, but the database
proposal does not yet change `holes`. If IGCC's Ladies or Senior tees have their own par or stroke
index allocation, the schema needs `tee_holes` (or `tee_id` on `holes`) and the unique keys move to
the tee. That is an owner decision before real net scoring. If all tees share one allocation, the
current model stands and the scoring engine's `sum(holes.par) === tee.par` check proves it.

`groups`

- Add `round_id` (backfill from a default round per tournament, then not null).
- Replace the unique key `(tournament_id, number)` with `(round_id, number)`.
- The live project has no group rows, so the backfill is empty in practice. This is still a change
  to an existing table and needs the owner's approval.

### 6.2 Handicap snapshot

`handicap_snapshots`

- `id`, `club_id`, `round_id`, `round_entry_id`, `index`, `index_source`, `index_effective_date`,
  `tee_id`, `course_rating`, `slope`, `course_par`, `allowance`, `rounding`, `course_handicap`,
  `playing_handicap`, `rules_version`, `created_at`.
- unique `(round_id, round_entry_id)`.
- Checks mirror `handicapSnapshotProblems`: whole-number handicaps, slope 55–155, allowance above 0
  and at most 1, a named rules version.
- Immutable once the round leaves `open`. A correction is a new snapshot with an audit row; it is
  never an in-place edit.

### 6.3 Cards and extraction

`scorecards`

- `id`, `club_id`, `round_id`, `player_id`, `scorer_id`, `scorer_assignment_id`, `source`, `revision`,
  `status`, `written_total`, `capture_key`, `image_path`, `submitted_by`, `submitted_at`,
  `approved_by`, `approved_at`, `rejection_reason`.
- unique `(round_id, player_id, scorer_id, revision)`.
- unique `(club_id, capture_key)` for idempotent capture retries.
- check `player_id <> scorer_id`.
- `source in ('webcam','upload','manual')`.
- `status in ('submitted','in_review','approved','rejected','superseded')`.

`scorecard_images`

- `id`, `club_id`, `scorecard_id`, `storage_path`, `sha256`, `mime_type`, `byte_size`, `captured_by`,
  `captured_at`.
- unique `(club_id, sha256)`. Re-uploading the same image returns the existing record instead of a
  second card.

`scorecard_extractions`

- `id`, `club_id`, `scorecard_id`, `image_id`, `engine`, `engine_version`, `attempt`, `status`,
  `raw jsonb`, `created_at`.
- unique `(image_id, engine, engine_version, attempt)`.
- Insert-only.

`scorecard_entries`

- `id`, `club_id`, `scorecard_id`, `hole_number`, `strokes`, `confidence`, `manually_confirmed`,
  `confirmed_by`, `confirmed_at`, `source_extraction_id`.
- unique `(scorecard_id, hole_number)`.
- `strokes` is null when the entry is blank or illegible; otherwise it is range-checked.

### 6.4 Desk decisions and canonical scores

`hole_resolutions`

- `id`, `club_id`, `round_id`, `player_id`, `hole_number`, `strokes`, `reason`, `resolved_by`,
  `resolved_at`, `evidence_card_ids uuid[]`, `previous_strokes`, `superseded_at`.
- partial unique `(round_id, player_id, hole_number) where superseded_at is null`.
- Append-only. The previous value and the cards considered stay with the row.

`approved_hole_scores`

- `id`, `club_id`, `round_id`, `player_id`, `hole_number`, `strokes`, `provenance`,
  `source_card_ids uuid[]`, `resolution_id`, `approved_by`, `approved_at`, `superseded_at`.
- partial unique `(round_id, player_id, hole_number) where superseded_at is null`.
- `provenance in ('agreement','single_card','desk_resolution')`.
- A new value supersedes the old row; rows are never updated in place.
- A trigger requires `resolution_id` when provenance is `desk_resolution`, and requires it to match
  the same round, player and hole.

### 6.5 Results, publications and tie-breaks

`round_results`

- `id`, `club_id`, `round_id`, `player_id`, `flight_id`, `gross_points`, `net_points`,
  `gross_strokes`, `net_strokes`, `holes_counted`, `status`, `calculation_version`, `calculated_at`,
  `superseded_at`.
- partial unique `(round_id, player_id) where superseded_at is null`.
- `status in ('provisional','final')`.
- Written in the same transaction as the canonical change that caused it.

`round_publications`

- `id`, `club_id`, `round_id`, `version`, `state`, `snapshot jsonb`, `published_by`, `published_at`,
  `note`.
- unique `(round_id, version)`.
- `state in ('provisional','final')`.
- A publication is an immutable snapshot. Players read only the latest one through a
  security-definer function, never the live tables. This mirrors `pairings_versions`.

`tie_break_policies`

- `id`, `club_id`, `name`, `procedure`, `written_source`, `version`, `confirmed_by`, `confirmed_at`.
- `procedure` names a procedure the code implements. Until one is implemented, no policy row may be
  attached to a finalized round. The finalization gate only checks that a confirmed policy exists;
  the RPC must additionally require a supported procedure.

### 6.6 Audit

`scoring_audit`

- `id`, `club_id`, `round_id`, `entity`, `entity_id`, `action`, `actor_id`, `at`, `reason`,
  `before jsonb`, `after jsonb`.
- Insert-only. `revoke update, delete` from every client role.
- Every capture, approval, rejection, manual confirmation, resolution, recalculation, provisional
  publication and finalization writes a row. The domain rows also carry the actor, so the audit does
  not have to be reconstructed from prose.

### 6.7 Guarded functions

| Function | Does |
| --- | --- |
| `submit_scorecard(...)` | Idempotent on `capture_key`; inserts card, image, extraction and entries in one transaction |
| `approve_scorecard(card, actor, reason)` | Locks the card and round, re-checks the card's own integrity, marks it approved, records the audit row |
| `resolve_hole(round, player, hole, strokes, reason, actor)` | Inserts an append-only resolution, supersedes the current canonical row, recalculates the player's result |
| `replace_canonical_scores(round, player, rows, actor)` | Verifies each proposed row against the approved cards or the head resolution, then supersedes and inserts canonical rows |
| `publish_round(round, state, actor)` | Writes the next immutable publication snapshot, provisional or final |
| `finalize_round(round, actor)` | Re-checks every finalization gate, requires a confirmed supported tie-break policy, writes the final publication and sets the round status |

`replace_canonical_scores` is deliberately a verifier, not a second scoring engine. The TypeScript
engine decides agreement and conflict; the RPC refuses any proposed value that is not supported by
the approved cards or a resolution. This keeps one algorithm while preventing a client from
inventing a score.

All functions are `security definer`, `set search_path = ''`, and revoked from `anon`. A new
function is private until its migration grants it, following `20261031000000`.

### 6.8 Transactions and concurrency

- Approval, resolution and recalculation happen in one transaction. A failed transaction leaves no
  card approved with half-updated canonical scores.
- `select ... for update` on the card, round and current canonical rows.
- A card approval carries the revision the desk saw; a stale revision is refused.
- The partial unique indexes are the last line of defence: one current canonical score per hole and
  one current result per player.
- Round status moves forward only. Reopening a finalized round is a separate audited action.

### 6.9 Roles and storage

- Card submission, approval and resolution: `desk`, `organizer`, `owner`.
- Finalization: `organizer` and `owner` by default. The authority policy is unconfirmed; the default
  must not be treated as the organizer's decision.
- Players have no access to scoring tables. They read a published snapshot through a
  security-definer function, the same pattern as `public_pairings`.
- Scorecard images go to a new private `scorecard-images` bucket, path
  `{club_id}/{round_id}/{scorecard_id}/{sha256}.{ext}`, with the same club-scoped policy as
  `player-photos`.
- Scorecards contain names and scores. Retention and access need the same privacy review as player
  photos. No public URL and no cache.

### 6.10 Migration order

The next free version after `20261034000000_course_maps.sql` is `20261035000000_scoring.sql`.
**`20261034000000` is written but not applied.** `supabase db push` would apply both. Do not run it
until the owner has either approved the course-map migration too or decided how to sequence them.

The scoring migration is additive except for `groups.round_id`. It must not be applied to the live
project without the owner's explicit approval, a backup and the normal reviewed-migration process.

---

## 7. Acceptance criteria status

| Criterion | Engine status | Still needed |
| --- | --- | --- |
| SC-01 Gross Stableford | Covered by `stableford.test.ts` | Repository and screen |
| SC-02 Net Stableford | Covered by `handicap.test.ts` and `stableford.test.ts` | Real tee data and allowance confirmation |
| SC-03 Separate daily results | Covered by `standings.test.ts` | `competition_rounds` and `round_entries` |
| SC-04 Multiple scorecards | Covered by `reconcile.test.ts` | Card tables and capture path |
| SC-05 Desk resolution | Covered by `reconcile.test.ts` | `hole_resolutions`, RPC and audit |
| SC-06 OCR and fallback | Same validation for all three sources in `cards.test.ts` | Camera, upload and OCR worker |
| SC-07 Provisional publication | Verified-hole-only boards in `standings.test.ts` | Publication policy and public snapshot |
| SC-08 Official finalization | Gate in `standings.test.ts` | Finalization RPC, tie-break procedure, authority |
| SC-09 Idempotency | Design only | `capture_key`, image hash, extraction attempt keys |
| SC-10 Concurrency | Design only | Locks, revision guard, partial unique indexes |
| SC-11 Auditability | Resolution fields in the engine | Append-only tables and RPC audit rows |
| SC-12 Recovery | Design only | Transaction boundaries and retry tests |

SC-09 to SC-12 are database properties. They cannot be claimed from a pure module.

---

## 8. Build sequence

1. **Engine. Done 21 Oct 2026.** Calculations, validation, reconciliation, boards and gate.
2. **Schema. Next, and it needs the owner.** Review the tables above, the `groups.round_id` change,
   the RPCs, the roles and the storage bucket. Write `20261035000000_scoring.sql`, test it on a
   disposable branch or local database, then apply under the normal process.
3. **Scorecard workflow.** Repository, server actions, manual entry first, card approval, desk
   resolution, audit view. No OCR yet.
4. **Provisional publication.** Persist canonical scores and results, write `publish_round`, and add
   the desk and player boards. Incomplete rounds show holes counted.
5. **Computer vision.** Webcam capture, upload, OCR extraction, confidence review and manual
   confirmation. The OCR worker never decides a rule or a conflict.
6. **Production readiness.** Round-trip tests with real course data, concurrent approval tests,
   failed-transaction recovery, role checks, a simulated four-player tournament and the organizer's
   acceptance run.

Do not start step 5 before step 3 works. An OCR pipeline in front of an unproven approval workflow
multiplies the ways a score can be wrong.

---

## 9. Decisions the owner must make

| # | Decision | Default now | Blocks |
| --- | --- | --- | --- |
| S1 | Approve the scoring schema, including `groups.round_id` | Not written, not applied | Everything after the engine |
| S2 | Required scorecards per player, and whether a single card may show provisionally | `requiredCards: null`, single-card display off; nothing publishes | Verification and finalization |
| S3 | Scorer rotation patterns and validation rules | Manual assignment; self-scoring blocked | Card identity and rotation checks |
| S4 | Course/tee data, allowance and rounding for non-100% events | WHS two-step; 100% confirmed so far | Valid net results |
| S5 | Written tie-break rule and the procedure to implement | `null`; finalization blocked | Official ranking and winners |
| S6 | Multi-day eligibility and entry restrictions | One entry per day; no cross-day totals | Registration and per-day eligibility |
| S7 | Provisional publication: who sees partial scores, and when | Off | Live leaderboard visibility |
| S8 | Final approval authority: desk alone or a committee | Organizer/owner; finalization not enabled | Official results workflow |
| S9 | Scorecard image retention and access | Private bucket, no retention period set | Privacy policy and storage |
| S10 | Whether each tee has its own par and stroke indexes | One shared allocation until confirmed | Correct net scoring on a tee with its own allocation; `tee_holes` schema |

The first action is S1. The other decisions can be answered while the workflow is built, but S2,
S5 and S8 must be answered before a tournament is activated for official scoring.

---

## 10. Risks

- **Wrong tee data.** Every net result inherits the Course Rating, Slope, par and stroke index. The
  real IGCC values are still missing. Placeholder numbers must never reach a real event.
- **One hole allocation for every tee.** The current `holes` table cannot hold a different par or
  stroke index per tee. If the Ladies or Senior tees differ, net scoring is wrong until `tee_holes`
  exists. The engine's par-total check fails closed, but a shared allocation can still be wrong
  without being inconsistent.
- **Two rounding rules.** Routing and scoring must agree before a non-100% allowance is used.
- **SQL and TypeScript drift.** The RPC verifies canonical proposals rather than rescoring. Contract
  tests against the engine are required once the migration exists.
- **OCR confidence is not truth.** A high-confidence wrong read is still wrong. The desk approves
  cards; the engine does not.
- **Scorecards are personal data.** Names and scores on an image need the same consent and retention
  discipline as photos, and the privacy policy does not mention scorecards yet.
- **The plan is ahead of the code.** This document describes a schema that does not exist. Treat every
  table and RPC above as a proposal until the migration is applied and verified.
