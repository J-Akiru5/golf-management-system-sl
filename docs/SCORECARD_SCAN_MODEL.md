# Scorecard scan model

Status: 2026-10-25, branch `feat/scorecard-table-detect`. The local service, card
template, table fallback, bootstrap dataset tooling and tests exist. A **bootstrap**
Roboflow classification model (`igcc-scorecard-digits-v2/1`) was trained on the one
filled card and reads 31 of 36 used cells with 0 wrong on that same card. That is
training-set behaviour, not independent accuracy. No model binary or key is
committed. With no model configured the service returns 503 and the app keeps the
photo for manual entry.

The app-facing contract stays unchanged. See `docs/SCORECARD_SCAN.md` and
`src/app/api/scoring/scan/extract/route.ts`.

## What is in place

- `scripts/scan/` FastAPI service implementing `POST /scan` with multipart `image`,
  `mode` (`individual`/`group`) and `template` (`igcc-paper`).
- A local ONNX classification adapter and a Roboflow Serverless adapter.
- The IGCC paper template: 18 holes x 4 printed player rows on a 1800x1000 rectified
  card, with cell boxes and optional printed-dot masking.
- Bootstrap crop tooling for the one filled card, a manifest and a Roboflow
  classification folder format. It is marked `trainable: false`.
- Tests for the contract, geometry, crops, masking, rectification, no-model 503,
  auth, dataset manifest and label parsing.

## Why one card is not a model

The only filled card has four printed player rows; two contain handwriting. That is
36 handwritten cells, from two players, one handwriting style each, one lighting,
one camera angle. A classifier trained on those cells would memorize the card.

Synthetic rotations, brightness changes and blurs do not add independent samples.
They are useful for testing crop coordinates, masking and the upload path; they are
not evidence of accuracy. A validation split from the same card leaks the answer.

Minimum useful collection, before claiming a model works:

- Many distinct filled cards, ideally 20 or more, from different players and pens.
- Each card photographed at a few angles and lightings.
- A human labels every cell as a digit, blank or unreadable. Model output is never
  used as ground truth.
- Split by card, not by cell: all cells from one card live in one split.
- Measure per-cell accuracy and false accepts separately. The desk still reviews.

There is no defensible minimum that guarantees accuracy; 20 cards is a starting
point, not a promise. Add cards until per-digit errors are understood.

## Missing inputs

The work is blocked on these, not on code:

1. **Roboflow API key.** The key exists only in an ignored local environment file.
   It is not committed and must be rotated after it was shared in chat.
2. **Workspace and project.** Private workspace
   `lou-vincent-j-baroro-s-workspace`, project `igcc-scorecard-digits-v2`, version 1.
   The project is single-label classification.
3. **More filled cards.** Only `golf score Sheet.jpg` exists. It is one card.
4. **Human cell labels.** The two used rows on the one card were labelled by hand.
   More cards need labels; `.tmp/scan-dataset/labels.template.json` is not truth.
5. **Print-run confirmation.** The template was measured on the one photo. Confirm
   the current card print, especially whether the score cells carry printed handicap
   dots. This card prints stroke indexes in a separate HANDICAP row and has no dots
   in the score cells, so the mask is off by default.
6. **Camera/photo procedure.** The service now falls back to the printed table
   when the card outline is hidden, and that fallback works on the one real
   photo. More photos are still needed to check the detector across angles and
   lighting; a fixed framing guide remains the safest production setup.

No secret, key, photo, crop or model binary should be committed.

## End-to-end path

```text
Browser
  -> POST /api/scoring/scan/extract (Next.js)
     -> R2 signed GET of the photo
     -> POST SCAN_INFERENCE_URL (this service), multipart image/mode/template
        -> decode + rectify to 1800x1000
        -> crop 72 cells, optionally mask printed dots
        -> classify each cell
        -> JSON contract: engine, engineVersion, players[].holes[18]
     <- normalizeScanResult() in the app
  <- desk reviews every cell, corrects, submits with the photo
```

The app sends `SCAN_INFERENCE_TOKEN` as a bearer token when configured. Point
`SCAN_INFERENCE_URL` at `http://127.0.0.1:8000/scan` for local work. The service
does not run in the browser and needs no CORS.

A cell the model cannot read is `strokes: null`. It is never filled with par, zero
or a guess. Confidence is 0..1 and low-confidence cells are null. The card still
needs the ordinary approval.

## Training and export

### 1. Label cells

Crop every score cell from every card. Use `scripts/scan/prepare_dataset.py` for the
one bootstrap card, then repeat the same geometry for each card (the calibration
corners are per photo; the template boxes are constant after rectification).

Classes: `blank`, `1`..`9`, `unreadable`. Add `10`..`20` only if the dataset has
enough two-digit cells; a single-cell classifier cannot read a two-digit score
without those classes. Do not add `0` as a valid score.

### 2. Upload to Roboflow

Use a single-label classification project. The dataset folder layout is:

```text
roboflow/
  train/
    blank/*.png
    1/*.png
    ...
    9/*.png
    unreadable/*.png
```

Roboflow uses folder names as class labels for classification datasets. Upload with
`Workspace.upload_dataset()` or the zip flow. Do not upload the bootstrap folder as
if it were a training set; it has one card and no validation split.

