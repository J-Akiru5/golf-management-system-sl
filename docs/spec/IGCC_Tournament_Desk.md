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
| Maximum handicap | 30, checked on the NGAP index. An index above 30 is capped at 30: the player still registers and the draw uses 30 (confirmed 8 November 2026, issue 190). | Per tournament |
| Flights | Fixed handicap ranges, grouped by flight | Per tournament |
| Classes | Class A 0–12, Class B 13–18, Class C 19–23, Class D 24 and above, read off the NGAP record. Each class is played and awarded on its own. | Per tournament |
| Teams | One member and one guest. The pair plays as one team, and its handicap is the rounded average of both players. | Per tournament |
| Class prizes | Champion, 1st runner-up and 2nd runner-up in each class. | Per tournament |
| Team net prize | Highest Scoring Team NET: aggregate Stableford, both partners' points added on every hole, counted on the team handicap. The higher 36-hole total wins. | Per tournament |
| Team gross prize | Over-All Champion Team on gross, the pair's actual strokes with no pick-up scores. The lower total wins. | Per tournament |
| Holes | 18 by default | Per course |
| Shotgun | Max 4 players per hole, so one start holds 72 players on 18 holes. When the holes are full, the rest of the session goes off one gap later, in the same session. A class continues into the next start when the current start's holes run out, so a day uses only the start times it needs. Every playing day runs a morning and an afternoon shotgun. | Per tournament |
| Two-tee start ("barrel") | Holes 1 and 10, groups queue at an interval | Per tournament |
| Tee interval | 12 min default, editable | Per tournament |
| Scoring | Paper cards, players mark each other's card | Fixed |
| Registration | Organizer adds players from saved profiles; online signup is optional | Fixed |
| Extra fields | Organizer chooses per event (e.g. T-shirt size) | Per tournament |
| Player photo | Player sends one, or the desk takes it at on-site registration | Player profile |
| Tenancy | Built for IGCC only, data model ready for more clubs | Architecture |

**Classes, confirmed 5 November 2026.** The club runs class events: a player is placed by handicap into Class A (0–12), Class B (13–18), Class C (19–23) or Class D (24 and above), and each class is played and awarded separately. Age and gender do not decide the class; the NGAP record does.

**Class beats the tee, confirmed 5 November 2026.** A class spans the whole field regardless of tee group. One set of Class A to D is cut over every player, and the tee a player plays from (blue, white, silver, red) never splits, reorders or caps a class. A Class A can therefore hold a man on blue next to a lady on red, and the draw fills a class before it looks at tees.

The class number is the team's average handicap index, confirmed 5 November 2026: the two partners' indexes are added, divided by two and rounded, and both partners sit in that class. The owner confirmed on 6 November 2026 that the draw keeps the pair together: the two partners always play in the same group, so their cards meet on every hole. The pair number comes in with the field sheet and is read back from the entry, so a partner cannot drift into another group or be classed on their own index.

In the desk a class is a stored flight. The flights table still hangs a row off a category, so every class is kept under one carrier category; the engine matches a class by range alone and ignores the carrier, which is what lets one class hold several tee groups. Settings calls the screen Classes, and a class added there is not scoped to the category it sits under. The database used to refuse two ranges that touched inside one category; that guard matched the old model and blocked a correct class save, so migration 20261105000200 drops it. The single set is checked in the app before it is saved. The organizers also said the draw should not be held up by missing player data, since guests often never send it; a confirmed entry without an age or a class plays in an Unclassified group and is corrected later.

**Teams, confirmed 5 November 2026.** A team is one member and one guest. The team handicap is the rounded average of the two players, and that average is what puts the pair in its class. Team NET is aggregate Stableford: both partners play their own ball, each off their own handicap, and their points are added on every hole over 36 holes. The higher team total wins. The Over-All Champion Team is on gross, the pair's actual strokes with no pick-up, lowest total. The pairing and the averaged class are drawn from the pair number on the entry. The team scores (team net and team gross) are not modelled yet.

