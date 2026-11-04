# Model files

Model binaries are ignored by Git; never commit one. Two routes put a model here.

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
