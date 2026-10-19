# Course map: the two references, what they disagree about, and how to confirm a layout

This is the Phase 1 document for the verified course-mapping work. It exists so that a layout can be
confirmed by people, not guessed by software.

Two people are named in this workflow:

- **Sir Philip** — technical confirmation: the intended hole numbering and where each hole actually
  is (tee, fairway, green, and the direction of play).
- **Ma'am Mary Ann** — validation coordination: gathering the confirmation, chasing what is
  unresolved, and recording that the agreed version is the one to publish.

**Neither reference below is authoritative.** A numbered marker on either image is not evidence that
it identifies the right hole. Until a layout is confirmed through this document and published by an
owner or organizer, the app keeps showing the illustrated placeholder it shows today, and no
numbering from either image is used anywhere in the app.

## 1. The two references

Both files were supplied by Jeff on 19 Oct 2026 from Facebook/Messenger downloads. Neither carries an
author, a capture date or a version stamp.

| | Reference A | Reference B |
| --- | --- | --- |
| In this repository | `docs/course-map/reference-a-gold-markers.jpg` | `docs/course-map/reference-b-teal-markers.jpg` |
| Original filename | `851751884_1440320888075515_2119629108948800056_n.jpg` | `853474443_1666072081528129_7753660052247926246_n.jpg` |
| Saved on this machine | 19 Oct 2026, 22:42 | 19 Oct 2026, 22:42 |
| Size | 437,123 bytes | 358,633 bytes |
| Pixels | 1261 × 1247 | 1261 × 1247 |
| SHA-256 | `8C6398E813203286B5714C0FB5626AF4808BD3C09816233E77EE30FA1E97DB44` | `D37E43272ED5FAC53E67FCA6A49B1B88E64B6281F1ABE9F1971B64DE357CBC8C` |
| Markers | Gold circles, dark numbers | Teal circles, white numbers |

The two files share the **same base picture**: the same crest, the same compass, the same 0–500 m
scale bar, the same "Clubhouse" label, the same ponds, roads and tree lines. Only the hole-number
markers differ. So the disagreement is about **numbering** — which hole is which — and not about the
underlying image.

## 2. What each layout appears to say

This table is a **draft reading by an agent** working from the two images, region by region. It is
not a survey and it is not confirmation. Its only purpose is to tell Sir Philip where the two images
disagree so he can mark the right answer. Where the reading is uncertain it says so.

| Hole | Reference A (gold) | Reference B (teal) | Agree? |
| --- | --- | --- | --- |
| 1 | East–centre, on the fairway immediately left of the "Clubhouse" label | Centre, south of the middle of the course | **No** |
| 2 | North-east, close to Bantud–Dungon Road, right of 3 | South-east fairway, right of 3 | **No** |
| 3 | North-east, left of 2 | South-centre, by the bottom ponds | **No** |
| 4 | North, right of centre | South-west, on the long fairway running to the bottom-left | **No** |
| 5 | North-centre | Centre-west (small marker, near 16) | **No** |
| 6 | North-west, below 7 | West, below 7 | **No** |
| 7 | North-west, the highest marker of that group | Centre-west, above 6 | **No** |
| 8 | West-centre | North-west, where A has 7 | **No** |
| 9 | Centre, below-right of 8 | North-centre, where A has 4 | **No** |
| 10 | West, below 8 | East, beside the clubhouse buildings (uncertain: 10 and 11 are close) | **No** |
| 11 | South-west, on the long fairway to the bottom-left corner | East–centre, above/left of the "Clubhouse" label (uncertain, see 10) | **No** |
| 12 | Centre-west, below 9 | East, below the clubhouse | **No** |
| 13 | Centre, above 14 | Far east, below 12 | **No** |
| 14 | Centre-south, in the wide fairway | North, right of centre | **No** |
| 15 | South-east of 14 | North-centre | **No** |
| 16 | East, near Santa Barbara Road | Centre-west (small marker, near 5) | **No** |
| 17 | East, below the clubhouse | North-west, below 8 | **No** |
| 18 | East, below 17 | North, right of centre, below 14 | **No** |

Put plainly: the two images agree on the shape of the course and on nothing else about the numbers.
They do not disagree on a handful of holes that can be patched — the numbering is arranged
differently across the whole course. The loop implied by A runs from the clubhouse out to the
north-east, up and around the north-west, down the west side, along the south, and back up the east.
The loop implied by B starts elsewhere and rotates the numbers around the same picture.

