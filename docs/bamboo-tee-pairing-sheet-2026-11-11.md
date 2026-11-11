# 24th Bamboo Tee: Day 1 and Day 2 pairings as drawn on the desk sheet

Source: `C:\Users\Lenovo\Downloads\24TH BAMBOO TEE PAIRING (2).xlsx`, sheets `DAY 1 PAIRING` and
`DAY 2 PAIRING`. Extracted 11 November 2026. Copy of the data: `supabase/seed/bamboo-tee-2026-pairings.psv`.

Nothing was written to Supabase, no group or draw was created, and no application code changed. The
database was read with the service key and only `select` was used.

## Shape of the sheet

Each sheet holds two shotgun blocks. A `TEE-OFF TIME: 6:30AM SHOTGUN` row opens the morning block and
`TEE-OFF TIME: 12:30PM SHOTGUN` (row 68) opens the afternoon block. Each block labels holes 1 to 18 plus
a `B` position at holes 1, 2, 5, 9, 12 and 15, which is a second group on that hole. Every `B` position
is empty in both sheets.

The same hole number therefore occurs twice per sheet, once per block. That is why the data file carries
a `session` column and the header is `day|session|hole|slot|name`, not `day|hole|slot|name`. Without it,
`day 1, hole 1` would hold eight players instead of two groups of four. The rest of `supabase/seed`
already separates them: `bamboo-tee-2026-schedule.psv` is `name|day|session|side`.

`slot` is the left to right position in the row, 1 to 4. Names are copied exactly as written, including
`QUERUBIN CHIT`, `PADILLA ALAN`, `LIBUNAO BENEDICT` and `AÑALUCAS, RIZALDY`.

## Counts

| Day | Session | Groups with players | Players |
| --- | --- | --- | --- |
| 1 | AM | 11 | 42 |
| 1 | PM | 13 | 50 |
| 2 | AM | 6 | 21 |
| 2 | PM | 0 | 0 |
| total | | 30 | 113 |

- Rows parsed: 113 (Day 1 92, Day 2 21).
- Matched to exactly one registration: 96 (Day 1 80, Day 2 16).
- Unmatched: 17 (Day 1 12, Day 2 5).
- Matched to more than one registration: 0.
- Groups without exactly four names: 6.

The matcher is `matchesName` from `src/lib/name-match.ts`, run against all 301 registrations of the 24th
Bamboo Tee on every day.

## Unmatched names

Fourteen rows name a person who has no registration in the live database.

| Day | Session | Hole | Slot | Name in sheet |
| --- | --- | --- | --- | --- |
| 1 | AM | 2 | 1 | PAMONAG, RAYMART |
| 1 | AM | 12 | 1 | ONG-OH, JOEY |
| 1 | AM | 12 | 2 | TIROL, LEONARD |
| 1 | AM | 13 | 3 | PO, JC |
| 1 | AM | 13 | 4 | MENDEZ, PAUL |
| 1 | AM | 17 | 1 | SUMBILLA, JEFFREY |
| 1 | AM | 17 | 2 | SICADA, ROBERT |
| 1 | PM | 17 | 1 | SEO EUN JIN |
| 1 | PM | 17 | 2 | HONG, KEUN SEON |
| 1 | PM | 17 | 3 | PORTILLO, NENE |
| 1 | PM | 17 | 4 | SANTA MARIA, JOEY |
| 2 | AM | 1 | 1 | ONG OH, JOEY |
| 2 | AM | 1 | 2 | TIROL, LEONARD |
| 2 | AM | 2 | 2 | ASENSCIO, JOHN MARK |

Three rows name a registered player under a spelling the matcher cannot bridge. The person is known, the
string differs.

| Day | Session | Hole | Slot | Sheet | Database |
| --- | --- | --- | --- | --- | --- |
| 1 | PM | 14 | 2 | CAMOT, ARIANNE | `Arriane Camot` |
| 2 | AM | 1 | 4 | SEGOVIA, FERNANDO SIXTO | `SEGOVIA, FERANANDO SIXTO` |
| 2 | AM | 2 | 1 | ADORIO, RONEL | `ADORIO, RONNEL` |

