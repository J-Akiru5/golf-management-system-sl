# AVP demo video (throwaway branch)

Narrated onboarding video for the IGCC board. This branch is **disposable**: it holds the demo
fixtures and the recording scripts, and it is never merged or deployed. The product branches are
untouched.

Recorded from `v0.8.0` (`06a2748`). TeeLine branding only, no IGCC crest. Sample data only.

## Rebuild

1. Python venv at `C:\Users\Lenovo\.avp\venv` with `kokoro-onnx`, `soundfile`, `faster-whisper`; the
   Kokoro model and voices at `C:\Users\Lenovo\.avp\models`.
2. `pnpm install`
3. `pnpm dev --port 3019` (no Supabase variables, so the app is in demo mode)
4. `pnpm avp:audio` — writes `demo-video/audio/*.wav` and `durations.json`
5. `pnpm avp:capture` — records each scene to `demo-video/capture/raw/`
6. `pnpm avp:build` — writes `demo-video/out/avp-5min.mp4`, `avp-90s.mp4`, `.srt`, `chapters.txt`,
   `poster.jpg`

Files under `audio/`, `capture/raw/`, `build/work/` and `out/` are git-ignored.

## Demo-only changes on this branch

- `demo-video/fixtures/`: a frozen draw generated with the real engine.
- `src/lib/store/state.ts`: loads the draw into the demo board (starts unpublished, so the video can
  publish in scene 7).
- `src/lib/demo/data.ts`: generic payment and response-email values.
- `src/lib/demo/avp-public-form.ts` and the entry page: render the public form in demo mode.

Do not cherry-pick these into a product branch.
## How the picture is made

- `steps.json` holds the scenes, the narration split into caption-sized lines, and the focus events
  (target, spotlight, zoom, cursor, click).
- `avp:audio` synthesizes each line separately and writes `audio/timeline.json`, the clock for the
  captions, cursor, spotlight and zoom. Voice and picture cannot drift.
- `record.mjs` injects the overlay into every page: a step chip, a subtitle bar, a dimming spotlight
  with a hole over the target, an animated gold cursor with a click ripple, and a CSS zoom on `main`.
- A proof can be recorded without the full set: `$env:AVP_SCENES="03-setup,06-draw"; pnpm avp:capture`
  then `pnpm avp:build` writes `out/avp-style-proof.mp4`.