**Playing days and sessions, confirmed 6 November 2026; waves removed 7 November 2026.** Every playing day runs two shotguns, one in the morning and one in the afternoon, and each fills its own 18 holes from its own start time. A player sits on a day's list in the session the desk recorded for that day, so the morning and afternoon fields are drawn separately. There are no wave letters: a group is described by its start time and the hole it starts on. A session that still has groups after its 18 holes are full gets a second start time one gap later in the same session, so nothing is moved to another session and a day uses only the start times it needs. In the 24th Bamboo Tee the largest session is Day 3 morning with 138 players, 35 groups, which needs two start times; the lightest is Day 1 afternoon with 26 players, one start. The real gap between starts is whatever the first start's pace allows, so the desk stores a nominal 9 minutes only to have a time to print, and the afternoon starts at 12:30. Starts fill in class order, and a class that no longer fits the holes left continues into the next start, which is named in the warnings.

Known limit, 8 November 2026: migration 20261106000100 gives `save_draw` a playing day, numbers groups per day and puts the afternoon start on the event, and the desk now passes the day it is working on, so a board is stored per playing day. Two database pieces are still needed and are **written but not applied**: `20261108000500_rounds_per_playing_day.sql` creates the round every playing day needs, and `20261108000900_save_draw_requires_day.sql` refuses an unnamed save once an event has more than one round. Until they are applied, the draft is drawn and checked per day and written out as a document rather than saved into a board.

**Course handicap, confirmed 5 November 2026.** Scoring uses the course handicap, not the index. The club's printed tables are the WHS formula rounded half up, and the desk computes it from the tee's numbers rather than storing 60 rows per tee:

```
Course handicap = Index x (Slope / 113) + (Course Rating - Par)
```

At the 100% allowance these events use, the playing handicap is the same number. Tests check the computation against rows read off the printed sheets for all three tees. Ratings in play from 26 October 2026:

| Tee | Course rating | Slope | Par |
| --- | --- | --- | --- |
| Men's Blue | 69.6 | 130 | 70 |
| Men's White | 67.9 | 127 | 70 |
| Women's Red | 72.1 | 126 | 70 |

Men 70 and over play the Silver markers but use the White conversion, so Silver carries the White numbers. The committee may adjust a player's course handicap; the desk records the adjusted number against the override reason.

## Conditions of play: 24th IGCCI Bamboo Tee Invitational

Received as `bamboo-tee-Rules-of-Play.pdf` on 5 November 2026, together with the committee's own list of clarifications. These are the tournament's conditions; the settings above are how the desk expresses them.

| Item | Condition |
| --- | --- |
| Dates and place | 12–15 November 2026, Santa Barbara, Iloilo |
| Team | One IGCCI member (active, nominee or proprietary non-playing shareholder in good standing) and one guest. Member + member and guest + guest teams are not allowed. |
| Amateurs only | Professionals, touring or teaching, and active caddies cannot play. |
| Entry fee | P12,000 per two-man team. Registering on or before 15 October 2026 includes one free joker mulligan for each day. |
| Handicap source | NGAP WHS certified index. A foreign member-guest without one may use a USGA or R&A St Andrews accredited handicap. Where a player holds several, the lowest is used. |
| Handicap date | The index for 30 September 2026. |
| Handicap cap | 30. The committee may adjust a registered handicap. |
| No verifiable handicap | Zero handicap for the whole tournament. |
| Format | 36 holes of aggregate Stableford in two-man teams: both partners play their own ball, and their points are added on every hole. Net of handicap per hole. |
| Points | Double bogey or worse 0, bogey 1, par 2, birdie 3, eagle 4, albatross 5. |
| Pick-up | A player with no chance of a point must pick up, score 0 and mark an X. Two points off the day's score per breach, and a signed score above net bogey counts as a breach. |
| Classes | Team handicap is the rounded average of both players. Class A 0–12, B 13–18, C 19–23, D 24 and above, each with champion, 1st and 2nd runner-up. |
| Prizes | Highest Scoring Team NET, and Over-All Champion Team on gross with no pick-up scores. |
| Ties | Countback on the final round cards: net team points over holes 16, 17 and 18, then holes 13, 14 and 15, then a drawing of lots. |
| Tees | Blue for men under 60, white for men 60 and above, silver for men 70 and above, red for ladies. Handicaps are adjusted by the IGCCI and WHS tee computation. |
| Start times | Thursday to Saturday: shotgun at 6:30 AM and 12:30 PM. Sunday: 6:30 AM and 11:30 AM. |
| Schedules | Thu AM–Sat PM, Thu PM–Sat AM, Fri AM–Sun PM, Fri PM–Sun AM. A team's schedule is final once chosen; only the committee changes it, and the committee assigns holes and flightmates by division. |
| Field | At most 200 teams (400 players). A slot is confirmed on payment, first paid first served. Registration closes on 22 October 2026. |
| Play | R&A Rules of Golf and local rules. The triangular area left of the Hole 1 drive is a no-play zone: one penalty shot, then a drop in the designated area. Changing balls on the green is not allowed. |
| Mulligans | One front and one back for two days at P1,000; a joker mulligan for two days at P500, usable anywhere except the putting green. At most three a day. Declared to the marker before the shot and marked M. No provisional mulligan, none on the green, and a hole in one made with one does not win the hole-in-one prize. |
| Gimme | 24 inches. |
| Cards | Marked by the other team in the flight, or by a marshal if that team withdraws; signed by player and marker; handed in within 15 minutes of holing out. Players score, never caddies, and only with the committee's official pen. |
| Pace and lateness | 40 seconds a shot. A group with an open hole ahead is warned, then loses 2 points or scores zero on the open holes. A late team joins if the other team has not played its second shot, otherwise it starts on the next hole with X and zero on the unplayed holes. |
| Weather | The tournament director suspends and resumes play. Only completed rounds count; one complete round is enough to declare results, and the highest points in that round wins. |
| Hole in one | Subject to the sponsor's conditions, with at least three witnesses from the same flight including the player. The prize is split if there is more than one. |

