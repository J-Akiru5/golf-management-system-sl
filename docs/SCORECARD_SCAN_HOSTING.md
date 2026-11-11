# Hosting the scorecard reader

The card reader is a separate Python service. The Next.js app calls it through
`SCAN_INFERENCE_URL`; the app never runs OpenCV or the model itself.

This document covers the Render deployment. The service also runs anywhere that
can build `scripts/scan/Dockerfile`.

## What gets deployed

- `scripts/scan/Dockerfile`: Python 3.12, OpenCV headless, FastAPI, uvicorn.
  It copies `models/igcc-card-template.npz` (card detection) and
  `models/classes.json` (class order) into `/app/models`.
- `render.yaml`: Render Blueprint for the `igcc-scorecard-reader` web service.
  It runs `SCAN_MODEL_BACKEND=local_onnx`, so the service reads the card with its
  own ONNX model and makes no Roboflow call at run time.
- The service listens on Render's `PORT`, exposes `/health` and `/scan`, and
  requires the bearer token in `SCAN_INFERENCE_TOKEN` when that variable is set.

The `.onnx` weights are not in Git (`models/*.onnx` is ignored on purpose), so
the service fetches them once at startup into `/app/models`, checks the
SHA-256 and only then loads the file. See `igcc_scan/model_fetch.py`.

## Before deploying

1. Merge the reader PR into `develop`. The Blueprint deploys the `develop`
   branch, and the Dockerfile must be there.
2. Upload the model file. See "Upload the model" below.
3. Have the Render account and the GitHub repository connection ready.

## Upload the model

The weights live outside Git. The owner uploads them once, then sets three
variables on the Render service.

1. Build or export the model as described in `docs/SCORECARD_SCAN_MODEL.md`.
   The file the service expects is `igcc-scorecard-digits.onnx`.
2. Upload that file to the private bucket, for example
   `models/igcc-scorecard-digits.onnx` in Cloudflare R2. Keep the bucket private.
3. Copy the SHA-256 of the uploaded file. On Windows:

```powershell
Get-FileHash .\igcc-scorecard-digits.onnx -Algorithm SHA256
```

   The output is the value for `SCAN_MODEL_SHA256` (64 hexadecimal characters).
4. Set on the Render service, all three marked `sync: false` in `render.yaml`:
   - `SCAN_MODEL_URL`: the https URL the container downloads from.
   - `SCAN_MODEL_SHA256`: the hash from step 3.
   - `SCAN_MODEL_URL_TOKEN`: optional. Only set it when the server expects a
     bearer token; the service then sends `Authorization: Bearer <token>`.

Notes that matter in practice:

- Only `https` is accepted. `http` and other schemes are refused.
- The URL query string is not logged. A presigned or signed URL therefore works
  as the download source. It must still be valid when the container starts,
  because a fresh container downloads the model again. An expiring signature
  will break the next cold start, so prefer a URL that stays valid, or refresh
  the value before it expires.
- `SCAN_MODEL_SHA256` is required whenever `SCAN_MODEL_URL` is set. A file whose
  hash does not match is deleted and never loaded.
- The body is capped at 50 MB.
- If the fetch fails the service still starts. `/health` reports
  `available: false` and `configurationError: "set; see service log"`, and
  `/scan` returns HTTP 503 `model_config_error`. That is the same behaviour as a
  bad `SCAN_MODEL_PATH` and no scores are returned. The photo stays in the app
  for manual entry.
- A model already present at `SCAN_MODEL_PATH` is used as it is; nothing is
  downloaded. That is how a local image with the weights baked in keeps working.

## Render Blueprint

1. In Render, choose **New > Blueprint**.
2. Connect `J-Akiru5/golf-management-system-sl` and select the `develop` branch.
3. Render reads `render.yaml` and creates `igcc-scorecard-reader`.
4. Set `SCAN_MODEL_URL`, `SCAN_MODEL_SHA256` and, if needed,
   `SCAN_MODEL_URL_TOKEN` in the service's Environment tab. They are marked
   `sync: false` on purpose and are never committed.
5. Deploy. The first build installs the Python dependencies and takes a few
   minutes. The first container start downloads the model.
6. Open the service URL + `/health`. Expected:

```json
{"ok":true,"service":"igcc-scorecard-scan","configured":true,"backend":"local_onnx","available":true,...}
```

`available: false` means the model file is missing or could not be fetched.
`configured: false` means the backend resolved to `none`, which should not
happen with the values in `render.yaml`.

## Environment variables

