# IGCC Tournament Desk

> **Build spec v1 · Iloilo Golf & Country Club**
> Prepared by Syntaxure Labs · 17 Oct 2026 · Stack: Next.js · Supabase · Vercel
>
> This is the spec as sent to the organizer. Wording is unchanged; only the Markdown layout was
> repaired (the original was converted from HTML). The "marked in yellow" note at the end refers
> to the HTML version. For current status and decisions made since, read [`../PLAN.md`](../PLAN.md).

One tool for the organizer: add players in a tap, and the system routes each one to a category, tee, flight, group and start slot. The organizer reviews, adjusts, then prints pairings and scorecards.

## Confirmed rules

Answers from the organizer, 17 Oct 2026. These go into the system as tournament settings, not hard-coded values, so the next event can change them.

| Rule | Value | Setting type |
| --- | --- | --- |
| Handicap source | Imported from the NGAP export table the club provides. The system does not compute the official index. | Club-wide |
| Index method | WHS: average of best 8 of last 20 differentials | Reference only |
| Handicap allowance | 100% | Per tournament |
| Index cut-off date | Set per tournament. The index on that date is frozen for the event. | Per tournament |
| Senior | 60+ | Per tournament |
| Super Senior | 70+, Silver tee | Per tournament |
| Ladies | Own category and own tees | Per tournament |
| Maximum handicap | 30, checked on the NGAP index. Above 30 cannot register. | Per tournament |
| Flights | Fixed handicap ranges, grouped by flight | Per tournament |
| Holes | 18 by default | Per course |
| Shotgun | Max 4 players per hole. When all 18 holes are full, a second wave starts a set gap after wave 1 (1A = wave 1, 1B = wave 2). A flight is never split across waves. | Per tournament |
| Two-tee start ("barrel") | Holes 1 and 10, groups queue at an interval | Per tournament |
| Tee interval | 12 min default, editable | Per tournament |
| Scoring | Paper cards, players mark each other's card | Fixed |
| Registration | Organizer adds players from saved profiles; online signup is optional | Fixed |
| Extra fields | Organizer chooses per event (e.g. T-shirt size) | Per tournament |
| Player photo | Player sends one, or the desk takes it at on-site registration | Player profile |
| Tenancy | Built for IGCC only, data model ready for more clubs | Architecture |

## How auto-routing works

Every registration passes through the same steps. Each step writes its result onto the registration, so the organizer can see why a player landed where they did and override any step.

1. **Add player.** Search the player directory, tap to add. New players are created with name, birthdate, gender, NGAP ID and a photo, either uploaded or taken at the desk.
2. **Freeze the index.** Take the player's latest NGAP index on or before the tournament cut-off date and copy it onto the registration.
3. **Assign category.** Age on tournament day plus gender: Regular, Senior (60–69), Super Senior (70+), Ladies.
4. **Assign tee.** Each category maps to one tee marker. Super Senior plays Silver.
5. **Compute course handicap.** Uses that tee's Course Rating, Slope and Par, at 100% allowance.
6. **Check eligibility.** An NGAP index above 30 blocks registration, and the desk shows the reason.
7. **Assign flight.** Match the handicap to the category's fixed ranges, e.g. A, B, C.
8. **Form groups.** Fill groups of four inside each flight.
9. **Assign start.** Shotgun hole and set, or two-tee start time.
10. **Organizer review.** Drag players between groups, lock a group, then publish. Re-running the router never moves a locked group.

### Worked example

The tee ratings below are placeholders. Real IGCC Course Rating and Slope per tee are needed before launch.

```text
Player            male, age 63, NGAP index 14.2
Category          Senior (60–69)
Tee               Senior tee: Course Rating 70.1, Slope 125, Par 72
Course handicap   = Index × (Slope ÷ 113) + (Course Rating − Par)
                  = 14.2 × (125 ÷ 113) + (70.1 − 72)
                  = 15.71 − 1.90 = 13.81  → rounds to 14
Allowance 100%    → playing handicap 14
Flight            B (example range 11–18)
```

## Start formats

### Shotgun

All groups in a wave start at the same time on different holes. With 4 players per hole on 18 holes, one wave holds 72 players. Groups fill hole 1 to 18 in flight order. When the next flight will not fit in what is left of wave 1, the whole flight moves to wave 2, which tees off from hole 1 again (1B, 2B…).

```text
Wave 2 start = wave 1 start + gap
Example: 7:00 AM + 5 h = 12:00 PM
```

| Wave 1 (green) | Flight | | Wave 2 (yellow) | Flight |
| --- | --- | --- | --- | --- |
| 1A | Flt A | | 1B | Flt C |
| 2A | Flt A | | 2B | Flt D |
| 3A | Flt A | | 3B | Flt D |
| … | | | … | |
| 18A | Flt C | | | |