Not modelled yet: teams as a stored pair, aggregate team scoring, mulligans, the pick-up penalty and the countback. The desk scores individual players and pairs teams by hand, which the owner chose on 5 November 2026.

### Scoring as worked on the card, confirmed 12 November 2026

On Day 1 the owner checked the desk's calculation against a marked paper card and the printed rules sheet. The card was Oscar Yatco's, Day 1 AM, White tee, HDCP 18: 13 points out, 16 in, 29 for the round, and the desk's numbers matched hole by hole. This is how a card is scored:

| Step | Rule | Source |
| --- | --- | --- |
| Handicap | The number in the card's HDCP box is the playing handicap. | Owner, 12 Nov 2026 |
| Decimal in the HDCP box | The decimal is dropped: 16.7 plays off 16. See the open point below. | Owner, 12 Nov 2026 |
| No HDCP on the card | No net score. The player is listed unranked until the desk enters the handicap. Nothing is assumed. | Owner, 12 Nov 2026 |
| Strokes per hole | One stroke on every hole for each full 18 of handicap, then one more on the hardest holes in the order of the card's HANDICAP row. 18 gets one on every hole, 19 gets a second on hole 8, 36 gets two on every hole. | Printed card; worked card |
| Net score | Strokes written, minus the strokes received on that hole. | Worked card |
| Points | Net double bogey or worse 0, net bogey 1, net par 2, net birdie 3, net eagle 4, net albatross 5. | Rules sheet |
| X | A pick-up. 0 points for the hole. The points row on the paper card is left blank under an X. | Rules sheet; worked card |
| Mulligan and Joker stamps | They do not change the points. The score written on the card is scored as it stands. | Owner, 12 Nov 2026 |
| Ties | Team level, on the final round cards: net team points over holes 16, 17 and 18, then 13, 14 and 15, then a drawing of lots. Read again from the printed rules sheet; it is the same rule as the Ties row above. | Rules sheet, 12 Nov 2026 |

The HANDICAP row printed on the club card (1 is the hardest hole). Men's par and ladies' par are the same on every hole:

| Hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | Out | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | In | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Par | 4 | 4 | 4 | 5 | 3 | 4 | 4 | 4 | 4 | 36 | 3 | 4 | 4 | 3 | 5 | 4 | 3 | 4 | 4 | 34 | 70 |
| Handicap | 5 | 3 | 7 | 9 | 17 | 15 | 11 | 1 | 13 | | 14 | 6 | 12 | 16 | 2 | 4 | 18 | 8 | 10 | | |

These numbers were read from a photo of one printed card on 12 November 2026. Check them against the card itself before they are entered as the event's course data.

**Open point: a decimal in the HDCP box.** "Course handicap, confirmed 5 November 2026" above says scoring uses the course handicap worked from the index with the tee's rating and slope. A decimal in the HDCP box (16.7, 18.9) looks like an index that was not converted. Dropping the decimal and converting do not always agree: 16.7 on White is 16 dropped and 17 converted; 18.9 on Blue is 18 dropped and 21 converted. Whole numbers on the cards look already converted (34 on Blue and 36 on Red are the capped index of 30 on those tees), so they are not affected. The Day 1 AM draft sheet drops the decimal, as the owner said on 12 November. Four Day 1 AM cards carry a decimal. The organizer should say which rule stands before a result is declared.

