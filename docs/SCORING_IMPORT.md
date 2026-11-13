# Scorecard JSON import

This is the file format for paper scorecards that are read outside the app and brought back as JSON.
The desk downloads a template, sends it to the transcriber, and imports the completed file on the
Scores screen. The desk still approves every card after the import.

This is **not** the photo-reader format. The photo reader is described in
[`SCORECARD_SCAN.md`](SCORECARD_SCAN.md).

## Words used here

- **Player**: the golfer whose score is on the card.
- **Marker**: the other golfer who kept and signed the score. A player cannot mark their own card.
- **Group**: the players who played together, as printed on the start sheet.
- **Card**: one player's paper scorecard. A four-player group sheet is one piece of paper but four
  cards in this file.

## What the desk sends you

The desk downloads the template for the correct round and day and sends it to you. You do not need
to open the app.

The template already contains:

- the round id, tournament id and day;
- every player's id and printed name;
- the published group;
- a proposed marker for each card;
- all 18 hole keys, with empty scores.

Your job is to fill the scores, check the marker against the paper card, put your name in
`extractedBy`, and put the time in `extractedAt`.

## The whole file

```json
{
  "format": "teeline-scorecard-import",
  "version": 1,
  "roundId": "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
  "tournamentId": "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
  "dayNumber": 1,
  "extractedBy": "Karl Calimotan",
  "extractedAt": "2026-11-12T18:40:00+08:00",
  "cards": [
    {
      "cardKey": "d1-g1-adorio-ronnel-sulpico-randy",
      "groupNumber": 1,
      "playerId": "0b7f6e5d-4c3b-4a29-8176-5f4e3d2c1b0a",
      "playerName": "ADORIO, RONNEL",
      "markerPlayerId": "1c8e7f6a-5b4d-4c3e-9f2a-6b7c8d9e0f1a",
      "markerName": "SULPICO, RANDY",
      "writtenTotal": 88,
      "holes": {
        "1": 6,
        "2": 5,
        "3": 4,
        "4": 4,
        "5": 6,
        "6": 5,
        "7": 3,
        "8": 5,
        "9": 5,
        "10": 5,
        "11": 4,
        "12": 4,
        "13": 6,
        "14": 5,
        "15": 6,
        "16": 4,
        "17": 5,
        "18": 6
      },
      "notes": null
    }
  ],
  "skipped": []
}
```

The ids and names above are examples. Do not send them as real data. The same file is in
[`examples/scorecard-import.example.json`](examples/scorecard-import.example.json).

## Top-level fields

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `format` | text | yes | Exactly `teeline-scorecard-import`. |
| `version` | number | yes | The number `1`, without quotes. |
| `roundId` | text | yes | The long id already in the template. A file for another round is refused. |
| `tournamentId` | text | yes | The long id already in the template. It is checked against the round. |
| `dayNumber` | number | yes | The playing day, 1 to 4. It is checked against the round. |
| `extractedBy` | text | yes | Your name. |
| `extractedAt` | text | yes | When you finished, in the shape shown in the example: `2026-11-12T18:40:00+08:00`. The `T` and the `+08:00` are required. |
| `cards` | list | yes | One entry per physical scorecard. At least one. |
| `skipped` | list | no | Cards you could not read. See below. |

## One card

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `cardKey` | text | yes | A name for this card that stays the same if you send the file again. It must be unique in the file for this round. Keep the template's key unless you have a reason to change it. |
| `groupNumber` | number or null | yes | The group number printed on the start sheet. `null` means the card does not show one. The player is still matched by id or name and must still be in the published draw; only the group-number comparison is skipped. |
| `playerId` | text or null | one of `playerId` / `playerName` | The long player id from the template. It is the safest identity. |
| `playerName` | text or null | one of `playerId` / `playerName` | The name from the template, in capitals: `LAST, FIRST`. When the id is present, the id decides the player. The name is a cross-check. |
| `markerPlayerId` | text or null | one of `markerPlayerId` / `markerName` | The long marker id. Change it only with the name, never on its own. |
| `markerName` | text or null | one of `markerPlayerId` / `markerName` | The marker's name from the template. A player cannot mark their own card. |
| `writtenTotal` | number or null | yes | The total written on the paper card. `null` when the card has no written total. |
| `holes` | block | yes | Exactly the keys `"1"` to `"18"`, one line per hole. See the hole rules below. |
| `notes` | text or null | no | A correction, an initialled change, or another fact the desk should see. Keep it on one line. Not a place for a score. |

## Hole rules

- `holes` is a block with one line per hole, not a list. The key is the hole number in quotes.
- Every hole from 1 to 18 appears exactly once. No hole 19, no missing hole. Do not repeat a hole
  key: JSON keeps only the last value if a key is repeated, so the importer cannot reliably detect it.
- The value is **gross strokes**, not Stableford points and not net strokes. The importer cannot tell
  a gross score from a Stableford point; transcribing gross strokes is your responsibility.
- The value is a whole number. `"5"` is accepted and read as `5`; `0`, `21`, `4.5`, `""` and `null`
  are refused.
