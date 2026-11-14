# Playing handicap recalculated for Days 1 to 3 (14 Nov 2026)

For Jeff to review: is this calculation the right one for the 24th Bamboo Tee?

Players complained that the handicap on the public board was wrong. The audit found that the
published cards were scored with many different handicaps. The script
`scripts/recalc-published-handicaps.mjs` recalculated them with the system's playing handicap and
published the result. It has already been run against the live project. This note records what it did
so the calculation can be checked.

## The calculation

Same arithmetic as `save_handicap_snapshot` in the database and `calculateHandicap` in
`src/lib/scoring/handicap.ts`:

1. Handicap Index from the registration's frozen index, capped at the event's `max_index` (30).
2. Course handicap = round(index x slope / 113 + course rating - par), rounded half up.
3. Playing handicap = round(course handicap x allowance). The event allowance is 1 (100%), so the
   playing handicap equals the course handicap. The round's `handicap_rounding` is `whs`.
4. Strokes per hole come from the stroke index (`handicap_strokes`), net points are Stableford
   (par 2, birdie 3, bogey 1, worse 0), and a pick-up scores 0.

Worked example, Leviste Mark: index 15.9 on the Blue tee (rating 69.6, slope 130, par 70).
15.9 x 130 / 113 = 18.29; 18.29 + (69.6 - 70) = 17.89; rounds to 18. Playing handicap 18.

Each player's own registration tee is used. An index of 0 or no index is treated as "no usable
index" and the player is skipped, not given 0.

## What the audit found before the change

Public already matched the admin results on every card. The problem was the handicap behind them.
Read from the strokes given on each hole, the cards had used:

| Day | Cards | Used the system formula |
| --- | --- | --- |
| 1 | 86 | 29 |
| 2 | 111 | not checkable: no handicap or per-hole strokes were stored |
| 3 | 132 | 44 |

The rest used the index with the decimal dropped, the index rounded with no slope, an old stored
registration value, or 0 although an index was set (for example Barbo Alvar, index 16.1, played off 0).

## What the script did

- Added a handicap snapshot for each round entry that had none (Day 2: 83, Day 3: 110, Day 1: 2).
  These are plain inserts. The database only freezes UPDATE and DELETE. Source `Registration freeze`,
  rules version `unconfirmed` for Days 2 and 3, one `scoring_audit` row each with no actor.
  `save_handicap_snapshot` was not used because it needs a signed-in staff user and an open round.
- Ran the database's own `recalculate_player_results` for each player it could calculate.
- Before publishing, compared every recalculated result with an independent calculation in the script.
  All matched. The same calculation also reproduced 216 of 218 stored results from the old data before
  any change (the two misses had the same net points and a different net strokes count).
- Built each publication with `build_round_snapshot` and inserted it as a new version:
  Day 1 version 10, Day 2 version 5, Day 3 version 5. Earlier versions are kept. A player who was not
  recalculated keeps the card the public already had.

Result: net points changed for about 175 cards, most of them upward. The cards using the system
formula are now 64 of 86 on Day 1, 82 of 111 on Day 2 (the rest have no hole data) and 127 of 132 on
Day 3. Running the script again in plan mode now changes nothing, and the independent calculation
reproduces 300 of 300 stored results.

Backups of the results, snapshots and latest publications from before the change are in the
`backups/` folder of the machine that ran it (`handicap-recalc-before-*.json`, not in git).

## Not done

- **Frozen snapshots, Day 1, 16 players.** Their snapshot already holds a different handicap and the
  database refuses to change a snapshot once scoring has started. Darius Gregorio, Tan Rudy, Cabanayan
  Ed, Alinsangan Neil, Cambay Jesse Charlo, Sumulong Benjie, Youn Smith, Añalucas Rizaldy, Jara Rollie,
  Alquiros Ira, Bautista Ernesto, Hinners Ken, Jamelo Jessie, Camot Arriane, Caparros Marvin, Yatco
  Oscar. Fixing them needs `20261114000300_correct_handicap_snapshot.sql`, which is not applied.
- **No usable index** (index 0 or empty): Day 1 14 players, Day 2 20, Day 3 18. Left as published.
- **No tee assigned:** Day 1 6, Day 2 9, Day 3 4 (Junsay Melvin, Pamonag Raymart, Gurrea Felman,
  Jardeleza Bart). Left as published.
- Vasquez Russel Vandrick plays off 26 on Day 3 but has an index of 0 on file.
- A skipped Day 2 or Day 3 player has no snapshot. If a card of theirs is approved again, the database
  recalculation gives them no net points until a snapshot exists.

## Questions for review

1. **Which handicap does this event play off?** On 14 Nov the owner confirmed a card rule in
   `src/lib/scoring/event-rules.ts`: the playing handicap is the HDCP written on the card with the
   decimal dropped (15.9 plays off 15). No round in the database uses that rule set, so this change
   used the system formula (18 for the same player), as the organizer asked. If the card rule is the
   intended one, the Day 3 cards that used it were right and this change moved them.
2. Is treating an index of 0 as "no usable index" right, or should those players play off 0?
3. Are direct inserts into `handicap_snapshots` for provisional rounds acceptable, given that the
   migration for correcting a frozen snapshot is still not applied?
4. Classes follow the pair's average index (139 of 149 pairs agree), while the event setting says
   `course_handicap`. This change did not touch classes.

## How to check

```bash
node scripts/recalc-published-handicaps.mjs --env <path to .env.local>
```

Plan mode writes nothing. It prints, per round, how many players it would recalculate, why others are
skipped, and the model check. `--apply` writes. `--rounds 2,3` limits it to some rounds.
