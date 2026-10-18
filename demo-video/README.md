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

