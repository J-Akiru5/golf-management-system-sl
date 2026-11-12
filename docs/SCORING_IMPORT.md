# Scorecard JSON import

This is the file format for paper scorecards that are read outside the app and brought back as JSON.
It is for the organizer's data encoder. It is **not** the card reader contract; the photo reader has
its own format in [`SCORECARD_SCAN.md`](SCORECARD_SCAN.md).

The unit is one physical scorecard: one player, one marker, 18 gross hole scores. A group sheet with
four players becomes four entries in the `cards` array. One file covers one competition round, which
is one playing day.

The Scores screen has an **Import cards from JSON** panel. It downloads a fill-in template for the
open round, then reads the completed file, checks every card against the round and the published
groups, and submits only the cards that pass. The desk still approves every card afterwards. Nothing
in this file is auto-approved.

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

The ids and names above are examples. Do not send them as real data.

## Top-level fields

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `format` | string | yes | Exactly `teeline-scorecard-import`. |
| `version` | integer | yes | `1`. |
| `roundId` | UUID | yes | The open competition round, from the Scores screen. A file for another round is refused. |
| `tournamentId` | UUID | yes | The event. It is checked against the round. |
| `dayNumber` | integer | yes | The playing day, 1 to 4. It is a label and a cross-check; `roundId` is the real key. |
| `extractedBy` | string | yes | Your name. |
| `extractedAt` | ISO 8601 date and time | yes | When you finished the file, with the time zone. |
| `cards` | array | yes | One entry per physical scorecard. At least one. |
| `skipped` | array | no | Cards that could not be read. See below. |

## One card

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `cardKey` | string | yes | Unique in the file. 1 to 120 characters: letters, numbers, dot, colon, underscore, hyphen. This is the idempotency key, so re-importing the same card does not create a second revision. |
| `groupNumber` | integer or null | yes | The group number printed on the start sheet. `null` means the card does not show one; the player is then matched by name only. |
| `playerId` | UUID or null | one of `playerId` / `playerName` | The exact player. Preferred when the desk can supply it. |
| `playerName` | string or null | one of `playerId` / `playerName` | The name exactly as printed on the start sheet, in capitals: `LAST, FIRST`. |
| `markerPlayerId` | UUID or null | one of `markerPlayerId` / `markerName` | The exact marker. The marker must be a different player in the same round. |
| `markerName` | string or null | one of `markerPlayerId` / `markerName` | The marker's printed name. A player cannot mark their own card. |
| `writtenTotal` | integer or null | yes | The total written on the paper card. `null` when there is no written total. |
| `holes` | object | yes | Exactly the keys `"1"` to `"18"`, each a whole gross score from 1 to 20. See the hole rules below. |
| `notes` | string or null | no | A correction, an initialled change, or another fact the desk should see. Not a place for a score. |

### Hole rules

- `holes` is an object, not an array. The key is the hole number as a string.
- Every hole from 1 to 18 appears exactly once. No hole 19, no missing hole, no duplicate.
- The value is **gross strokes**, not Stableford points and not net strokes.
- The value is a whole number from 1 to 20. `"5"` is accepted and read as `5`; `0`, `21`, `4.5`, `""` and `null` are refused.
- A blank or illegible cell is never guessed. Move that whole card to `skipped` and let the desk enter it by hand.
- If the paper card has a written total, `writtenTotal` must equal the sum of the 18 holes. If the paper total is wrong, set `writtenTotal` to `null` and write the paper total in `notes`. Do not change a hole to make the sum work.

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
| `groupNumber` | integer or null | no | The group, when it is known. |
| `playerName` | string | yes | The player whose card could not be read. |
| `reason` | string | yes | What is unreadable or missing. The desk will enter the card by hand. |

## How a card is matched

1. If `playerId` is present, the player is found by id. `playerName` is checked as well; a name that
   points at a different player is an error.
2. Otherwise the player is matched by `playerName` against the open round. Case, extra spaces and
   commas are ignored, so `ADORIO, RONNEL` and `ADORIO RONNEL` match. If two players match, the card
   is refused; use the player id.
3. When `groupNumber` is present, the player must be in that group in the published draw. This is the
   check that catches a card filed under the wrong group.
4. The marker is matched the same way and must be a different player. A marker who is not in the open
   round is refused. If the round has assigned markers, the assigned marker must be used; the
   database refuses a different one.
5. A card that is already in for the same player and marker is skipped when the 18 holes are
   identical. If the holes differ, the card is refused: correct the existing card from the Cards
   table instead of importing a second one.

## What the import checks

A file is refused as a whole when:

- `format` or `version` is wrong.
- `roundId` does not match the open round, or `tournamentId` does not match the event.
- `cards` is empty, or a `cardKey` appears twice.

A card is refused, and the rest of the file can still be imported, when:

- a hole is missing, duplicated, out of range, or `null`.
- `writtenTotal` is present and does not equal the sum of the holes.
- the player or marker cannot be matched, or the player and marker are the same person.
- the player is not in the stated group.
- the card is already in for the same player and marker with different scores.

A card is skipped, not refused, when the identical card is already in.

## What happens to an imported card

- The source is `manual`. The file is a transcription, not a machine read.
- Every hole is marked as confirmed by the person who read the card.
- There are no confidence values. This is not the photo reader.
- The card is `submitted`, not approved. The desk still checks it and approves it.
- The normal scoring rules still apply: a player cannot mark their own card, conflicts need a desk
  resolution, and publication and finalization keep their own gates.
- Re-importing the same `cardKey` is safe. It does not create a second revision.

## Getting the template

1. Open **Scores** in the tournament desk and select the playing day you are importing into. A file
   for another day is refused.
2. Open **Import cards from JSON**.
3. Press **Download template**. The file already carries the round id, each player's id and name,
   the published group, the proposed marker and all 18 hole keys.
4. Fill `extractedBy`, `extractedAt` and the 18 scores. Do not change the ids or group numbers unless
   the desk tells you they are wrong.
5. Send the file back. The desk opens the same panel and checks the preview before importing.

If the round has no published draw, the template cannot fill the groups. Ask the desk to publish the
draw and open the round first.

## Blank template

Copy this for each card. Replace every `null` hole with the score from the paper card. The import
refuses a card while a hole is still `null`.

```json
{
  "cardKey": "d1-g1-player-marker",
  "groupNumber": 1,
  "playerId": null,
  "playerName": "LAST, FIRST",
  "markerPlayerId": null,
  "markerName": "LAST, FIRST",
  "writtenTotal": null,
  "holes": {
    "1": null,
    "2": null,
    "3": null,
    "4": null,
    "5": null,
    "6": null,
    "7": null,
    "8": null,
    "9": null,
    "10": null,
    "11": null,
    "12": null,
    "13": null,
    "14": null,
    "15": null,
    "16": null,
    "17": null,
    "18": null
  },
  "notes": null
}
```

## Checklist before sending

1. One file per playing day. Ask the desk for that day's `roundId` and `tournamentId`.
2. One card per physical scorecard. A four-player group sheet is four cards.
3. Use the exact printed names from the start sheet. If the desk can give you player and marker ids,
   use both the id and the name.
4. Transcribe gross strokes only. Never enter Stableford points or a net score.
5. A blank or unreadable cell goes in `skipped`. Never guess, never fill it with par.
6. Check each card adds up. If the paper total is wrong, use `null` and explain it in `notes`.
7. Give every card a stable `cardKey`. Reuse the same key when you re-send the same card. A correction
   after a card is already in is made on the desk's Cards table, not by importing a second card.
8. Send the file to the desk for a preview before it is written.

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
