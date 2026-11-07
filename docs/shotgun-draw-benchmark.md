# Shotgun draw benchmark: how golf systems schedule a shotgun, and what to call it

Research for the staff app and the draw board, 7 November 2026.

The question was how real tournament systems handle scheduling for a shotgun draw, and what the
correct names are for each piece. I read vendor help pages, the Rules of Golf and the R&A
pace-of-play manual. Where a system does not document a behaviour, the tables say so instead of
guessing.

## The short version

- The basic shape is the same everywhere: one starting time, one group on every hole. Golf Genius
  takes exactly three inputs, the starting time, the starting hole and the groups per hole.
- The systems divide on what to do when there are more groups than holes. Golf Genius either puts a
  second group on the same hole (A and B, "B holes", ordered by Shotgun Priority) or splits the
  field across two start times a few minutes apart, which it calls a modified shotgun.
- This project can only do the second, because `shotgunKey` makes a time and a hole unique. That is
  a design decision, not an oversight.
- The confirmed rule, a second start 9 minutes later in the same session, is a modified shotgun in
  Golf Genius' sense. The shipped default of 300 minutes is not. Five hours apart is a second
  shotgun, which the industry calls a double shotgun. The setup form cannot accept 300 either,
  because its maximum is 240. One setting carries three different numbers.
- "Wave" means a block of the day, morning or afternoon, never a letter on each group. Golf Genius
  uses A and B for two groups sharing a hole. Removing wave letters was right, and A/B should not
  come back unless holes are doubled.
- "Foursome" in the Rules of Golf is alternate shot, two partners playing one ball. It is not a
  group of four. Golf Genius uses the word loosely in its own screens.
- "Flight" is the skill bracket. "Division" is the competition group. Our class is the flight. Our
  category is closer to a division. The two words are not interchangeable.
- "Draw" is the act of selecting. The printed result is a tee sheet, start sheet, or pairings and
  starting times. Our draw board and published pairings already match that split.

## 1. How each system runs a shotgun

### Golf Genius

Set Shotgun takes the starting time, the starting hole, and how many groups go on each hole. Every
pairing group tees off at that one time on its own hole. Two extras sit on top:

- **Shotgun Priority.** When there are more pairing groups than holes, the second group on a hole
  goes on a "B hole", and Shotgun Priority sets the order in which those B holes are handed out.
  The glossary defines it exactly that way.
- **Reverse shotgun.** Instead of filling holes 1 to 18, the order runs 1, 18, 17 and down, so the
  first tee clears before the field comes back to it.

Golf Genius also supports a **modified shotgun**, where half the field starts at one time and half
at another, for example 12:00 and 12:30. Its **wave pairings** are for a second round or a second
course on the same day. That is a different thing from a second start time on the same course.

Its vocabulary needs care. The glossary uses "Groups" for an optional side competition such as
skins, not for the players who tee off together. The players are a "pairing group". The same
glossary then uses "foursome" for that pairing group in the GGID and report composer entries. The
vendor is not consistent, so copying its labels would carry the confusion into our screens.

### BlueGolf

The "Pairings & Starting Times" card sets pairings by flight, division, ABCD, random, index or
team, then sets a start by starting time, shotgun or reverse shotgun. A flight is set per
tournament and does not carry across the season. The tournament director app shows each player's
starting time and hole on the player card, which is the same information our staff sheet shows.

### GolfStatus

Hole assignments is a single function that assigns team pairings and starting holes, aimed at
charity and club events. Check-in runs from the same roster. The vendor names paper lists as the
problem it replaces, which is the same argument for the staff app.

### R&A and the Rules of Golf

The R&A pace-of-play manual separates two formats:

- **Two-tee start.** Groups go off the 1st and 10th in turn, at intervals of about 8 to 10 minutes.
  The groups are not simultaneous.
- **Shotgun start.** Groups start simultaneously from many tees.

Both are used to run a morning and an afternoon wave on one course, which is the shape of our
playing day. The manual also gives the 8 to 10 minute interval for two-tee starts, a useful
sanity check on our own interval setting.

Rule 22 defines foursomes as two partners playing one ball alternately. A group of four players is
not a foursome in the Rules, however often the word is used that way at the club.

## 2. When the field is bigger than the holes

18 holes at 4 players is 72 players, or 18 groups, in one shotgun. Above that the systems choose
one of three mechanics.

