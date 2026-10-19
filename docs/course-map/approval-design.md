# Course map: the approval and versioning design (Phase 2)

This is the Phase 2 deliverable for the verified course-mapping work: the smallest data and approval
design that lets a layout be drafted, checked by the two named reviewers, and published — without
touching the course numbers, the draw, the print sheets or anything players see.

Companion documents: `docs/course-map/review.md` (the references, the discrepancies and the checklists).

**State: design and migration written, migration NOT applied, no UI wired, no data entered.**
The app behaves exactly as it did before this phase.

## 1. The lifecycle

```
                     technical confirmed                 validation confirmed
   draft ─────────────────────────────▶ awaiting_validation ─────────────────▶ approved ──publish──▶ published
     ▲                                          │                               │                     │
     │                                          └── changes requested ──▶ rejected (validation)      │
     ├────────────────── changes requested ◀────────┘ (technical)                                     │
     │                                                                                                ▼
     └─────────────────────────────────────────────────────────────────────────────────────── superseded
```

| Status | Meaning |
| --- | --- |
| `draft` | A proposal. Not shown to anyone outside the desk, never described as official. |
| `awaiting_technical` | Sent for Sir Philip's confirmation. (The screen records the confirmation directly today, so a map usually moves from `draft` straight to `awaiting_validation`; the state exists for a future "send for review" step.) |
| `awaiting_validation` | Technically confirmed; waiting on Ma'am Mary Ann's validation. |
| `approved` | Both confirmations recorded. Ready, but not yet official. |
| `published` | The official map for its course. At most one per course, enforced by a database index. |
| `superseded` | Was published; a newer version replaced it. Kept, not deleted. |
| `rejected` | A proposed version that validation refused. Kept, so history is distinguishable from work in progress. |

The rules, in one place:

1. A map becomes `published` only through `publish_course_map`, only from `approved`, and only when the
   **latest** decision of **each** kind is a confirmation. A later change request wins.
2. Publishing a version supersedes the course's previous published version in the same transaction.
3. A published or superseded version is **immutable**: the trigger refuses edits to its holes. A change
   means a new version.
4. Editing a draft that had been confirmed **withdraws both confirmations** and returns it to `draft`
   (trigger on `course_map_holes`). An approval never carries over to later edits.
5. Every review records the reviewer's name, the decision, an optional note, the signed-in account (if
   any) and the timestamp. Reviews are never edited or deleted.
6. Nothing in this design changes `courses`, `tees`, `holes`, `tournaments` or
   `tournaments.course_data_confirmed`. The official **numbers** stay where they are, confirmed
   separately; the map is **where the holes are**. Neither confirmation implies the other.

## 2. Tables

`public.course_maps` — one row per version:

| Column | Why |
| --- | --- |
| `id`, `club_id`, `course_id` | The course it describes; `club_id` follows the multi-tenant rule and lets RLS use `is_club_member`. |
| `version` | 1, 2, 3 … per course; `unique (course_id, version)`. A new number is a new proposal. |
| `status` | The lifecycle above, constrained by a check. |
| `note` | What changed in this version, in the organizer's words. |
| `base_image` | The picture this version refers to (bundled path or storage key). **Null means the built-in illustration**, which must never be described as official. |
| `created_by`, `created_at` | Who prepared it and when. |
| `technical_confirmed_at`, `validation_confirmed_at` | Set when each confirmation is recorded; cleared when the map changes. |
| `published_by`, `published_at` | The explicit publish act. |

`public.course_map_holes` — the placements for one version: `number`, `tee_x/tee_y`,
`green_x/green_y` (normalised 0..1 from the top-left of the base image, null when not placed),
`direction` (free text until the club settles a vocabulary), `source` (`illustration | aerial |
survey`) so the app can say what it is standing on, and `notes`. These are **marker positions on a
picture, not survey geometry** — the app must never present them as coordinates on the ground.

`public.course_map_reviews` — the audit: `kind` (`technical | validation`), `reviewer_name`,
`reviewer_user` (null when the reviewer has no account), `decision` (`confirmed |
changes_requested`), `note`, `created_at`. Indexed by `(map_id, kind, created_at desc)`, which is
exactly how publish reads the latest decision.

## 3. Who can do what

| Actor | Read | Write |
| --- | --- | --- |
| Owner / organizer | The club's maps and reviews | Create a version, save placements, record a review, publish — **only through the functions** |
| Desk | The club's maps and reviews | Nothing |
| Player | Nothing in these tables (players are not club members) | Nothing |
| Anonymous | Nothing | Nothing |

The tables have **SELECT only** granted to `authenticated`, and RLS policies for reads. Writes go
through four `SECURITY DEFINER` functions, each of which resolves the map, checks
`has_club_role(club_id, array['owner','organizer'])`, and raises `42501` otherwise:

- `create_course_map(p_course, p_note)` → the new draft's id.
- `save_course_map_holes(p_map, p_holes jsonb)` → replaces a draft's placements in one transaction
  (refused once published; duplicate hole numbers or out-of-range positions raise `22023`).
- `record_course_map_review(p_map, p_kind, p_reviewer_name, p_decision, p_note)` → the new status, or
  a refusal explaining why the review does not fit the current state.
- `publish_course_map(p_map)` → `'published'`, after re-reading the latest decisions.

