# Model files

Put the Roboflow ONNX export here, or anywhere outside the repository, and point
`SCAN_MODEL_PATH` at it. Model binaries are ignored by Git; never commit them.

Expected local adapter contract:

- classification model, one cell crop per image;
- input `NCHW` float32, `1 x channels x size x size` by default;
- classes in the same order as the export, listed in `classes.json` (or beside
  the model with the same stem);
- output one score vector, either probabilities or logits.

`classes.example.json` is a starting list for a digit-only bootstrap model. If the
trained dataset includes `10`..`20`, add those labels there too. The labels must
match the Roboflow class folder names exactly.

Set `SCAN_MODEL_INPUT_SIZE`, `SCAN_MODEL_INPUT_CHANNELS`,
`SCAN_MODEL_INPUT_LAYOUT` and `SCAN_MODEL_INPUT_NORMALIZE` to match the export.
The service validates a static input shape and refuses a mismatched model.
