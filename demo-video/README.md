# AVP demo video (throwaway branch)

Narrated onboarding video for the IGCC board. This branch is **disposable**: it holds the demo
fixtures and the recording scripts, and it is never merged or deployed. The product branches are
untouched.

Recorded from `v0.9.0` (`300b7b0`). TeeLine branding only, no IGCC crest. Sample data only.

## Rebuild

1. Python venv at `C:\Users\Lenovo\.avp\venv` with `kokoro-onnx`, `soundfile`, `faster-whisper`; the
   Kokoro model and voices at `C:\Users\Lenovo\.avp\models`.
2. `pnpm install`
3. `pnpm dev --port 3019` (no Supabase variables, so the app is in demo mode)
4. `pnpm avp:audio` — writes `demo-video/audio/*.wav` and `audio/timeline.json`
5. `pnpm avp:capture` — records each scene to `demo-video/capture/raw/`
6. `pnpm avp:build` — writes `demo-video/out/avp-5min.mp4`, `avp-90s.mp4`, `.srt`, `chapters.txt`,
   `poster.jpg`

Files under `audio/*.wav`, `capture/raw/`, `capture/timing.json`, `build/work/` and `out/` are git-ignored.

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
  captions, cursor, spotlight and zoom. Voice and picture cannot drift. A line can carry
  `pauseAfter` seconds of silence, used to cover page loads.
- `record.mjs` injects the overlay into every page: a step chip, a subtitle bar, a dimming spotlight
  with a hole over the target, an animated gold cursor with a click ripple, and a CSS zoom on `main`.
- A proof can be recorded without the full set: `$env:AVP_SCENES="03-setup,06-draw"; pnpm avp:capture`
  then `pnpm avp:build` writes `out/avp-style-proof.mp4`.

## Focus protocol

Owner feedback drove these rules; keep them when editing `steps.json`.

1. Every screen change shows the full page first. Scenes hold 1.2 s (`clockOffsetMs`) before the first
   focus move; a route inside a scene is covered by a `pauseAfter` on that line plus a 0.5 s beat.
2. Focus is one motion. Cursor travel (0.45 s) and zoom (0.5 s) start together, and the ring goes up at
   the same moment on the same curve. The ring's final geometry is computed from the target's layout
   rect (origin-free transform maths), so it is exact when the move lands and never has to snap or
   catch up. Each target is resolved and scrolled into view during the idle gap before its line, so
   selector cost never delays the ring.
3. The caption never covers the control. It sits at the bottom unless the target reaches into the
   caption strip, in which case it moves to the top; tall targets that touch both keep the bottom.
4. The page load must not push the picture out of step. The recorder flashes one bright frame before
   the clock starts, finds the last flash frame with ffmpeg and trims to it. Wall-clock offsets cannot
   do this job: the screen recorder slows its clock whenever the page paints nothing.
5. The phone is shown when the phone is mentioned. `cards/phone.html` is generated from the published
   fixture by `tools/generate-phone.mjs` and is the visual for the mobile scene.
6. Zooms never break the frame. A target too large to fit stays at 1:1 instead of being magnified, and
   a target on the left half pans the page right just enough to keep its left edge clear of the rail.

## Fluidity

The screencast is 25 fps, so the build encodes at 25 fps: forcing 30 duplicated frames twice a second
and read as judder. The capture context rasterises at `deviceScaleFactor: 0.75` (layout stays 2560,
frames come out 1920 wide, which is the delivered size) so the renderer keeps up during moves, and the
zoom target carries a compositor hint. Check a cut by pulling frames from any 2 s window that contains
a move; every frame should be distinct:

```bash
ffmpeg -y -ss 47.4 -t 2.2 -i out/avp-5min.mp4 -fps_mode passthrough frames/f%03d.png
Get-ChildItem frames/*.png | ForEach-Object { (Get-FileHash $_ -Algorithm MD5).Hash } | Sort-Object -Unique | Measure-Object
```
