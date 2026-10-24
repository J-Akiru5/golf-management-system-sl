# Local scorecard scan service

Python service for the optional card reader used by the Next.js app. It implements
`POST /scan` with the contract in `docs/SCORECARD_SCAN.md`, crops the printed IGCC
paper card into 72 score cells (four player rows), and classifies each cell with a
Roboflow model.

**No model binary is committed.** A bootstrap Roboflow classification model was
trained on the one filled card and is served through the hosted adapter. It is not
a validated reader. With no model configured the service returns HTTP 503 and a
clear JSON body. It never invents scores. The only filled card available produced
72 crops for testing; one card is not a training set.

## Quick start (no model)

Python 3.11 or newer is required (tested on 3.12).

```powershell
cd scripts\scan
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pytest
uvicorn igcc_scan.app:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe -X POST http://127.0.0.1:8000/scan `
  -F "image=@C:\path\to\card.jpg" `
  -F "mode=individual" `
  -F "template=igcc-paper"
```

Expected while unconfigured: HTTP 503 with
`{"ok":false,"available":false,"reason":"model_not_configured",...}` and an empty
`players` list. The app keeps the photo and the desk enters scores by hand.

Linux/macOS:

```bash
cd scripts/scan
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest
uvicorn igcc_scan.app:app --host 127.0.0.1 --port 8000
```

## Local ONNX model

Download the Roboflow classification export and place it outside the repository (or
under `models/`, which ignores binaries). Then:

```powershell
$env:SCAN_MODEL_BACKEND="local_onnx"
$env:SCAN_MODEL_PATH="C:\models\igcc-digits.onnx"
$env:SCAN_MODEL_CLASSES="C:\models\classes.json"
$env:SCAN_ENGINE_NAME="igcc-digits"
$env:SCAN_ENGINE_VERSION="1"
uvicorn igcc_scan.app:app --host 127.0.0.1 --port 8000
```

`classes.json` is a list or an index-to-label object in the same order as the model
output. Labels are `blank`, `unreadable`, or a score digit `1`..`20`. A low-confidence
or unrecognised label becomes `strokes: null`. See `models/README.md`.

The adapter expects a 4-D image tensor. Defaults are `1 x 1 x 64 x 64`, float32,
0..1, NCHW. If the export uses RGB, 224x224, NHWC or different normalisation, set
`SCAN_MODEL_INPUT_SIZE`, `SCAN_MODEL_INPUT_CHANNELS`, `SCAN_MODEL_INPUT_LAYOUT` and
`SCAN_MODEL_INPUT_NORMALIZE`. A static shape mismatch is refused at startup.

## Hosted Roboflow (untested)

```powershell
$env:SCAN_MODEL_BACKEND="roboflow_hosted"
$env:ROBOFLOW_API_KEY="<set in the process environment, never commit it>"
$env:ROBOFLOW_MODEL_ID="<workspace>/<project>/<version>"
uvicorn igcc_scan.app:app --host 127.0.0.1 --port 8000
```

This adapter follows the documented `serverless.roboflow.com/{model_id}` multipart
API. It has not been exercised against a live project because no key was available.
It sends one request per cell, so 72 requests per card and 72 inference credits.
Prefer the local export for a real deployment.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCAN_MODEL_BACKEND` | `auto` | `auto`, `none`, `local_onnx`, `roboflow_hosted` |
| `SCAN_MODEL_PATH` | unset | Local `.onnx` file |
| `SCAN_MODEL_CLASSES` | unset | Class list; falls back to `classes.json` beside the model |
| `SCAN_MODEL_INPUT_SIZE` | `64` | Square model input size |
| `SCAN_MODEL_INPUT_CHANNELS` | `1` | `1` or `3` |
| `SCAN_MODEL_INPUT_LAYOUT` | `nchw` | `nchw` or `nhwc` |
| `SCAN_MODEL_INPUT_NORMALIZE` | `unit` | `unit`, `minus_one_one`, `imagenet`, `none` |
| `SCAN_CONFIDENCE_THRESHOLD` | `0.60` | Below this, the cell is null |
| `SCAN_ENGINE_NAME` | `igcc-cell-classifier` | Returned as `engine` |
| `SCAN_ENGINE_VERSION` | `0.1.0` | Returned as `engineVersion` |
| `ROBOFLOW_API_KEY` | unset | Hosted inference only |
| `ROBOFLOW_MODEL_ID` | unset | Hosted model id |
| `ROBOFLOW_INFERENCE_URL` | `https://serverless.roboflow.com` | Hosted base URL |
| `ROBOFLOW_TIMEOUT_SECONDS` | `10` | Per-cell request timeout |
| `SCAN_CLASSIFY_CONCURRENCY` | `6` | Parallel cell requests or local runs |
| `SCAN_INFERENCE_TOKEN` | unset | If set, require `Authorization: Bearer <token>` |
| `SCAN_CARD_MODE` | `auto` | `auto` detects the card; `prewarped` accepts an 1800x1000 card |
| `SCAN_CARD_CORNERS` | unset | `x,y x,y x,y x,y` or JSON, TL TR BR BL |
| `SCAN_CARD_ROTATION` | unset | Force 0/90/180/270 after rectification |
| `SCAN_MASK_DOTS` | `0` | Enable the optional printed-dot mask |
| `SCAN_MAX_UPLOAD_BYTES` | `15728640` | Request image limit |
| `SCAN_DEBUG_DIR` | unset | Write `card_rectified.png` for troubleshooting |