- The round can set a narrower range than the default 1 to 20; the preview names any hole outside it.
- A blank or illegible cell is never guessed. Move that whole card to `skipped` and let the desk enter
  it by hand.
- If the paper card has a written total, `writtenTotal` must equal the sum of the 18 holes. If the
  paper total is wrong, set `writtenTotal` to `null` and write the paper total in `notes`. Do not
  change a hole to make the sum work.

## Skipped cards

A card that cannot be read completely goes in `skipped`, not in `cards`. This is how the desk knows a
card is missing without anyone guessing a score.

```json
"skipped": [
  {
    "groupNumber": 7,
    "playerName": "TAN, JUAN RICARDO",
    "reason": "Hole 14 is illegible and the written total is crossed out."
  }
]
```

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `groupNumber` | number or null | no | The group, when it is known. |
| `playerName` | text | yes | The player whose card could not be read. |
| `reason` | text | yes | What is unreadable, missing or not returned. The desk will enter the card by hand. |

If a player in the template has no paper card because they were a no-show, withdrew, or the card was
not returned, delete that card from `cards` and add an entry to `skipped` with a reason such as
`No card returned`. Do not leave an empty card in `cards`.

## If a player has more than one card

A player may have one card per marker. If the event requires two cards, the player has two entries in
`cards`, one for each marker.

1. Copy the player's entry.
2. Give the copy a new `cardKey`.
3. Change `markerPlayerId` and `markerName` together to the second marker.
4. Enter that marker's 18 scores.

Do not average or combine the two cards. The desk reconciles them. Do not include two cards for the
same player and the same marker in one file; the import refuses the second one.

## If a marker is not a player

The import only accepts a marker who is a player in the round. If a marshal or another official who is
not a player marked the card, put the whole card in `skipped` and tell the desk; the desk enters it by
hand.

## If a card is already in

- An identical card that is already in is shown as **already in** and is not written again.
- A card with different scores or a different written total for the same player and marker is
  **blocked**. Do not send a correction by importing a second card. The desk corrects the card on the
  Cards table.
- If a card was rejected or revoked, the import blocks it too. The desk enters a new card from the
  Cards table.
- A correction made on the paper **before** you send the file is fine: fix the score, update
  `writtenTotal` if needed, keep the same `cardKey`, and explain the initialled change in `notes`.

## How the desk matches a card

1. When `playerId` is present and found, the id decides the player. A `playerName` that is missing
   from the roster, shared by two players, or spelled differently on the paper card does not block the
   card; the id wins.
2. When only `playerName` is present, the desk matches it against the open round. Case, extra spaces
   and commas are ignored, so `ADORIO, RONNEL` and `ADORIO RONNEL` match. If two players match, the
   card is refused; use the player id.
3. When `groupNumber` is present, the player must be in that group in the published draw for that day.
4. The marker is matched the same way and must be a different player. If the round has assigned
   markers, the assigned marker must be used; the database refuses a different one.

## What the preview means

| Word | Meaning |
| --- | --- |
| **Ready** | The card passed every check and will be written when you press Import. |
| **Already in** | The same card is already there. Nothing is written again. |
| **Blocked** | The card is refused. The reason is shown. The rest of the file can still be imported. |
| **Skipped** | You could not read the card. The desk enters it by hand. |

## What the import checks

A file is refused as a whole when:

- `format` or `version` is wrong.
- `roundId`, `tournamentId` or `dayNumber` does not match the open round.
- `cards` is empty.

A card is left out or refused when:

- a hole is missing, out of range, or `null`.
- `writtenTotal` is present and does not equal the sum of the holes.
- the player or marker cannot be matched, or the player and marker are the same person.
- the player is not in the stated group.
- the same player and marker appear more than once in the file.
- the card is already in for the same player and marker with different scores or a different written
  total, or was rejected or revoked.

A repeated `cardKey` is a card problem: the second card is left out, the preview names it, and the rest
of the file can still be imported.

## What happens to an imported card

- The source is a typed card, not a photo.
- Every hole is marked as confirmed by the person who read the card.
- The transcriber's name, time and the card's notes are stored with the card in the connected desk.
- The card is sent to the desk, not approved. The desk still checks it and approves it.
- The normal scoring rules still apply: a player cannot mark their own card, conflicts need a desk
  resolution, and publication and finalization keep their own gates.
- Sending the same `cardKey` again is safe. It does not create a second copy of the card.

## Limits

- Names and ids: up to 120 characters.
- `notes`: up to 2,000 characters, on one line.
- A skipped reason: up to 500 characters, on one line.
- `extractedAt`: up to 40 characters.
- `groupNumber`: 1 to 999.
- `writtenTotal`: 1 up to 18 times the round's maximum hole score (360 with the default maximum of 20).
- Scores: whole numbers, normally 1 to 20, or the round's narrower range.

Write numbers without quotes. The importer tolerates `"5"` for a score, but `version` must be the
number `1`. Use the ids from the template. In the demo they may look like `demo-round-1`, not a long
UUID; that is fine.

## Getting the template

1. Open **Scores** in the tournament desk and select the playing day you are importing into. A file
   for another day is refused.