| Mechanic | What happens | Where it is documented | In this project |
| --- | --- | --- | --- |
| Doubled holes (A/B) | Two groups share a hole at the same start time. Golf Genius labels them A and B and orders the B holes with Shotgun Priority. | Golf Genius Set Shotgun, Shotgun Priority, glossary | Not possible: `shotgunKey` is time plus hole, so one slot holds one group |
| Modified shotgun | The field splits across two start times minutes apart, same course, same session. Golf Genius example: 12:00 and 12:30. | Golf Genius Set Shotgun | This is the confirmed rule: a second start 9 minutes later |
| Double shotgun | Two shotguns in one day, morning and afternoon, each a field off the holes. | Golf Monthly, bunkered, and every club that runs a 36-hole day | The shipped 300-minute default produces this, and so does the separate afternoon session |

The distinction matters because the three have different costs. Doubling holes keeps one printed
time for everyone and uses every hole, but two groups wait on the same tee and a starter has to
explain A and B. A modified shotgun gives every group its own time and hole, so nothing needs
explaining, at the cost of a second time on the sheet and one empty hole at the later start. A
double shotgun is a different day plan, not a way to fit one field onto one course.

Our 9-minute rule is the modified shotgun, and it does what A/B does without the A/B label. The
spec's example, Day 3 morning with 35 groups, becomes 18 groups at 6:30 on holes 1 to 18 and 17
groups at 6:39 on holes 1 to 17. Every player still has one time and one hole, and hole 18 at 6:39
is empty. No one has to be told whether they are the A or the B group.

## 3. Terminology

| Term | What it means in the systems | In this project | Note |
| --- | --- | --- | --- |
| Shotgun start | All groups tee off at one time, each on a different hole | A start time with a group on each hole | Correct, already used |
| Starting time | The single time of that shotgun | `Group.time` | "Tee off" on the staff sheet is fine. "Tee time" alone suggests rolling starts |
| Starting hole | The hole a group starts on | `Group.startHole` | Correct |
| Modified shotgun | Field split across two start times minutes apart | The confirmed 9-minute second start | Use this name in docs. Do not call it a wave |
| Double shotgun | Two shotguns in one day | Morning and afternoon sessions, and the 300-minute default | The default is not a modified shotgun |
| Reverse shotgun | Fill hole 1 first, then 18, 17 and down, so the first tee clears | Not implemented. Holes fill in order, or by a seeded shuffle | Cheap option if the club wants it |
| Shotgun priority, B hole | Order for the second group on a doubled hole | No equivalent, because holes are never doubled | Only needed if A/B is added |
| Wave | A block of the day, or a second round's pairings | The AM/PM session | Staff copy says "Session", which is not a golf word. "AM shotgun" is clearer |
| Two-tee start | Groups alternate off the 1st and 10th at intervals | `startFormat: "two_tee"` | Different from a shotgun. Keep the names apart |
| Pairing group | Golf Genius' name for the players who play together | `Group` | Fine. Do not copy Golf Genius' "Groups" label |
| Foursome | Rule 22: two partners, one ball, alternate shot | A group holds up to 4 players | Avoid in the UI. Say group |
| Flight | Skill bracket, set per tournament. Golf Genius divisions contain flights | Class A to D (`flightId`) | Print "Flight A" beside the club's "Class A" |
| Division | Competition group across a season (BlueGolf), or a container of flights (Golf Genius) | Category: Regular, Senior, Super Senior, Ladies | A different axis from class. The UI must not blur them |
| Draw | The selection of pairings and holes | The live board | Correct |
| Tee sheet, start sheet | The printed list of groups with time and hole | `/staff/schedule` and the published pairings | BlueGolf calls it "Pairings & Starting Times" |
| Group number | Golf Genius numbers groups per round | Numbered per playing day | A four-day print repeats group 1, so label the day |

## 4. Where this project sits, and one setting with three values

The engine names a group by its start time and hole. `shotgunKey(time, hole)` is the slot
identity, so two groups can never share a hole at the same time. That is what rules out Golf
Genius' A/B doubling and what makes a second start the only way to fit a large session. The spec
records the choice: waves were removed on 7 November 2026 and a group is only its time and hole.

The gap between those starts is where the plan and the code disagree.

