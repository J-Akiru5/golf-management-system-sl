# Scorecard photo scan

The desk can attach a photo of a paper scorecard to a scoring card. The photo is stored in
Cloudflare R2 and the normal scoring approval rules still apply.

## What works today

1. Open **Scores** and choose **Scan a card**.
2. Pick **Individual card** or **Group sheet** and the player whose card it is.
3. Take a photo or choose a file.
4. The app fingerprints the image, uploads it to R2 through a short-lived signed URL, and stores
   the R2 object key.
5. If a card reader is configured, it returns proposed strokes and a confidence for every hole.
6. The desk compares the proposals with the photo, corrects cells, and presses **Use with card**.
7. The normal **Enter a card** form submits the card with `source = upload` and the R2 image.
8. The card still needs the ordinary approval. The photo never approves a card.

If no card reader is configured, the photo is still attached and the scores are entered by hand.
The screen says so; it does not invent scores.

## R2 setup

Set these server-side environment variables in local development and in Vercel:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT            optional; defaults to https://<account>.r2.cloudflarestorage.com
```

The bucket is private. The browser receives a signed PUT URL for 15 minutes. The server reads the
object with a short-lived signed GET. Keys look like:

```text
<club-id>/r2/scorecards/<uuid>.jpg
```

That prefix satisfies the existing `scorecard_images.storage_path` club-id check. The database stores
the key, MIME type, byte size and SHA-256. It does not store a public URL.

CORS on the bucket must allow `PUT` and `GET` from the app origins, with `Content-Type` and `ETag`.
The live bucket currently allows:

```text
http://localhost:3000
http://localhost:3001
https://golf.syntaxure.dev
https://golf-management-system-sl.vercel.app
```

Add any new staff-facing origin before using it. Do not make the bucket public.

## Optional card reader

The app calls `SCAN_INFERENCE_URL` with `multipart/form-data`:

```text
image     the scorecard photo
mode      individual | group
template  igcc-paper (currently the only template)
```

The service returns:

```json
{
  "engine": "roboflow-digit-v1",
  "engineVersion": "1",
  "players": [
    {
      "rowIndex": 0,
      "name": "optional printed or handwritten name",
      "writtenTotal": 95,
      "holes": [
        { "hole": 1, "strokes": 8, "confidence": 0.97 },
        { "hole": 2, "strokes": 5, "confidence": 0.94 }
      ]
    }
  ],
  "raw": {}
}
```

Every player must contain holes 1-18 exactly once. A score that the model cannot read must be
`null`, never a guess. Confidence is `0` to `1`. The app rejects malformed results. The route is
`POST /api/scoring/scan/extract`.

Set `SCAN_INFERENCE_TOKEN` if the local service requires a bearer token.

## Roboflow plan

The first model should be a **digit classifier** or a digit detector trained on cropped score cells.
A QR code is not present on the current paper card, so the service needs the card template and a
row/column mapping.

Suggested order:

1. Collect real filled cards. One photo is enough to test the upload and review screen, not enough
   to train a reliable model.
2. Crop every score cell. Record the digit, a blank cell, or an unreadable cell.
3. Upload the crops to a Roboflow classification or object-detection project. Augment rotation,
   brightness, contrast, blur and perspective. Keep the card/player/hole split out of the training
   set.
4. Train on Roboflow, export the model, and download it for local inference.
5. Run the local service behind `SCAN_INFERENCE_URL`. It should return the JSON contract above.
6. Measure per-cell accuracy and false accepts. Keep confidence low for uncertain cells and always
   review. Do not auto-approve cards.

See `docs/SCORECARD_SCAN_MODEL.md` for the training/export path, the local service, the missing
inputs and the exact commands.

The current paper card has three printed score rows (two handwritten) and printed handicap dots. The
service must mask the printed dots before classifying handwriting. It should return one `players[]`
entry per row and let the desk choose the player/row.

## Current limits

- No trained Roboflow model is connected yet. The screen works with the photo plus manual entry.
- The card template detection and per-cell cropping live in the local inference service, not in the
  Next.js app.
- `scorecard_images` currently accepts the R2 key; a future screen should show the private photo with
  a signed GET URL.
- The scoring screen still shows only the first competition round (day 1). That is a separate
  multi-day scoring task.