Because no direct write grants exist, an owner/organizer cannot bypass the rules from the API — the
functions are the only path. `service_role` (the owner's own console) can still write; that is the
same trust level as editing the database by hand.

## 4. The brief's safeguards, and where each one lives

| Safeguard (§5 of the brief) | Where it is enforced |
| --- | --- |
| Drafts cannot silently replace the official map | The app reads only `published`; one published per course by unique index; publishing is a separate function |
| Only authorised roles edit/approve/publish | `has_club_role(... owner, organizer)` in every function; SELECT-only grants for the desk |
| Reviews record reviewer, action, version, timestamp | `course_map_reviews` columns; reviews are append-only |
| An unapproved draft is never treated as official | `publish_course_map` refuses anything not `approved` with both confirmations |
| Rejected/superseded stay distinguishable | Their own statuses; rows are never deleted |
| Publishing is explicit | Only `publish_course_map` sets `published` |
| A failed update leaves no partial state | Every function is one transaction; `save_course_map_holes` replaces placements atomically |
| Audit trail and a recoverable previous version | Reviews table; superseded rows and their placements stay in place |
| Approval does not approve later edits | Trigger clears both confirmations and returns the map to `draft` on any placement change; published versions are immutable |
| Published map and hole details share a version | The app will read the placements **of the published row** (`course_map_holes.map_id = course_maps.id`) |

## 5. Migration, and how to apply or undo it

- File: `supabase/migrations/20261034000000_course_maps.sql` (next free number; no other open branch
  adds a migration — checked against `ci/deploy-gate`, `fix/issue-58/59/60`, `feat/issue-60-mobile-pwa`
  and `avp/demo-0.9`).
- **Additive only:** three new tables, one partial unique index, three read policies, one trigger,
  four functions. No existing table, row or policy changes.
- **Not applied.** The owner applies it, as with `help_seen`.
- Safe to re-run: `if not exists` on tables and indexes, `drop trigger if exists` before creating it,
  `create or replace` on the functions.
- After applying, check it in the SQL editor:

  ```sql
  select tablename, rowsecurity from pg_tables where tablename like 'course_map%';
  select pronounceable, cmd, roles from pg_policies where tablename like 'course_map%';
  ```

  Expect `rowsecurity = true` on all three, three SELECT policies, and no insert/update/delete policy.
  Then, over the API with a signed-in owner, `create_course_map` returns an id and `publish_course_map`
  on a fresh draft is refused with `22023`.
- Undo (only before anything is published): `drop function publish_course_map, record_course_map_review,
  save_course_map_holes, create_course_map; drop table course_map_reviews, course_map_holes,
  course_maps cascade;` — nothing else in the database references them.

## 6. Compatibility with what exists

- `courses`, `tees`, `holes`, `tournaments`, `registrations`, `groups`, `pairings_versions`: untouched,
  so tournament setup, registration, the draw, publishing and the print sheets cannot regress from this
  migration.
- **There is no scoring module yet** (only printable scorecards), so "score regression" in this phase
  means: setup saves, draw validation, publish and the printed sheets still behave. That is what the
  regression pass will check.
- The app must keep working when the migration is absent. Phase 3 will load the published map and fall
  back to the illustrated placeholder on `PGRST202`/missing-table errors, writing nothing.
- Players are not club members, so they cannot read these tables. If a player-facing map is ever wanted,
  it needs its own decision and a read function; it is not part of this phase.

## 7. Tests

`src/lib/course/map-lifecycle.test.ts` covers the rules that the UI will rely on and that the SQL
mirrors: every allowed and refused transition, "the latest decision wins", publish gating, the status
labels, and refusal of unknown input. The SQL guards themselves can only be exercised against a
database; they are written to be reviewable and are **not claimed as tested** until the migration is
applied on a scratch project and the checks in section 5 are run.

## 8. What this phase does not do

- No UI change. The Course & holes screen and the control room still read the illustration.
- No data entered; no numbering taken from either reference image.
- No `holes`/`tees` changes and **no yardage** (the schema still has no place for it; that is a
  separate decision, not a side effect of this one).
- No image storage decision: `base_image` is a reference only. Whether the published picture is bundled
  or kept in Supabase Storage is a Phase 3 question.
- No player-facing map.
- No drone or survey workflow.

## 9. Decisions to confirm before Phase 3

1. **Recording reviews:** an owner/organizer records Sir Philip's and Ma'am Mary Ann's decisions on
   their behalf, typing the reviewer's name. Neither needs an app account. Is that acceptable?
2. **`awaiting_technical`:** keep it for a future "send for review" step, or remove it and go
   `draft → awaiting_validation` directly? (The design keeps it; the function accepts either.)
3. **Base image:** bundled file for the first published version, or uploaded to Supabase Storage?
4. **Players:** should the published map ever be visible to players, or is it desk-only?
5. **Yardage:** does the club want per-hole yardage in the app? If so, which tee(s), and from which
   scorecard?

## 10. Verification requested

Before this is merged, please check:

- the lifecycle in section 1 matches how the club wants to work;
- the two reviewer names and their roles are right;
- the tables in section 2 and the write rules in section 3 are acceptable;
- nothing in section 8 is needed sooner.

When you are ready, apply the migration yourself (section 5 includes the checks), then say go and
Phase 3 wires the screen to the published map, with the illustration as the fallback.