| Source | Value | Effect |
| --- | --- | --- |
| Spec, confirmed 6 November | 9 minutes nominal, afternoon at 12:30 | Modified shotgun |
| Demo config and database default | 300 minutes | A second shotgun 5 hours later |
| Setup form, "Minutes between start times" | Maximum 240 | The 300 default cannot be entered or reproduced |
| Spec start-format example | "7:00 AM + 5 h = 12:00 PM" | Describes the 300 default, not the 9-minute rule |

The routing code passes `config.waveGapMinutes` straight to `planShotgunFrom`, so the configured
value is what the draw uses. A 138-player morning under the demo config becomes 72 players at 6:30
and 66 at 11:30, which is not a modified shotgun, and 11:30 sits in the same part of the day as the
afternoon session that starts at 12:30. The spec sentence is explicit that the desk stores 9
minutes only so there is a time to print, and that the real gap is whatever the first start's pace
allows. The 300 default and the 240 form cap both contradict it.

This is a rule and default change, so it needs the owner's decision. This document does not change
it.

Two smaller naming points:

- The staff app says "Session" where golfers say wave or shotgun. "AM shotgun" and "PM shotgun" are
  concrete, short, and match what the player was told at registration. This is copy only.
- `waveGapMinutes` and `wave_gap_minutes` keep the old wave name. Renaming touches the schema and
  the setup payload, so it should wait for the same decision as the value.

## 5. What I would keep, and what I would change

Keep the time-and-hole identity, the absence of wave letters, the session split, and the 9-minute
stagger. The stagger is a recognised modified shotgun and it avoids the A/B explanation.

Copy changes, no schema:

1. Call the second start a modified shotgun in docs, and stop implying it is a wave.
2. Call the AM and PM shotguns "shotgun" on staff screens rather than "session".
3. Print "Flight A" next to the club's "Class A" so a player recognises the bracket.
4. Never say foursome for a group of four.

Ask the owner before changing:

1. The gap value and its default, which is currently three different numbers in one repository.
2. Whether IGCC wants doubled holes at all. The largest session on the 24th Bamboo Tee is 35 groups,
   which the staggered second start already handles. Doubling would only matter if the club wanted
   one printed time for the whole field.
3. Whether to add reverse shotgun, so hole 1 clears first.

## Sources

All links read on 7 November 2026.

**Golf Genius**

- Setting a Shotgun: https://docs.golfgenius.com/en/articles/10778278-setting-a-shotgun
- Shotgun Priority: https://docs.golfgenius.com/en/articles/10778313-shotgun-priority
- Creating Wave Pairings: https://docs.golfgenius.com/en/articles/10778288-creating-wave-pairings
- Glossary of Terms: https://docs.golfgenius.com/en/articles/10776851-glossary-of-terms

**BlueGolf**

- Step by Step Tournament Set Up Guide: https://bluegolf.supporthero.io/article/show/145261-step-by-step-tournament-set-up-guide
- Important BlueGolf Terminology, flights versus divisions: https://bluegolf.supporthero.io/article/show/156185-breakdown-of-bluegolf-terminology
- Tournament Director App: https://www.bluegolf.com/info/tdapp.html

**GolfStatus**

- Month of Golf Tournament Tasks, hole assignments: https://golfstatus.com/golfforgood/month-of-golf-tournament-tasks

**Rules and pace of play**

- R&A Pace of Play Manual, Management Practices: https://www.randa.org/en/pace-of-play/manual/2-management-practices
- R&A, Rule 22 Foursomes: https://www.randa.org/rog/the-rules-of-golf/rule-22
- PGA of America, glossary handout: https://pdf.pgalinks.com/lu2g/Glossary_Handout_2_.pdf

**Shotgun formats**

- Golf Monthly, what is a shotgun start: https://www.golfmonthly.com/features/the-game/what-is-a-shotgun-start-in-golf
- bunkered, what is a shotgun start: https://www.bunkered.co.uk/golf-news/what-is-a-shotgun-start

**This repository**

- `docs/spec/IGCC_Tournament_Desk.md`, playing days and sessions, start formats, event rules
- `src/lib/routing/schedule.ts`, `src/lib/data/tee-time.ts`, `src/lib/routing/index.ts`
- `src/lib/demo/data.ts`, `src/app/(desk)/setup/page.tsx`
