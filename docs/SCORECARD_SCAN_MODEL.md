# Scorecard scan model

Status: 2026-11-05. The reader runs a local ONNX model. Roboflow has no ONNX export
for this project type (see "Export and run locally"), so `scripts/scan/train_onnx.py`
trains a small network on the labelled cells exported from
`igcc-scorecard-digits-v2` version 4 and writes the ONNX file the service loads. On
held-out cells it reads 0.866 of the validation split and 0.837 of the test split.
On a rectified card it reads written rows as digits and empty rows as blank.
Reading a raw phone photo is still the weak link; see "Rectification without the
card outline".

Historical note, 2026-10-25, branch `feat/scorecard-table-detect`. The local service, card
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

1. **Roboflow API key.** It is read from the process environment only
   (`ROBOFLOW_API_KEY`). It is not committed, and it should be rotated after it was
   shared in chat.
2. **Workspace and project.** Private workspace
   `lou-vincent-j-baroro-s-workspace`, project `igcc-scorecard-digits-v2`, version 4.
   The project is single-label classification (`modelType: vit`, 1951 labelled cells).
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

Roboflow cannot export this project to ONNX. A classification project answers

```text
HTTP 400 {"error":"onnx is an invalid format for project type classification. Please use one of: folder, clip."}
```

and version 4 lists `exports: ["folder"]`. The trained `vit` weights stay on the
Roboflow host, so the only extractable artefact is the labelled cell dataset.
`scripts/scan/train_onnx.py` downloads that `folder` export, trains a small
convolutional network on the same cells and writes the ONNX file plus its
`classes.json`. It is a different model from Roboflow's, trained on the same labels:

```powershell
cd scripts/scan
python -m pip install -r requirements-train.txt
$env:ROBOFLOW_API_KEY="<process environment only>"
python train_onnx.py --project lou-vincent-j-baroro-s-workspace/igcc-scorecard-digits-v2/4
```

Measured on version 4: 1951 cells, 1520 train / 216 valid / 215 test, split by
Roboflow. The split is by cell, so cells from the same card appear in more than one
split and the numbers are optimistic for a new card.

| Split | Accuracy |
| --- | --- |
| valid (best epoch) | 0.866 |
| test | 0.837 |

The frequent mistakes are 4/5/6 confusions, which is what the desk's amber check
flag is for. The model is over-confident on this small dataset, so treat its score
as a ranking rather than a probability.

Put the model and a `classes.json` outside Git (`models/*.onnx` is ignored). The
local adapter expects:

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
seconds; the adapter runs cells concurrently (`SCAN_CLASSIFY_CONCURRENCY`). It has
been run against version 4: a 200 response returns `top` and `confidence`, which the
adapter reads. It cannot be the production path because it needs one network call
per cell.

## Card template

The rectified card is 1800x1000. The card warp is followed by a table-leveling
homography fitted to the printed table border; without it a small corner error
leaves the rows sloping and clips the right side of a score row. Measured geometry:

| Item | Pixels |
| --- | --- |
| Table | x 115..1733, y 240..770 |
| Name column | x 115..383 |
| Hole 1..9 | x 383..906, nine cells |
| OUT | x 906..964 |
| Hole 10..18 | x 964..1492, nine cells |
| IN | x 1492..1549 |
| TOTAL | x 1549..1608 |
| Player row 0 (empty here) | y 435..486 |
| Player row 1 (handwritten) | y 486..531 |
| Player row 2 (empty here) | y 531..582 |
| Player row 3 (handwritten) | y 582..627 |
| Printed fifth score line (not read) | y 627..678 |
| LADIES PAR | y 678..725 |
| HANDICAP | y 725..770 |

The photo is rotated 90 degrees; `scripts/scan/igcc_photo_calibration.json` records
the measured corners and source SHA-256. This is calibration for one photo, not a
claim about every print run. If the card is reprinted, measure again.

### Rectification without the card outline

The real photo has a hand on one corner and a busy background, so the card outline
is not detectable. The service now tries the printed table instead: it finds a
quadrilateral with the table's aspect ratio (about 3.05), maps it onto the template
table rectangle and keeps the card frame. The four right-angle rotations are tried
and landscape candidates are preferred, so a sideways phone photo is not warped
into a portrait card. `raw.card.detectedBy` reports `card`, `table`, `corners` or
`prewarped`.

Automatic rectification of the raw photos in `.tmp/scorecard-samples/raw` is not
reliable yet. The quad the detector picks on those photos is not the card, so the
cells cropped from that warp hold the wrong ink and the digits read from them are
noise, including digits on empty rows. The prepared rectified cards in
`.tmp/scorecard-samples/prepared/rectified_v2` read correctly (written rows give
digits, empty rows give blank), so the model and the cell boxes are fine and the gap
is in detection.

Two rules keep that failure quiet instead of wrong-looking. Orientation only
considers 0 and 180 degrees, because a 90 degree turn makes the 1800x1000 card
portrait and the cell boxes (x up to 1733) then fall outside the image. A card that
is not in the template frame, including a portrait `prewarped` image, is refused as
`card_not_detected` rather than cropped anyway.

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
4. Run `train_onnx.py` (see "Export and run locally"), set
   `SCAN_MODEL_PATH`/`SCAN_MODEL_CLASSES`, and smoke test `POST /scan` against a
   known card.
5. Only then set `SCAN_INFERENCE_URL` in the app environment. Keep the desk review
   and the ordinary approval step.

## Card detection and rectification (November 2026)