The Next.js app sets `SCAN_INFERENCE_URL` to this service's `/scan` URL, and
optionally `SCAN_INFERENCE_TOKEN` to the same value as above. Those variables live in
the app, not here.

## HTTP behaviour

| Status | Meaning |
| --- | --- |
| `200` | Contract result; every player has holes 1-18 exactly once |
| `400` | Empty/invalid image, bad mode or unknown template |
| `401` | Missing/wrong bearer token when configured |
| `413` | Image above the upload limit |
| `422` | Card outline not found; no cells were guessed |
| `502` | Model inference failed |
| `503` | No model configured, or model configuration could not start |

A successful result is the exact shape the app already normalizes. Unreadable cells
are `null`, not zero or par. Confidence is 0..1. `writtenTotal` and `name` are
currently `null`; reading handwriting names/totals is a separate model.

`GET /health` reports whether a model is configured without exposing keys.
`GET /template` returns the cell geometry.

## Card geometry

The template is the printed IGCC card from `golf score Sheet.jpg`, rectified to
**1800 x 1000** pixels. The photo is rotated 90 degrees; the measured corners are in
`igcc_photo_calibration.json`.

```text
0,0                                                          1800,0
  +--------------------------------------------------------------+
  |  club header, event, flight number                            |
  |  +--------------------------------------------------------+  |
  |  | name | 1..9 | OUT | 10..18 | IN | TOTAL | HCP | NET |  |  |
  |  | row0 |      |     |        |    |       |     |     |  |  |
  |  | row1 |      |     |        |    |       |     |     |  |  |
  |  | row2 |      |     |        |    |       |     |     |  |  |
  |  | row3 |      |     |        |    |       |     |     |  |  |
  |  +--------------------------------------------------------+  |
  |  LADIES PAR / HANDICAP rows, date, signatures                 |
  +--------------------------------------------------------------+
```

- Table: x 115..1733, y 240..770. The table includes LADIES PAR (`678..725`) and
  HANDICAP (`725..770`). The table is levelled from its printed border after the
  card warp, which removes the residual skew that used to clip the right side of
  rows.
- Hole cells: 18 columns, x from 383 to 1492, separated by the OUT column.
- Name column: x 115..383.
- Player rows: `435..486`, `486..531`, `531..582`, `582..627`.
  On the available card rows 0 and 2 are empty; rows 1 and 3 carry the two
  handwritten scores. The card has a fifth printed score line at `627..678`; the
  template reads the four rows a normal group uses.
- Total column: x 1549..1608.
- Cell crops are inset by 5 px. The printed grid can still appear at the bottom
  edge of a crop; training must use the same crop convention.
- Printed handicap dots: this card prints the stroke indexes in the separate
  HANDICAP row and has no printed dots in the score cells. `CardTemplate` keeps
  `mask_printed_dots=False` so the mask cannot eat the top of a handwritten digit.
  The mask implementation and tests are kept for a future print run that really
  prints dots; enable it with `prepare_dataset.py --mask-dots` or
  `SCAN_MASK_DOTS=1`. On this card the mask produced false positives on pen
  strokes, so it is off by default.