| Variable | Value | Notes |
| --- | --- | --- |
| `SCAN_MODEL_BACKEND` | `local_onnx` | The service runs its own ONNX model |
| `SCAN_MODEL_PATH` | `/app/models/igcc-scorecard-digits.onnx` | Destination for the download |
| `SCAN_MODEL_CLASSES` | `/app/models/classes.json` | Committed class order |
| `SCAN_CARD_TEMPLATE` | `/app/models/igcc-card-template.npz` | Committed card-detection template |
| `SCAN_MODEL_URL` | https URL | Private, set in the dashboard, never in Git |
| `SCAN_MODEL_SHA256` | 64 hex characters | Required with the URL; a mismatch is refused |
| `SCAN_MODEL_URL_TOKEN` | secret or empty | Optional bearer token for the download |
| `SCAN_CARD_MODE` | `auto` | Card outline, then printed-table fallback |
| `SCAN_CONFIDENCE_THRESHOLD` | `0.60` | Lower-confidence cells stay null |
| `SCAN_CLASSIFY_CONCURRENCY` | `3` | Worker threads for the 72 cell crops |
| `SCAN_INFERENCE_TOKEN` | generated by Render | Must match Vercel |
| `SCAN_MAX_UPLOAD_BYTES` | `15728640` | 15 MB |

The hosted Roboflow backend still exists in the code for local experiments. It
is no longer in the Blueprint: `ROBOFLOW_API_KEY` and `ROBOFLOW_MODEL_ID` are not
set on Render.

## Connect Vercel

Set these in the Vercel project `golf-management-system-sl` for **Production**
(and Preview if previews are used):

```text
SCAN_INFERENCE_URL=https://<service-name>.onrender.com/scan
SCAN_INFERENCE_TOKEN=<the generated token>
```

The URL must end in `/scan`. After saving, redeploy the app or push a commit to
`develop`; the next deployment picks up the variables. The app's extract route
will then return `available: true` and a draft. If the service is unreachable or
returns an error, the photo is still stored and the desk can enter scores by
hand.

## Smoke tests

```powershell
# Health
curl.exe https://<service-name>.onrender.com/health

# Authorised scan (use a test card, not a player's private photo)
curl.exe -X POST https://<service-name>.onrender.com/scan `
  -H "Authorization: Bearer <token>" `
  -F "image=@C:\path\to\test-card.jpg" `
  -F "mode=individual" `
  -F "template=igcc-paper"
```

Expected: HTTP 200 with `players[]`, 18 holes per row, and nulls where the model
is not confident. A 401 means the token is missing or wrong. A 422
`card_not_detected` means neither the card edge nor the printed table was found;
the desk should use the photo + manual path. A 503 `model_config_error` means the
model file could not be fetched or loaded; check `/health` and the service log.

## Cost and cold starts

- `plan: starter` keeps the service warm. The Render free plan spins down and a
  cold start can exceed the app's 60-second reader timeout.
- The model runs in the container, so a card costs no inference credits and makes
  no network call for the 72 cells.
- A fresh container downloads the model once. That adds the download time to the
  first start; on a warm service it does not happen again.
- Digit accuracy on raw phone photos is not production ready yet. The end-to-end
  check in `docs/SCORECARD_SCAN_MODEL.md` matched only 0.236 of cells on the
  median raw photo, and no card matched on every cell. Treat the reader as an aid
  and keep the desk review. The desk still sees the photo and every cell, corrects
  what is wrong, and the ordinary approval step is unchanged.

## Local container test

From the repository root, when Docker and network access are available:

```powershell
docker build -f scripts/scan/Dockerfile -t igcc-scorecard-reader scripts/scan
docker run --rm -p 8000:8000 `
  -e SCAN_MODEL_BACKEND=local_onnx `
  -e SCAN_MODEL_PATH=/app/models/igcc-scorecard-digits.onnx `
  -e SCAN_MODEL_CLASSES=/app/models/classes.json `
  -e SCAN_CARD_TEMPLATE=/app/models/igcc-card-template.npz `
  -e SCAN_MODEL_URL=$env:SCAN_MODEL_URL `
  -e SCAN_MODEL_SHA256=$env:SCAN_MODEL_SHA256 `
  -e SCAN_MODEL_URL_TOKEN=$env:SCAN_MODEL_URL_TOKEN `
  -e SCAN_CARD_MODE=auto `
  igcc-scorecard-reader
curl.exe http://127.0.0.1:8000/health
```

`available: true` and `backend: local_onnx` means the model was fetched and
loaded. To test a model baked into the image instead, mount or copy the file to
`/app/models` and leave the three `SCAN_MODEL_URL*` variables out.

## Security

- The model bucket stays private. The service receives the image bytes from the
  app, not a public URL.
- The bearer token is required on every `/scan` call when configured.
- Do not put a bucket token, a signed URL or a model file in the repository, the
  Blueprint, a log or a screenshot. The URL is not logged by the service, and the
  query string is never put in an error message.
- The SHA-256 check is what makes the download trustworthy. An unverified file is
  deleted and never loaded.
- The service has no database credentials and cannot read Supabase or R2. The one
  outbound request it makes is the model download at startup.
- Rotate the token and the bucket credentials if either is exposed.

## Rollback

Set `SCAN_INFERENCE_URL` back to empty in Vercel and redeploy. The app returns to
photo + manual entry immediately; the Render service can stay up or be suspended.
No scoring data is affected.