**Day 1 working sheet.** Until transcribed cards can be imported, Day 1 AM is scored on a standalone page outside the app, generated from the transcription file. It scores each player with the steps above and ranks individuals by net points. It does not add the two partners together, does not apply the two-point pick-up penalty, and does not break ties. It is a draft for the desk, not a published result.

## How auto-routing works

Every registration passes through the same steps. Each step writes its result onto the registration, so the organizer can see why a player landed where they did and override any step.

1. **Add player.** Search the player directory, tap to add. New players are created with name, birthdate, gender, NGAP ID and a photo, either uploaded or taken at the desk.
2. **Freeze the index.** Take the player's latest NGAP index on or before the tournament cut-off date and copy it onto the registration.
3. **Assign category.** Age on tournament day plus gender: Regular, Senior (60–69), Super Senior (70+), Ladies.
4. **Assign tee.** Each category maps to one tee marker. Super Senior plays Silver.
5. **Compute course handicap.** Uses that tee's Course Rating, Slope and Par, at 100% allowance.
6. **Check eligibility.** An NGAP index above 30 is capped at 30 for the draw. The player is not blocked, the index on file is kept, and the desk shows which number was used.
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

All groups at one start tee off at the same time on different holes. With 4 players per hole on 18 holes, one start holds 72 players. Groups fill the holes in flight order. When the next flight will not fit in what is left of the current start, the whole flight moves to the next start, which tees off from hole 1 again one gap later.

```text
Next start = this start + gap
Example: 7:00 AM + 5 h = 12:00 PM
```

| Hole | Flight | | Hole | Flight |
| --- | --- | --- | --- | --- |
| 1 | Flt A | | 1 | Flt C |
| 2 | Flt A | | 2 | Flt D |
| 3 | Flt A | | 3 | Flt D |
| … | | | … | |
| 18 | Flt C | | | |

Keeping flights whole can leave a few holes empty at a start; the organizer can fill them by hand. A flight larger than 72 players cannot fit in one start, so only then does the router split it, and it flags the split.

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
6. **Where should player photos appear?** Answered by the owner on 22 Oct 2026: a small photo may appear beside the player's name on the flight schedule/start sheet, public pairings and the public leaderboard. Internal consent covers desk use. A separate public-display consent is required before any photo is copied to the public bucket; existing internal consent does not become public consent automatically.
7. **What results does the organizer need?** Gross and net winners per flight, and the tie-break rule (e.g. back 9, back 6, back 3, last hole). Needed only for Phase 2.

## Data model

Every table carries `club_id` with row-level security from day one. Adding it now costs little. Retrofitting it after IGCC data exists is a migration on every table.

| Table | Holds |
| --- | --- |
| clubs | Tenant. IGCC is the only row at launch. |
| courses | Course name, number of holes |
| tees | Marker name/colour, Course Rating, Slope, Par, gender |
| holes | Hole number, par, stroke index (for printing handicap dots on cards) |
| players | Name, birthdate, gender, NGAP ID, contact, photo, internal photo consent date, separate public-display consent date and public copy path |
| handicap_records | Player, index, effective date, source (NGAP export upload or manual fix) |
| tournaments | Date, course, cut-off date, start format, interval, first tee time, gap between start times, max handicap, allowance |
| categories | Tournament, name, gender, age range, tee |
| flights | Class: name and handicap range, spanning the whole field. A carrier category is still required by the table, but the class is not scoped to it. |
| registration_fields | Extra questions per tournament, e.g. T-shirt size |
| registrations | Player, frozen index, category, tee, course handicap, flight, payment status, extra answers, overrides |
| groups | Flight, start hole, tee time, locked flag |
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
- **Privacy.** Photos, birthdates and contact details are personal data under the Data Privacy Act of 2012. The desk records internal photo consent before taking a photo. A second, separate public-display consent is required before a copy goes to the public bucket or appears on public pairings, the leaderboard or printed start sheets. The private original stays in private storage. Withdrawal removes the public copy.
- **Scope.** Auto-routing proposes, the organizer approves. Tournament-day changes (late withdrawals, sponsor groups) will always happen, so overrides are a core feature, not an extra.

---

Syntaxure Labs · Prepared for the IGCC tournament organizer · Rules above reflect the organizer's answers of 17 Oct 2026; open questions are marked in yellow (in the HTML version).
