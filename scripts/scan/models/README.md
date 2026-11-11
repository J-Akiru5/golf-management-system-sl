# Model files

Model binaries are ignored by Git; never commit one. Three routes put a model here.

## Roboflow cannot export this project to ONNX

Project `igcc-scorecard-digits-v2` is a single-label classification project
(`modelType: vit`). The export API refuses ONNX:

    HTTP 400 {"error":"onnx is an invalid format for project type classification.
    Please use one of: folder, clip."}

Version 4 lists `exports: ["folder"]`. The trained weights therefore stay on the
Roboflow host, and the only extractable artefact is the labelled cell dataset.

## Route 1: train and export locally (current)

`../train_onnx.py` downloads the `folder` export, trains a small convolutional
network on the same labelled cells and writes both files here:

```powershell
cd scripts/scan
python -m pip install -r requirements-train.txt
$env:ROBOFLOW_API_KEY="<process environment only>"
python train_onnx.py --project lou-vincent-j-baroro-s-workspace/igcc-scorecard-digits-v2/4
```

Output: `igcc-scorecard-digits.onnx` (ignored by Git) and `classes.json` (small,
committed, fixes the output order).

## Route 2: a Roboflow ONNX export

If Roboflow later offers ONNX for this project type, drop the file here, or point
`SCAN_MODEL_PATH` at it anywhere outside the repository, and add a `classes.json`.

Expected local adapter contract:

- classification model, one cell crop per image;
- input `NCHW` float32, `1 x channels x size x size` by default;
- classes in the same order as the export, listed in `classes.json` (or beside
  the model with the same stem);
- output one score vector, either probabilities or logits.

`classes.example.json` is a digit-only starting list. The trained model uses the
project's own class folders: `1`..`9`, `blank`, `unreadable` and `x`.

Set `SCAN_MODEL_INPUT_SIZE`, `SCAN_MODEL_INPUT_CHANNELS`,
`SCAN_MODEL_INPUT_LAYOUT` and `SCAN_MODEL_INPUT_NORMALIZE` to match the export.
The service validates a static input shape and refuses a mismatched model.

## Route 3: a private bucket, fetched at container start

The Render container has no model file, because `models/*.onnx` is ignored. The
owner uploads `igcc-scorecard-digits.onnx` to a private bucket and sets three
variables on the service. At startup `igcc_scan/model_fetch.py` downloads the
file into `/app/models`, checks the hash and only then loads it:

```text
SCAN_MODEL_URL=https://<private bucket>/models/igcc-scorecard-digits.onnx
SCAN_MODEL_SHA256=<64 hexadecimal characters>
SCAN_MODEL_URL_TOKEN=<optional bearer token>
```

Get the hash with `Get-FileHash .\igcc-scorecard-digits.onnx -Algorithm SHA256`.
The URL must be https, the body is capped at 50 MB, and `SCAN_MODEL_SHA256` is
required whenever a URL is set: a file whose hash does not match is deleted and
never loaded. If the fetch fails the service starts anyway and `/scan` answers
503 `model_config_error`, exactly as for a bad `SCAN_MODEL_PATH`. If the file is
already at `SCAN_MODEL_PATH`, nothing is downloaded, so an image with the weights
baked in keeps working. Do not commit the file, the token or a signed URL.

Deployment details are in `docs/SCORECARD_SCAN_HOSTING.md`. Digit accuracy on raw
phone photos is not production ready yet (`docs/SCORECARD_SCAN_MODEL.md`), so the
desk review stays.

## Card detection template

`igcc-card-template.npz` is the reference used by feature-based card detection. It
holds SIFT keypoints and descriptors plus the reference size, not an image, so no
photograph of a filled card is committed. Rebuild it from a rectified card with
`python build_card_template.py --card <rectified card>`; a clean blank card is
preferred, because handwriting adds features that will not match another card.
Set `SCAN_CARD_TEMPLATE` to point at a different file.