## 3. What must be confirmed before any layout is called official

1. **Hole numbering**, hole by hole, and which marker (if either) points at the right hole.
2. **Where each hole is** — tee, fairway and green — and the **direction of play**. Neither image
   marks tees and greens distinctly; a circle sits on the playing area, so the direction has to come
   from the club, not from the picture.
3. **Par and stroke index per hole, from the club scorecard.** Neither image carries these numbers,
   and they must not be read off a picture.
4. **Yardage**, if it is to be shown. The application has **no yardage column at all** today (see
   `supabase/migrations/20261017000000_init.sql`: `holes` stores `number`, `par`, `stroke_index`;
   `tees` stores name, rating, slope and one par). Adding yardage is a Phase 2 schema decision, not a
   data-entry task.
5. **Whether either image may be used in the app at all** (it is club material; permission and
   ownership should be recorded before it becomes a base layer).
6. **That the tees, rating and slope already entered in Settings match the same scorecard.** A
   mismatch there is a defect worth catching in the same review: the print sheets use those numbers
   to work out playing handicaps.

## 4. Checklist for Sir Philip

Fill this in from the course itself and the scorecard. If neither reference is right, mark the
correct positions on a printout of whichever image is clearer and say so in "Correct location" —
please do not guess from the table in section 2.

| # | Correct location (describe, or mark on a printout) | Direction tee → green confirmed | Par | Stroke index | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |
| 11 | | | | | |
| 12 | | | | | |
| 13 | | | | | |
| 14 | | | | | |
| 15 | | | | | |
| 16 | | | | | |
| 17 | | | | | |
| 18 | | | | | |

Answered separately:

- [ ] Which reference is closer to the truth, A (gold) or B (teal), or neither? ______
- [ ] Is hole 1 the hole that starts at the clubhouse? ______
- [ ] Does the course play as one 18-hole loop, or as two nines with a different split? ______
- [ ] Anything else a visitor would get wrong if the app showed it? ______

Reviewed by: ______________________  Date: ____________

## 5. Validation workflow for Ma'am Mary Ann

1. **Collect** Sir Philip's completed checklist (section 4) and keep it with this document.
2. **Log what is still unresolved** in section 6, with who it is waiting on.
3. **Check par, stroke index and yardage against the club scorecard** — these come from the
   scorecard, never from either image.
4. **Record the decision**: who confirmed what, and when. Once the Phase 2 work lands, this becomes
   a review record attached to a specific version of the map so the app can show it and refuse to
   publish without it. Until then, this document is the record.
5. **Hand the agreed layout to the organizer** so an owner or organizer can publish it in the app.
   Publication is a separate, explicit action; confirmation alone does not publish anything.
6. **Nothing is published until both** Sir Philip's technical confirmation **and** this validation
   are recorded for the version being published.

Who can do what in the app today: an owner or organizer can edit Settings and can tick "these tees
and holes match the club scorecard"; the desk role cannot; players only ever see published pairings.
Sir Philip and Ma'am Mary Ann do not need app accounts — their confirmation is recorded by the owner
on the record described in step 4.

## 6. Open questions

| # | Question | Owner | Status |
| --- | --- | --- | --- |
| 1 | Which numbering is correct — A, B, or neither — and where is each hole actually? | Sir Philip | Open |
| 2 | Is hole 1 the clubhouse start, and is the course one loop or two nines? | Club | Open |
| 3 | Who made each image, when, and from what? (no author or date is recorded) | Club | Open |
| 4 | May the club's illustration be used as the app's base layer, and shown to players? | Club | Open |
| 5 | Scorecard par, stroke index (and yardage, if it is to be shown) for the course and each tee | Club | Open |
| 6 | Do the tees, rating and slope already in Settings match that scorecard? | Jeff | Open (checkable in Settings today) |
| 7 | Drone imagery or a new aerial survey | Club | Deferred — needs permissions, airspace and a settled base map first |

## 7. What the app does meanwhile

Nothing changes until a layout is confirmed and published. The control room and the Course & holes
screen keep using the illustrated placeholder (`src/lib/course/layout.ts`, flagged in code as
`COURSE_IS_PLACEHOLDER = true`), the printed sheets keep carrying the placeholder watermark until the
course data is confirmed in Settings, and no numbering from either reference is shown to the desk or
to players. The next phase — the approval and versioning design, and the map extension itself — is
described in the treatment plan and is not started.