Keeping flights whole can leave a few wave 1 holes empty; the organizer can fill them by hand. A flight larger than 72 players cannot fit in one wave, so only then does the router split it, and it flags the split.

### Two-tee start

Groups go off holes 1 and 10 together, one pair every interval.

```text
Slot n start = first tee time + floor(n ÷ 2) × interval
Tee = hole 1 if n is even, hole 10 if n is odd
```

Groups from hole 1 eventually reach hole 10. If a nine takes about 2 hours, a 12-minute interval allows about 10 groups per tee (40 players each side, 80 total) before the first groups cross over. The 2-hour figure is an assumption; the organizer should confirm IGCC's real pace of play.

## Questions still open

These change how the router behaves. Each one has a default so building can start, but the organizer should confirm.

1. **Send us a sample NGAP export.** The importer is built around its real columns: player name, NGAP ID, index, date. A sample file with a few rows is enough.
2. **Are flight ranges set on index or course handicap?** The 30 limit uses the NGAP index, so flights on index would keep one number for everything. Default: index.
3. **Which tees do Regular, Senior and Ladies play?** Only Super Senior = Silver is confirmed. Do Ladies have a senior split?
4. **What happens when a flight does not divide by 4?** Example: 14 players in Flight B. Options: three groups of 4 and one of 2, or two groups of 4 and two of 3. Default: avoid groups smaller than 3.
5. **How are players ordered inside a flight?** Random, by handicap, or by organizer choice. Default: by handicap, so similar players play together.
6. **Where should player photos appear?** Default: registration desk and organizer screens only, for checking identity. Not on the public pairings page.
7. **What results does the organizer need?** Gross and net winners per flight, and the tie-break rule (e.g. back 9, back 6, back 3, last hole). Needed only for Phase 2.

## Data model

Every table carries `club_id` with row-level security from day one. Adding it now costs little. Retrofitting it after IGCC data exists is a migration on every table.

| Table | Holds |
| --- | --- |
| clubs | Tenant. IGCC is the only row at launch. |
| courses | Course name, number of holes |
| tees | Marker name/colour, Course Rating, Slope, Par, gender |
| holes | Hole number, par, stroke index (for printing handicap dots on cards) |
| players | Name, birthdate, gender, NGAP ID, contact, photo, photo consent date |
| handicap_records | Player, index, effective date, source (NGAP export upload or manual fix) |
| tournaments | Date, course, cut-off date, start format, interval, first tee time, wave gap, max handicap, allowance |
| categories | Tournament, name, gender, age range, tee |
| flights | Category, name, handicap range |
| registration_fields | Extra questions per tournament, e.g. T-shirt size |
| registrations | Player, frozen index, category, tee, course handicap, flight, payment status, extra answers, overrides |
| groups | Flight, start hole, wave (A/B) or tee time, locked flag |
| group_members | Group, registration, position |
| scores | Registration, hole, strokes, encoded by, checked (Phase 2) |

## Screens

### Organizer

- Player directory with NGAP upload
- Course and tee setup
- Tournament setup wizard
- Registration desk: search, tap to add, copy list from a past event
- Photo at the desk: take it with the tablet or phone camera, or upload one the player sent
- Pairings board: drag, lock, re-run
- Print: start sheet, pairings, scorecards with handicap dots
- Score encoding and results (Phase 2)

### Players

- Public pairings page: find your name, see hole or tee time
- Large text and buttons, readable on an older phone
- No login needed to view pairings
- Self-registration later, if the club wants it

## Build phases

**Phase 1 · first IGCC event**

- Player profiles with photo, NGAP export upload
- Courses and tees
- Tournament setup
- Organizer registration
- Auto-routing with manual override
- Printouts and public pairings page

**Phase 2 · results**

- Score encoding from paper cards
- Gross and net per flight, tie-breaks
- Results export

**Phase 3 · growth**

- Player self-registration and online payment
- SMS or Messenger notices
- Onboarding a second club

**Not planned**

- Computing an official WHS index
- Live mobile scoring
- Posting scores back to NGAP

## Risks to settle before building

- **Data.** The router is only as correct as the tee data. IGCC's Course Rating, Slope, Par and stroke index for every tee must be entered and checked against the club scorecard before the first event.
- **Process.** The NGAP export is confirmed, but each upload is only as fresh as the file. Someone must upload a new export before every tournament cut-off, or players register on old indexes.
- **Privacy.** Photos, birthdates and contact details are personal data under the Data Privacy Act of 2012. The desk needs a short consent line before taking a photo, photos stay in private storage, and the public pairings page shows names only.
- **Scope.** Auto-routing proposes, the organizer approves. Tournament-day changes (late withdrawals, sponsor groups) will always happen, so overrides are a core feature, not an extra.

---

Syntaxure Labs · Prepared for the IGCC tournament organizer · Rules above reflect the organizer's answers of 17 Oct 2026; open questions are marked in yellow (in the HTML version).