Recommended augmentation: small rotation, brightness, contrast, blur and perspective.
Keep the cell crop convention identical to inference (5 px inset, square padding,
same normalisation, dot mask on only if the print run really has printed dots). Augmentation must not create a fake digit from a
printed handicap dot.

### 3. Train on Roboflow

Train a classification model. Check the confusion matrix per digit, not only overall
accuracy. The expensive error is a wrong digit accepted with high confidence. Keep
the confidence threshold conservative and return null below it.

### 4. Export and run locally

Download the classification weights as ONNX. Put the model and a `classes.json`
outside Git (`models/` is ignored). The local adapter expects:

- input `1 x channels x size x size`, default `1 x 1 x 64 x 64`, float32 0..1;
- one output vector in class order;
- labels `blank`, digits, `unreadable`.

Set:

```powershell
$env:SCAN_MODEL_BACKEND="local_onnx"
$env:SCAN_MODEL_PATH="C:\models\igcc-digits.onnx"
$env:SCAN_MODEL_CLASSES="C:\models\classes.json"
$env:SCAN_ENGINE_VERSION="1"
uvicorn igcc_scan.app:app --host 127.0.0.1 --port 8000
```

If the export expects different size, channels, layout or normalisation, set
`SCAN_MODEL_INPUT_*`. The service checks a static shape and refuses a mismatch. This
is the intended deployment: no per-cell network calls, no photo leaves the host.

### 5. Hosted alternative

For a quick test before downloading weights:

```powershell
$env:SCAN_MODEL_BACKEND="roboflow_hosted"
$env:ROBOFLOW_API_KEY="<process environment only>"
$env:ROBOFLOW_MODEL_ID="<workspace>/<project>/<version>"
```

This sends 72 cell images per card and uses 72 credits. The app's timeout is 60
seconds; the adapter runs cells concurrently (`SCAN_CLASSIFY_CONCURRENCY`). It is
implemented against the documented serverless API but has not been run against a
live project.

## Card template

The rectified card is 1800x1000. The card warp is followed by a table-leveling
homography fitted to the printed table border; without it a small corner error
leaves the rows sloping and clips the right side of a score row. Measured geometry:

| Item | Pixels |
| --- | --- |
| Table | x 115..1733, y 240..770 |
| Name column | x 115..389 |
| Hole 1..9 | x 389..909, nine cells |
| OUT | x 909..965 |
| Hole 10..18 | x 965..1493, nine cells |
| IN | x 1493..1551 |
| TOTAL | x 1551..1610 |
| Player row 0 (empty here) | y 435..486 |
| Player row 1 (handwritten) | y 486..531 |
| Player row 2 (empty here) | y 531..582 |
| Player row 3 (handwritten) | y 582..627 |
| Printed fifth score line (not read) | y 627..678 |
| LADIES PAR | y 678..725 |
| HANDICAP | y 725..770 |

The column edges were re-measured from 111 rectified cards on 2026-11-02. The
original hand measurement was 5 to 6 px left for holes 1 to 8; the rest were
within 2 px. The row edges still come from the first photo. This is still a
template, not a detector; if the card is reprinted, measure again.

### Rectification without the card outline

The real photo has a hand on one corner and a busy background, so the card outline
is not detectable. The service now tries the printed table instead: it finds a
quadrilateral with the table's aspect ratio (about 3.05), maps it onto the template
table rectangle and keeps the card frame. The four right-angle rotations are tried
and landscape candidates are preferred, so a sideways phone photo is not warped
into a portrait card. `raw.card.detectedBy` reports `card`, `table`, `corners` or
`prewarped`.

On the one real photo, this path produced a clean 1800x1000 card and the bootstrap
model read 31 of 36 used cells with **0 wrong** and 5 abstentions. That is
training-set behaviour from one card, not independent accuracy. The desk still
reviews every cell.

The printed handicap information on this card is the separate HANDICAP row at
y 725..770, not dots in the score cells. The service therefore leaves the dot mask
off by default. `CardTemplate.mask_printed_dots`, `SCAN_MASK_DOTS=1` and
`prepare_dataset.py --mask-dots` remain for a future print run that adds dots;
enabling it is an explicit choice. The desk still sees the original photo and can
correct a cell.

## Failure behaviour

- No model: HTTP 503 `model_not_configured`, no scores.
- Bad model path/classes: HTTP 503 `model_config_error`, no scores.
- Card and table not found: HTTP 422 `card_not_detected`, no cells guessed.
- Model fails on every cell or most cells: HTTP 502, no mostly-empty card.
- A few cells fail: those cells are null with confidence 0 and a warning in `raw`.
- The app rejects malformed output with its existing normalize step.

## Next step

1. Get a Roboflow API key, workspace slug and classification project id.
2. Fill `labels.template.json` for the one card by hand and run the uploader dry
   run, then a real bootstrap upload only to test the path.
3. Collect more filled cards with consent. Crop, label, split by card, retrain.
4. Download the ONNX export, set `SCAN_MODEL_PATH`/`SCAN_MODEL_CLASSES`, and smoke
   test `POST /scan` against a known card.
5. Only then set `SCAN_INFERENCE_URL` in the app environment. Keep the desk review
   and the ordinary approval step.