The detector was replaced. The old one took the largest contour that happened to
approximate a 1.8 quad and never checked whether the warp lined up with the printed
table. On the 111 raw photos it could not find the card on 14, fell back to the
printed table on 66, and every one of the 97 comparable warps was misaligned: the
median grid alignment score was 0.29 against 0.84 for the reference warps, so the
cropped cells held the wrong ink.

Detection is now three steps, and each one is measurable on its own:

1. **Template features** (`igcc_scan/features.py`). The card is a fixed printed
   object, so the photo is matched against one stored reference card with SIFT and a
   RANSAC homography. The reference is stored as keypoints and descriptors
   (`models/igcc-card-template.npz`), not as an image, so no filled card photo is
   committed. Regenerate it with `python build_card_template.py --card <rectified
   card>`; point `SCAN_CARD_TEMPLATE` at another file to use a different card.
2. **Geometric fallback** (`igcc_scan/detect.py`). Without a template, every
   card-shaped and table-shaped quadrilateral from several edge maps is proposed,
   and the printed-table proposals are projected back to the card frame.
3. **Validation** (`igcc_scan/align.py`, `igcc_scan/quads.py`). Candidates are ranked
   by a projection alignment score: the printed ink is projected onto the row and
   column axes and correlated with the template's line positions, smoothed so the
   score degrades with misalignment instead of saturating. Geometry (convexity,
   corner angles, aspect, area), edge support, sharpness and glare are checked too.

The score thresholds are calibrated on the raw photo set: reference warps score
0.41-0.53, a warp onto the wrong rectangle scores -0.06 to 0.13.

| Outcome | Meaning | Service behaviour |
| --- | --- | --- |
| `accept` | alignment >= 0.36, clean geometry | reads the card; `raw.card.confidence = high` |
| `confirm` | alignment 0.24-0.36, or a quality warning | reads the card, asks the desk to confirm the corners |
| `retake` | alignment 0.16-0.24 | HTTP 422 `card_not_detected` with the reasons |
| `reject` | alignment < 0.16 or implausible geometry | HTTP 422 `card_not_detected` with the reasons |

The scan response gains `raw.card.confidence`, `decision`, `alignment`,
`alignmentMargin`, `featureInliers`, `reasons` and `quality` (sharpness, glare,
brightness). `detectedBy` is now one of `template_features`, `card`, `table`,
`prewarped` or `corners`. `card_not_detected` now names the reason instead of saying
only that nothing was found.

### Measured on the 111 raw photos

`python eval_detection.py --photos ../../.tmp/scorecard-samples/raw --reference
../../.tmp/card-gt.json` compares against independent corners matched from the
reference warps:

- matched: 111/111 (before: 97/111, 14 not found)
- decisions: 108 accept, 2 confirm, 1 reject; none accepted with a corner error
  above 80 px
- corner error: median 7.8 px, 98/111 within 20 px, 109/111 within 40 px,
  111/111 within 80 px
- alignment score: median 0.489 (reference warps: 0.31-0.48)
- 0.2-0.3 s per photo

### End-to-end digits are not production ready yet

`python eval_end_to_end.py --photos ../../.tmp/scorecard-samples/raw --reference
../../.tmp/scorecard-samples/prepared/rectified_v2 --limit 30` reads the raw photo
and its reference warp with the same model and compares all 72 cells. All 30 photos
passed detection (0 rejected), but only 0.236 of cells matched on the median card
(worst 0.125, best 0.931) and no card matched on every cell. The rectification is
not the cause: the raw warp's printed table sits within a few pixels of the template
(`tableLevelled` true, `tableQuad` within ~6 px) and scores higher than the reference
warp. The readings differ because the model drifts on these photos: it reads 3 where
the card says 4 or 5, and it reports low digits on empty cells. That is the same
4/5/6 confusion noted above.

So: raw-photo **detection and rectification** are usable, and the reader now refuses
a card it cannot align instead of returning digits from the wrong ink. Raw-photo
**digit accuracy** still needs a better model (a training set of the real card under
real phone conditions) before this is claimed as production ready. The desk review
step stays.

### Learned detector (YOLOv8 segmentation): workflow, not trained

A learned detector is the right answer only if the geometric path is not enough on
new photos. It is **not trained here**: there are no annotated full scorecard photos,
and the digit-cell crops are a different task and must not be reused. No YOLO metrics
are reported because there is no held-out annotated set to measure them on.

The workflow to prepare one:

1. Collect raw photos, one directory per physical photograph. Consent rules apply;
   keep the private original and the public copy separate, as for every other photo.
2. Annotate each photo with one polygon per card (YOLOv8 segmentation, four points in
   TL, TR, BR, BL order, single class `scorecard`). Export as
   `labels/<stem>.txt` with `class x1 y1 x2 y2 ...` normalised to the image size.
3. Split by photograph, never by crop or augmented copy; augmentation happens only
   inside the training split.
4. `yolo segment train model=yolov8n-seg.pt data=igcc-cards.yaml imgsz=1024 epochs=100`
   then `yolo export model=runs/segment/train/weights/best.pt format=onnx`.
5. Score it with the same tools as the geometric detector:
   `python eval_detection.py --photos <dir> --reference <corners.json>`, and compare
   recall, false positives, corner error and the rectification rate against the
   template matcher on the same held-out photos before changing the default.

A detector is only worth switching to if it beats the template matcher on unseen
photos where the printed card is partly covered or the reference card does not match
the print run.