Automatic detection tries the card outline first: it accepts a quadrilateral with
the card's 1.8 aspect ratio. If the hand or background hides the edge, it falls
back to the printed table (about 3.05 aspect), maps that rectangle onto the
template table and keeps the card frame. That fallback was tested on the one real
photo, where the card outline is not detectable. If neither shape is found, the
service returns `card_not_detected` rather than guessing. For a fixed camera, set
`SCAN_CARD_CORNERS`; for an already-cropped image, set `SCAN_CARD_MODE=prewarped`.
The dataset script uses the measured calibration.

## Bootstrap dataset

```powershell
cd scripts\scan
python prepare_dataset.py `
  --image "C:\Users\Lenovo\Downloads\golf score Sheet.jpg"
```

Defaults: output `<repo>\.tmp\scan-dataset`, 2 synthetic variants per cell. The
output contains:

- `card_rectified.png`
- `card_cells_overlay.png` (check this first)
- `crops/` raw cells, `masked/` cells after the optional dot mask (a copy when
  the mask is off, as on this card), `augmented/` synthetic variants
- `manifest.json`, `manifest.jsonl` (source SHA-256, boxes, labels, augmentation params)
- `labels.template.json` (all null; fill in only what a human can read)
- `roboflow/` classification layout, populated only when labels exist

The manifest always says `trainable: false`. One card, even with 144 synthetic
variants, is bootstrap data. Do not report accuracy from it and do not create a
validation split from the same card.

The dot mask is off for this card. Add `--mask-dots` only for a print run that
really prints handicap dots inside the score cells; otherwise it can eat pen strokes.

To label:

1. Open `card_cells_overlay.png` and `crops/`.
2. Fill `labels.template.json`: integer `1`..`20`, `"blank"`, `"unreadable"`, or
   leave `null`.
3. Rerun with `--labels`:

```powershell
python prepare_dataset.py `
  --image "C:\Users\Lenovo\Downloads\golf score Sheet.jpg" `
  --out "..\..\.tmp\scan-dataset" `
  --labels "..\..\.tmp\scan-dataset\labels.template.json"
```

Upload dry run (no key, no network):

```powershell
python upload_to_roboflow.py `
  --dataset "..\..\.tmp\scan-dataset" `
  --dry-run --allow-bootstrap
```

A real upload needs `ROBOFLOW_API_KEY`, `--workspace`, `--project` and the
`--allow-bootstrap` acknowledgement. It is deliberately not tested here. See
`docs/SCORECARD_SCAN_MODEL.md`.

## Tests

```powershell
python -m pytest
```

The suite covers the app contract, template geometry, dot masking, synthetic card
detection and rectification, prewarped mode, orientation scoring, the no-model 503
path, bearer auth, the dataset manifest and label handling. It needs no model and no
real photo.

## Files

```text
scripts/scan/
  igcc_scan/
    app.py          FastAPI routes
    pipeline.py     image -> contract
    rectify.py      decode, detect, warp, orientation
    geometry.py     IGCC 1800x1000 template
    cells.py        crop, dot mask, model input
    classify.py     ONNX and Roboflow-hosted adapters
    contract.py     mirror of the app's normalize.ts
    dataset.py      bootstrap crops and manifest
    config.py       environment settings
  prepare_dataset.py
  upload_to_roboflow.py
  igcc_photo_calibration.json
  models/classes.example.json
  tests/
```

## Limits and safety

- No model binary is committed. The bootstrap Roboflow model was trained on one
  card; more filled cards are still missing.
- The card reader never approves a card. The desk reviews every cell.
- One card only; the two handwritten rows are the only real handwriting examples.
- Names are personal data. Do not commit card photos, crops containing names, or
  derived datasets. `.tmp/` is ignored; the repository holds no image.
- The service binds to localhost in the documented commands. If it is exposed,
  set `SCAN_INFERENCE_TOKEN` and put it behind the app, not the public internet.
- No secrets, `.env.local` or model binaries belong in Git.
