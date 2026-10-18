# AVP production brief (for AI agents)

Audience for this file: coding agents that will build the TeeLine Golf AVP (audio-visual presentation).
Humans: this is the machine-readable twin of the plan the owner approved. Read `AGENTS.md` first; its
rules apply here.

Status: **draft, waiting on owner answers in section 3.** Do not start section 6 steps marked
`BLOCKED` until the owner has answered.

## 1. Goal

One narrated product demo of TeeLine Golf for **IGCC management and board**.

| Item | Value |
| --- | --- |
| Length | about 5 minutes (4:45 to 5:15 accepted) |
| Narration | AI voice, English, generated locally, no cloud TTS |
| Picture | scripted recording of the real app in demo mode, 1920x1080 |
| Main file | `avp-5min.mp4` (H.264, AAC, 30 fps) |
| Also | `avp-5min.srt`, `avp-90s.mp4` (cut from the same footage), `chapters.txt`, `poster.jpg` |
| Success test | A board member who has never seen the app can say what it does, what the organizer still decides, and what the club is being asked for |

Out of scope: live-action footage, generated imagery, music with unclear licence, anything that shows
real player data.

## 2. Facts (what was checked, and when)

Checked against the repo on 18 Oct 2026 (`develop` at `4a78494`, `package.json` 0.8.0). Re-check before
relying on any of these.

Verified by reading the code or the remote:

- The app runs on deterministic in-memory demo data when `NEXT_PUBLIC_SUPABASE_URL` is unset, and a
  page refresh resets it (`README.md`). Record in this mode so every run starts from the same state.
- Routes in `src/app`: `/` (public landing), `/admin` (control room), `/tournaments`, `/setup`,
  `/course`, `/import`, `/register`, `/draw`, `/print`, `/players`, `/spotlight`, `/pairings`
  (public), `/my` (player), `/enter/[id]` (public entry form), `/login`.
- `@playwright/test` ^1.64.1 is already a dependency and `scripts/verify-ui.mjs` shows how the repo
  launches Chromium. Reuse that style.
- Demo event name is "Bamboo Tee (demo sample title)". The tee ratings are placeholders
  (`src/lib/demo/data.ts`, "Placeholder ratings"). `AGENTS.md` forbids presenting them as IGCC's.
- Tags `v0.6.0` to `v0.8.0` exist on the remote. `main` is 2 commits behind `develop`; production is
  defined by the latest tag (`docs/VERSIONING.md`).

Found while preparing this brief, **needs the owner**:

- `src/lib/demo/data.ts` holds a payment block with the club's name, bank "PNB" and an account number,
  and a response email that looks personal. It is not known whether these are real. **Never show the
  Registration payment section, the response email, or any account number on screen** until the owner
  says they are fake or approved.

Not verified:

- The exact on-screen labels in every scene. Read them from the running app; do not trust the
  storyboard wording in section 7.
- How the organizer runs events today (needed for scene 1).
- Whether the IGCC crest may be used in a video that is shown outside the club.

## 3. Decisions the owner must make (blocking)