`PAMONAG, RAYMART` and `SEO EUN JIN` also appear in `bamboo-tee-2026-waiting-list.psv`. Neither has a
registration in the live database.

## Groups without four names

| Day | Session | Hole | Names | Players |
| --- | --- | --- | --- | --- |
| 1 | AM | 14 | BERNARDO, EMILIANO / UY, WILBERT / QUERUBIN, TOTI | 3 |
| 1 | AM | 17 | SUMBILLA, JEFFREY / SICADA, ROBERT / MATILING, CHARLES | 3 |
| 1 | PM | 5 | DELA CRUZ, FRANCIS / ARENAS, OSKIE / SALDANA, BOY | 3 |
| 1 | PM | 16 | CAPAROS, MARVIN / SUMULONG, BENJIE / PINTAC, JEFF | 3 |
| 2 | AM | 2 | ADORIO, RONEL / ASENSCIO, JOHN MARK / PALOMO, RONALD | 3 |
| 2 | AM | 8 | NUFABLE, STEPHEN / PADILLA ALAN | 2 |

No group holds more than four names. Sixty-six labelled positions hold no players at all, including the
whole Day 2 afternoon block. Those are holes the desk has not drawn yet, not groups of zero, so they are
absent from the data file rather than written as empty groups.

## Duplicate players

No player appears twice on the same day. No name is repeated within a day, and no registration was used
in two slots of one day. `ONG-OH, JOEY` on Day 1 and `ONG OH, JOEY` on Day 2 are one person on two
different days, which the sheet allows.

## Count against the live database

Registrations with that day selected. This is a report only; the field was not changed.

| Day | Players on the sheet | Registered for the day | Difference |
| --- | --- | --- | --- |
| 1 | 92 | 77 | +15 |
| 2 | 21 | 110 | -89 |

| Day | Session | Players on the sheet | Registered for that day and session |
| --- | --- | --- | --- |
| 1 | AM | 42 | 35 |
| 1 | PM | 50 | 42 |
| 2 | AM | 21 | 54 |
| 2 | PM | 0 | 56 |

Of the 77 players registered for Day 1, 70 are on the Day 1 sheet and 7 are not. Of the 110 registered
for Day 2, 15 are on the Day 2 sheet and 95 are not. The Day 2 sheet is a partial draw, not a full
field.

Ten Day 1 slots and one Day 2 slot hold a player who is not registered for that day:

| Day | Session | Hole | Slot | Name | Registered days |
| --- | --- | --- | --- | --- | --- |
| 1 | AM | 5 | 3 | NUFABLE, STEPHEN | 3, 4 |
| 1 | AM | 5 | 4 | DIAZ, JAN JASON | 2, 3 |
| 1 | AM | 8 | 3 | LAGMAN, VICTOR | 2, 3 |
| 1 | AM | 8 | 4 | VILCHES, ZOSIMO | 3, 4 |
| 1 | AM | 10 | 4 | MANGALINDAN, VICTOR | 2, 3 |
| 1 | AM | 17 | 3 | MATILING, CHARLES | 2, 4 |
| 1 | PM | 5 | 1 | DELA CRUZ, FRANCIS | 3, 4 |
| 1 | PM | 6 | 2 | KWON, GRACE | 2, 4 |
| 1 | PM | 12 | 2 | JARA, ROLLIE | 2, 3 |
| 1 | PM | 12 | 4 | HINNERS, KEN | 2, 3 |
| 2 | AM | 8 | 1 | NUFABLE, STEPHEN | 3, 4 |

## Limits

The sheet has no date of its own beyond `Thu Nov 12 2026`, which both sheets repeat in the header, so Day
1 and Day 2 come from the sheet names. The `DAY 2 PLAYERS` sheet is titled `DAY 2 (NOV. 13, 2026)`, so
treat the header date in `DAY 2 PAIRING` as a leftover from Day 1. `slot` is position in the row, so it
carries no meaning beyond order. The extraction reads the two pairing sheets only; `DAY 1 PLAYERS` and
`DAY 2 PLAYERS` were used to cross-check spellings but are not part of the data file.