2. Open **Import cards from JSON**.
3. Press **Download template**.
4. Fill `extractedBy`, `extractedAt`, `writtenTotal` where the paper has one, and the 18 scores.
5. Check the marker against the paper card. The template's marker is only a proposal. If the card was
   marked by a different player, change both `markerPlayerId` and `markerName` to that player. Change
   the id and the name together; a name that points at a different player is refused. Do not change
   the player's id or name, or the group number, unless the desk tells you they are wrong.
6. Send the file back. The desk opens the same panel and checks the preview before importing.

If the round has no published draw, the template cannot fill the groups. Ask the desk to publish the
draw and open the round first.

## Editing and saving the file

- Edit it in a plain text editor, not Word or Excel.
- Save it as UTF-8 with a `.json` extension.
- Keep every `notes` and `reason` on one line. Do not use double quotes inside them.
- If the preview says the file is not valid JSON, check for a missing comma, a missing quote, or a
  line break inside a quoted value.
- Replace `LAST, FIRST` placeholders with the real name, or use the downloaded template.

## Checklist before sending

1. One file per playing day. Use the `roundId`, `tournamentId` and `dayNumber` already in the
   template; do not type them.
2. One card per physical scorecard. A four-player group sheet is four cards.
3. A second card for the same player goes in the same file with a different marker, a new `cardKey`,
   and that marker's scores.
4. Use the player and marker ids from the template. Check the marker against the paper card and
   change the id and name together when they differ.
5. Transcribe gross strokes only. Never enter Stableford points or a net score.
6. A blank or unreadable cell goes in `skipped`. Never guess, never fill it with par.
7. If a player has no card, remove it from `cards` and add it to `skipped`.
8. Check each card adds up. If the paper total is wrong, use `null` and explain it in `notes`.
9. Keep every `cardKey` stable for this round. Do not re-send a correction after the card is in; the
   desk corrects it on the Cards table.
10. Send the file to the desk for a preview before it is written.

## Validate the file

If you have the repository, this command checks the structure without writing anything:

```bash
pnpm exec tsx scripts/validate-scorecard-import.ts path/to/scorecards.json
```

It checks the fields, the 18 holes, the ranges, duplicate `cardKey` values and the written totals. It
does not know the round's players or groups; the Scores screen checks those when it previews the file.

## A note on the two formats

- `docs/SCORECARD_SCAN.md` describes what the photo reader returns for one photo: `engine`,
  `engineVersion`, and `players[]` with a confidence per hole. That format is for the card reader and
  the scan review screen.
- This document describes the bulk transcription format: one file for a day, `cards[]` with exact
  player and marker identities, and no confidence values.

Do not mix the two. If a card is read by the photo reader, use the scan screen. If a card is read by a
person from paper, use this file.

## The scoring sheet export (`bamboo-scores-edit`)

This is a third format, for the standalone sheet at `/scorecard/`. Its **Export JSON** button saves
the whole working state, and **Scores, Review, Import the scoring sheet export** loads it. Use it
to bring in cards that were typed on the sheet, so nobody runs a script.

It only works on a round whose rules version is `bamboo-tee-2026`. Type that as the rules version
when the round is opened, with one required card. The rules are:

- One desk-checked card per player is enough.
- The playing handicap is the HDCP box with the decimal dropped (16.7 plays off 16). A blank box
  counts as 0. A plus handicap, text or a number above 54 blocks the card, because the rule does not
  cover it.
- Strokes are given by stroke index. Net points are par 2, birdie 3, bogey 1, worse 0.
- An `X` is a pick-up: 0 points, no stroke count, a played hole. A card with an X is not compared
  with its written total.
- Markers are not published. The database needs one, so a stable stand-in player is stored and the
  audit sentence says so.

What the importer does with each card in the file:

| Result | Meaning |
| --- | --- |
| **Save and approve** | The name matches one player in this day's round, all 18 holes are filled, and the sheet marks the card verified. |
| **Save only** | Same, but the sheet has not verified it. It waits for approval on the Cards table. |
| **Already in** | An identical card is already approved for this player. Nothing is written. |
| **Unmatched** | No player, or more than one player, in this day's round has that name. Nothing is guessed. Fix the name on the sheet or enter the card by hand. |
| **Blocked** | A blank hole, a score outside the round's range, a written total that does not add up (no X), a handicap the rule cannot read, a second card for the same player, or different scores from a card already in. The reason names the player. |

A name matches when capitals, accents, punctuation and word order are ignored. `ADORIO, RONNEL` and
`Ronnel Adorio` match; `ANN` and `ANNE` do not.

A file whose `mode` is `whs` is refused whole: that setting converts the HDCP box as an index with
the tee's slope, which is not this event's rule. Switch the sheet to the written setting and export
again.

Importing the same file twice is safe. Each card is keyed to its sheet card id and the round, and a
card that is already in is left alone. A correction after import is made on the Cards table, not by
importing again.

Saving needs the migration `20261114000100_card_handicap_snapshot.sql`. Until the owner applies it
the import and the entry form both stop with a plain message and write no card.