| # | Decision | Blocks | Default if the owner is silent |
| --- | --- | --- | --- |
| D1 | Organizer facts for scene 1: how entries, handicaps and groupings are handled today, real hours spent, real numbers | Scene 1 script | Scene 1 stays generic and says nothing numeric |
| D2 | The ask to the board (pilot at one event? budget? sponsor? date?) | Scene 9 script | No ask; the video ends on "next step is a pilot, to be agreed" |
| D3 | Voice choice from the samples (Piper lessac vs Kokoro af_heart / am_michael / bf_emma) | Step 4 | Kokoro `af_heart` |
| D4 | Crest and name use outside the club (the crest is the club's; "TeeLine" has no trademark clearance) | Public release only | Internal showing only, not uploaded publicly |
| D5 | Are the demo payment and email values fake (see section 2)? | Scene 3 and 5 framing | Hide those fields |
| D6 | Is `develop` frozen for recording? Open PRs change screens | Step 2 | Record from the latest tag, `v0.8.0` |

An agent that cannot get an answer must use the default, say so at the top of its PR, and carry on.
Do not guess data for D1 or D2.

## 4. Tool choice and why

The owner asked whether a skill, extension or library exists for this. Findings (checked 18 Oct 2026):

| Option | What it is | Verdict for this job |
| --- | --- | --- |
| **Playwright** (already a dev dependency) | Scripted browser, `recordVideo` | **Use.** Records the real app, deterministic, rerunnable |
| **ffmpeg** 6.1.1 (installed) | Assembly, captions, loudness, cuts | **Use** |
| **Kokoro-82M** via `kokoro-onnx` | Open-weight local TTS, Apache-2.0, 24 kHz | **Use for narration** (tested here, runs offline once the model is downloaded) |
| **Piper** (`piper-tts`) | Local TTS, lighter, lower quality class | Fallback. The old `rhasspy/piper` repo is archived and moved to `OHF-Voice/piper1-gpl`; check that licence before shipping a voice from it |
| **demofly** (npm, MIT) | CLI doing Playwright record + Kokoro TTS + assemble | **Optional shortcut, not adopted.** Maturity unclear (no version history on its page). Try it only as a spike; the repo-owned scripts below are the source of truth |
| **demodsl** (PyPI, "Beta", own community licence) | YAML-driven demo generator, 13 TTS providers | Not adopted: non-OSI licence, beta, deprecated renderer |
| **Remotion** (+ official skills via `npx skills add remotion-dev/skills`) | React-based video composition | **Not needed.** Free only for individuals, non-profits and for-profits with up to 3 employees; otherwise a paid company licence. Syntaxure Labs headcount is the owner's call. HTML title cards captured by Playwright do the same job |
| Claude Code marketplace plugins found (videodb, watch-video, Video Cleanup, video-shotcraft) | Analyse, clean up or compose video | **Not adopted.** None records an app or narrates it. `watch-video` is useful later for QA (keyframes + transcript of the finished file); `Video Cleanup` is for talking-head audio, not TTS |

Conclusion: there is no single skill that produces this video. The reliable stack is Playwright +
Kokoro + ffmpeg, which is the same shape as the SeePat demo (scripted capture of the real app, overlay
layer, cards, one voice track), with an AI voice instead of a human one.

Quality caveat for agents: the SeePat reference used a **human** narrator. A local AI voice is a
step down. Reduce the gap with short sentences, no acronyms the voice mispronounces, a pronunciation
list (section 8), and pauses between scenes. Do not claim "studio quality".

## 5. Layout and branches

```
demo-video/                 # all new files live here, none under src/
  README.md                 # how to rebuild, in 10 lines
  steps.json                # single source for scenes: id, route, title, caption, narration, timing
  narration/                # one .txt per scene (generated from steps.json, never hand-edited)
  audio/                    # per-scene wav + durations.json (generated, git-ignored)
  capture/record.mjs        # Playwright script
  capture/overlay.ts        # HUD, captions, highlight, tap ring (injected into the page)
  cards/                    # title, closing and "demo data" card HTML
  build/assemble.sh         # ffmpeg assembly
  out/                      # git-ignored
```

- Branch from `develop`; one PR per lane, into `develop`; the owner merges. Never push to `develop`.
- Do not modify `src/`. If the app needs a change to record cleanly (for example hiding a dev banner),
  stop and report it; that is a separate PR and a schema/UI decision for the owner.
- Large outputs (`*.wav`, `*.mp4`) are git-ignored. Only scripts, `steps.json` and the cards are
  committed.
- Pin the app to the commit being recorded and write that commit hash and `package.json` version into
  `demo-video/README.md` and the closing card.

## 6. Pipeline

Run in order. Each step lists its output and an acceptance check.

1. **Scaffold** (`demo-video/` tree, `.gitignore`, README, `pnpm` scripts `avp:audio`, `avp:capture`,
   `avp:build`). Check: `pnpm typecheck && pnpm lint` still pass.
2. **Freeze the app.** Check out the tag or commit from D6. `pnpm build && pnpm start` with no
   Supabase variables set. Check: `/admin` loads with demo data; refresh resets it.
3. **Write `steps.json` from section 7.** Read the real screens first and correct every label. Narration
   total 650 to 800 words. Check: a script reads `steps.json` and prints words per scene and a total.
4. **Generate audio first** (`BLOCKED` on D3 for the final voice; use the default to unblock).
   Kokoro, one wav per scene, 48 kHz mono after resampling, `durations.json` from `ffprobe`. Check:
   no clipped samples, each scene within 15% of its target time, pronunciation list applied.
5. **Capture to the audio.** `record.mjs` holds each scene for at least its audio duration plus 0.4 s.
   Viewport 1920x1080, device scale factor 1. Playwright's recorder writes 25 fps VP8 and ignores
   device scale factor, so do not rely on scaling; record at the real size. Use fixed clicks with
   waits on real UI state, not blind sleeps. Check: two runs produce the same scene order and the same
   visible numbers.
6. **Overlay layer.** Step chip, caption bar, gold highlight on the control being discussed, tap ring
   at each click, and a permanent small "Demo data" tag. Check: captions match `steps.json` exactly.
7. **Cards.** Title card, "Not shown today" card, closing card (version, commit, contact, the ask from
   D2). Design pass by the design lane; no external fonts or scripts (`AGENTS.md`).
8. **Assemble.** ffmpeg: concat cards and scenes, mix voice, burn captions, write `.srt`, loudness
   about -16 LUFS integrated with true peak at or below -1 dBTP, 30 fps H.264 + AAC, `+faststart`.
   Chapter file from scene starts. Check: `ffprobe` duration 4:45 to 5:15.
9. **90-second cut** from the same footage: scenes 2, 6, 7 and the ask. Check: under 95 s.
10. **QA** (section 9) by an agent that did not build it.

## 7. Storyboard (first draft; verify every label in the running app)

| # | Time | Scene | Route | Show | Narration intent (draft) |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:25 | Today's way | none (card) | Plain card, no screenshots | `D1`. Generic until the owner supplies facts |
| 2 | 0:25-0:55 | One desk | `/admin` | Control room: entries, draw state, readiness | Everything for one event is on one screen |
| 3 | 0:55-1:30 | Set up the event | `/setup`, `/course` | Event settings, course and tees, Review and readiness, Save all changes | Rules are settings the organizer controls, not code. Say the tee ratings are samples |
| 4 | 1:30-2:10 | Handicaps | `/import` | Import the sample file, the match queue | Unmatched or conflicting players wait for a person |
| 5 | 2:10-2:50 | Entries | `/register`, `/enter/[id]` | Registration desk; public entry link; entry lands as Needs review | Players enter online; nothing is trusted until the desk confirms |
| 6 | 2:50-3:40 | The draw | `/draw` | Make the draw, Checks, move a player with a reason, lock, re-run keeps locks | The system proposes; the organizer decides and can override with a reason |
| 7 | 3:40-4:10 | Publish and player view | `/draw`, `/pairings`, `/my` | Publish, then the phone view | Players only see the frozen published version |
| 8 | 4:10-4:35 | Print center | `/print` | Start sheet, scorecards | Paper still works on the day |
| 9 | 4:35-5:00 | Safe, and next | cards | Roles, acceptance test, the ask | `D2`. Who can change what; pilot proposal |

"Not shown today" card (these do not exist in the app; do not imply them): Excel import, direct NGAP
connection, online payment, offline use, official scoring.

Rules for every scene: no real player names or photos; sample names only. Do not display payment or
email fields (section 2). Do not say a rule is "IGCC's rule" unless it is marked confirmed in
`docs/spec/IGCC_Tournament_Desk.md`.

## 8. Voice and caption spec

- Plain language, short sentences, 12 to 18 words average. Say "the organizer", not "the admin".
- No marketing words, no em-dash pile-ups (`AGENTS.md`). Say "draw", not "algorithm".
- Spell out: "IGCC" as "I G C C", "NGAP" as "N G A P", "TeeLine" as "Tee line". Keep a
  `pronunciation.json` and apply it before synthesis.
- Pace: Kokoro tested here at roughly 180 words per minute on a three-sentence sample. Aim for
  about 140 to 160 by setting speed below 1.0 and adding 0.4 s gaps between lines. Measure; do not
  assume.
- Captions: burned in at 40 characters per line, 2 lines maximum, plus the `.srt`.
- Human review of the audio is required before release. An agent cannot judge how a voice sounds.

## 9. QA checklist (independent agent)

- [ ] `ffprobe`: 1920x1080, 30 fps, H.264 + AAC, duration 4:45 to 5:15.
- [ ] Transcribe the final audio with `faster-whisper`; compare to `steps.json`; flag mismatches.
- [ ] Extract one frame per scene; confirm the route and the "Demo data" tag are visible.
- [ ] No frame shows a payment block, account number, personal email, or a real player photo.
- [ ] Every number on screen appears in the app on the same run (no invented figures).
- [ ] No claim from the "Not shown today" list is made in narration or captions.
- [ ] No empty frame while the voice speaks; no dev console or `localhost` banner visible.
- [ ] Agenda or chapter count matches the scenes shown.
- [ ] Rebuild from a clean clone using only `demo-video/README.md`; result is identical in structure.
- [ ] Owner has listened to the audio and approved the script.

## 10. Agent lanes (owner's routing)

| Lane | Work | Agent |
| --- | --- | --- |
| A | Scaffold, scripts, `.gitignore`, README | DeepSeek V4 Pro |
| B | `steps.json`, narration, fact check against the app and spec | GLM 2.5 |
| C | Capture script, overlay, ffmpeg assembly, quick fixes | MIMO v2.5 Pro |
| D | Cards and HUD look | Claude Sonnet |
| E | Audio-to-capture timing problems, anything stuck | Kimi 3 |
| F | Any small front-end tweak the owner approves | Flash 3.6 (Antigravity) |

Keep lanes to separate files so branches do not collide. Report blockers instead of working around
them.

## 11. Definition of done

- All files in section 1 exist and pass section 9.
- `demo-video/README.md` rebuilds them from a clean clone.
- A PR into `develop` lists the commit that was recorded, the answers or defaults used for D1 to D6,
  and what was not verified.
- `CHANGELOG.md` Unreleased notes the new folder (docs/tooling only, no version bump needed).
