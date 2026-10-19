# AVP production brief (for AI agents)

Audience for this file: coding agents that will build the TeeLine Golf AVP (audio-visual presentation).
Humans: this is the machine-readable twin of the plan the owner approved. Read `AGENTS.md` first; its
rules apply here.

Status: **approved by the owner on 18 Oct 2026. Every open question is answered (section 3).** The
purpose is onboarding and training, not a sales pitch.

Amendment 1 (19 Oct 2026, section 13): where the finished media is stored and shared, using Cloudflare
R2, with a fallback. It adds one pipeline step and changes nothing else in this brief. **It is a
proposal until the owner answers the questions in 13.9.**

## 1. Goal

One narrated walkthrough of TeeLine Golf for **IGCC management, the board and Dr.** It teaches how the
system works and how to move around it, screen by screen. It is a training aid first.

| Item | Value |
| --- | --- |
| Length | about 5 minutes by default; up to about 6:30 is allowed for the training scenes |
| Narration | AI voice, English, generated locally, no cloud TTS |
| Picture | scripted recording of the real app in demo mode, 1920x1080 |
| Main file | `avp-5min.mp4` (H.264, AAC, 30 fps) |
| Also | `avp-5min.srt`, `avp-90s.mp4` (cut from the same footage), `chapters.txt`, `poster.jpg` |
| Success test | A board member or Dr. who has never seen the app can explain what it does, and can follow the same steps in the app without help |

Out of scope: live-action footage, generated imagery, music with unclear licence, anything that shows
real player data.

## 2. Facts (what was checked, and when)

Checked against the repo on 18 Oct 2026 (`develop` at `404c249`, `package.json` 0.8.0, latest tag
`v0.8.0` at `06a2748`). Re-check before relying on any of these.

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
- Tags `v0.6.0` to `v0.8.0` exist on the remote. `main` and `develop` are level at `404c249`
  (v0.8.0 code plus later changes); production is defined by the latest tag (`docs/VERSIONING.md`).
- There are 13 migrations, the newest `20261029000000_course_data_confirmed.sql` (applied live; no
  screen reads the column yet).
- **ffmpeg is not installed on the recording machine** (not on PATH, not in winget). **bash is not
  available either.** Both are install/setup steps, not assumptions.
- **Demo-mode gaps the recording must handle:** `/enter/[id]` shows only a "connect Supabase" notice;
  `/my` shows a demo notice; `/draw`, `/print` and `/pairings` are empty until a draw exists and is
  published. The control room map already draws all 18 holes from hardcoded layout data
  (`src/lib/course/layout.ts`); only hole 1 has artwork.

Found while preparing this brief, **answered by the owner**:

- `src/lib/demo/data.ts` holds a payment block with the club's name, bank "PNB" and an account number,
  and a response email that looks personal. The owner confirms they are placeholders, and has approved
  replacing them with generic values on the throwaway demo branch (not just keeping them out of frame).

Answered by the owner (section 3): entries and groupings are done on paper and Google Forms today;
the video teaches the system rather than asking the board for money; only TeeLine branding may appear;
the recording is the latest stable release, `v0.8.0`.

Not verified:

- The exact on-screen labels in every scene. Read them from the running app; do not trust the
  storyboard wording in section 7.

## 3. Decisions the owner made (all answered 18 Oct 2026)

| # | Decision | Answer |
| --- | --- | --- |
| D1 | How entries, handicaps and groupings are handled today | **Paper and Google Forms.** Scene 1 may say exactly that. No invented hours or numbers. |
| D2 | What the video is for | **Onboarding and information.** The board and Dr. need to understand how the system works and how to move around it. No money ask. Scene 10 closes on understanding and the next step. |
| D3 | Voice | **Kokoro `af_heart`, approved by ear.** |
| D4 | Crest and name use | **TeeLine branding only.** No IGCC crest anywhere in the video. App screens will still show the club's name as text; that is the event data, not a brand mark. |
| D5 | Demo payment and email values | Placeholders. **Replace them with generic values on the demo branch.** |
| D6 | Recording version | **The latest stable release: `v0.8.0` (tag `06a2748`).** Not the develop tip. |
| D7 | Length | 5 minutes by default; up to about 6:30 for the training scenes. The help-centre scene is required. |

No question is blocking any more. Do not invent facts for D1 or D2; use what is written above.

## 4. Tool choice and why

The owner asked whether a skill, extension or library exists for this. Findings (checked 18 Oct 2026):

| Option | What it is | Verdict for this job |
| --- | --- | --- |
| **Playwright** (already a dev dependency) | Scripted browser, `recordVideo` | **Use.** Records the real app, deterministic, rerunnable |
| **ffmpeg** (full build) | Assembly, captions, loudness, cuts | **Install first.** Not present on the recording machine. Needs libx264, aac and libass for burned captions. ffprobe comes with it |
| **Kokoro-82M** via `kokoro-onnx` | Open-weight local TTS, Apache-2.0, 24 kHz | **Use for narration** (tested here, runs offline once the model is downloaded) |
| **Piper** (`piper-tts`) | Local TTS, lighter, lower quality class | Fallback. The old `rhasspy/piper` repo is archived and moved to `OHF-Voice/piper1-gpl`; check that licence before shipping a voice from it |
| **demofly** (npm, MIT) | CLI doing Playwright record + Kokoro TTS + assemble | **Optional shortcut, not adopted.** Maturity unclear (no version history on its page). Try it only as a spike; the repo-owned scripts below are the source of truth |
| **demodsl** (PyPI, "Beta", own community licence) | YAML-driven demo generator, 13 TTS providers | Not adopted: non-OSI licence, beta, deprecated renderer |
| **Remotion** (+ official skills via `npx skills add remotion-dev/skills`) | React-based video composition | **Not needed.** Free only for individuals, non-profits and for-profits with up to 3 employees; otherwise a paid company licence. The owner reports 3 or fewer people, so it would be free, but it adds a React build for no gain here. HTML title cards captured by Playwright do the same job |
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
  build/assemble.mjs        # ffmpeg assembly (Node; this machine has no bash)
  build/publish.mjs         # optional upload of the finished files to R2 (section 13)
  .env.example              # R2 variable names only, no values (section 13.4)
  out/                      # git-ignored
```

- **Two things live in this work:** the demo build (throwaway) and, optionally later, the reusable
  tooling. The demo build wins for now.
- **Throwaway demo branch:** `avp/demo-fixtures`, cut from the `v0.8.0` tag (`06a2748`). It is pushed
  for safety but **never merged, never PR'd, never deployed**. It carries the mock data and the
  recording scripts together, because the video is the deliverable. `src/` changes are allowed there
  and nowhere else.
- On that branch only:
  - a frozen draw and published snapshot for Bamboo Tee, generated once with the real engine and
    committed as a fixture (section 12);
  - generic payment and response-email values;
  - the public entry form rendered in demo mode with a hardcoded config, so scene 5 can show it;
  - the control room map as it already is (all 18 holes drawn, sample art). No change needed.
- The main branches stay untouched: no `src/` changes, no schema, no migrations, no production env.
- Large outputs (`*.wav`, `*.mp4`, `*.webm`) are git-ignored. Scripts, `steps.json`, fixtures and cards
  are committed on the throwaway branch.
- Pin the app to `v0.8.0`; write the tag, commit hash and `package.json` version into
  `demo-video/README.md` and the closing card.

## 6. Pipeline

Run in order. Each step lists its output and an acceptance check.

0. **Install the toolchain once.** Full ffmpeg (libx264, aac, libass) with ffprobe; a Python venv with
   `kokoro-onnx`, `onnxruntime`, `soundfile`, `numpy`; the Kokoro model and voices; `faster-whisper`
   for QA. Check: `ffmpeg -version`, `ffprobe -version`, and a one-line Kokoro synthesis all work.
1. **Scaffold** (`demo-video/` tree, `.gitignore`, README, `pnpm` scripts `avp:audio`, `avp:capture`,
   `avp:build`). Check: `pnpm typecheck && pnpm lint` still pass on the throwaway branch.
2. **Freeze the app at `v0.8.0`.** Check out the tag on `avp/demo-fixtures`. `pnpm build && pnpm start`
   with no Supabase variables set. Check: `/admin` loads with demo data; refresh resets it.
3. **Write `steps.json` from section 7.** Read the real screens first and correct every label. Narration
   total 700 to 900 words for the longer training cut. Check: a script reads `steps.json` and prints
   words per scene and a total.
4. **Generate audio.** Kokoro `af_heart`, one wav per scene, 48 kHz mono after resampling,
   `durations.json` from `ffprobe`. Check: no clipped samples, each scene within 15% of its target
   time, pronunciation list applied.
5. **Capture to the audio.** `record.mjs` holds each scene for at least its audio duration plus 0.4 s.
   Viewport 1920x1080, device scale factor 1. Playwright's recorder writes 25 fps VP8 and ignores
   device scale factor, so do not rely on scaling; record at the real size. Use fixed clicks with
   waits on real UI state, not blind sleeps. Check: two runs produce the same scene order and the same
   visible numbers.
6. **Overlay layer.** Step chip, caption bar, gold highlight on the control being discussed, tap ring
   at each click, and a permanent small "Demo data" tag. Check: captions match `steps.json` exactly.
7. **Cards.** Title card, "Not shown today" card, closing card (version, tag, commit, where to get help).
   TeeLine branding only, no IGCC crest. Design pass by the design lane; no external fonts or scripts
   (`AGENTS.md`).
8. **Assemble** with `node demo-video/build/assemble.mjs`: concat cards and scenes, mix voice, burn
   captions, write `.srt`, loudness about -16 LUFS integrated with true peak at or below -1 dBTP,
   30 fps H.264 + AAC, `+faststart`. Chapter file from scene starts. Check: `ffprobe` duration 5:00 to
   6:30.
9. **90-second cut** from the same footage: scenes 2, 6, 7 and the help pointer. Check: under 95 s.
10. **QA** (section 9) by an agent that did not build it.
11. **Publish** (section 13, only after QA passes and the owner has answered 13.9). Upload the finished
    files to R2 and print time-limited links. A failed publish never fails the build; see 13.6.

## 7. Storyboard (first draft; verify every label in the running app)

| # | Time | Scene | Route | Show | Narration intent (draft) |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:30 | Today's way | card | Plain card, no screenshots | Entries and groupings are on paper and Google Forms today |
| 2 | 0:30-1:05 | One desk | `/admin` | Control room: entries, draw state, readiness, attention list | Everything for one event is on one screen |
| 3 | 1:05-1:50 | Set up the event | `/setup`, `/course` | Event settings, course and tees, Review and readiness, Save all changes | Rules are settings the organizer controls, not code. Say the tee ratings are samples |
| 4 | 1:50-2:30 | Handicaps | `/import` | Import the sample file, the match queue | Unmatched or conflicting players wait for a person |
| 5 | 2:30-3:20 | Entries | `/register`, `/enter/[id]` | Registration desk; public entry link; the public form; lands as Needs review | Players enter online; nothing is trusted until the desk confirms |
| 6 | 3:20-4:15 | The draw | `/draw` | Make the draw, Checks, move a player with a reason, lock, re-run keeps locks | The system proposes; the organizer decides and can override with a reason |
| 7 | 4:15-4:50 | Publish and phone | `/draw`, `/pairings` | Publish, then the phone view | Players only see the frozen published version |
| 8 | 4:50-5:20 | Print center | `/print` | Start sheet, scorecards | Paper still works on the day |
| 9 | 5:20-5:50 | Help, when stuck | the help panel, cheat sheet | The "?" on each screen, "Show me", the printable cheat sheet | This is the training aid they keep using after the video |
| 10 | 5:50-6:15 | Who can do what, and next | cards | Roles, audit, the acceptance test, where to get help | Close on understanding and the next step, not a money ask |

"Not shown today" card (these do not exist in the app; do not imply them): Excel import, direct NGAP
connection, online payment, offline use, official scoring.

Rules for every scene: no real player names or photos; sample names only. TeeLine branding only, no
IGCC crest (`D4`). Do not display payment or email fields, and on the demo branch they are generic
anyway (`D5`). The player view is the phone pairings page only; do not show `/my`. Do not say a rule
is "IGCC's rule" unless it is marked confirmed in `docs/spec/IGCC_Tournament_Desk.md`.

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

- [ ] `ffprobe`: 1920x1080, 30 fps, H.264 + AAC, duration 5:00 to 6:30.
- [ ] Transcribe the final audio with `faster-whisper`; compare to `steps.json`; flag mismatches.
- [ ] Extract one frame per scene; confirm the route and the "Demo data" tag are visible.
- [ ] The help-centre scene is present and shows both "Show me" and the cheat sheet.
- [ ] No frame shows a payment block, account number, response email, or a real player photo.
- [ ] No IGCC crest appears anywhere; the cards use TeeLine branding only.
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
- Everything is on `avp/demo-fixtures`, pinned to `v0.8.0`; the branch is pushed for safety and **never
  merged**. The closing card states the tag, the commit and where to get help.
- The main branches are untouched by the demo work.
- The owner has watched the finished cut and approved it before it is shown to the board.

## 12. Mock data for the demo (throwaway branch only)

The demo seed already gives about 86 sample players, handicap records, guests and edge cases. What it
does not give is a draw, a published list, or the public entry form in demo mode. On
`avp/demo-fixtures`:

- A one-off generator script (not committed, or committed under `demo-video/tools/`) uses the real
  engine (`buildRegistrations`, `route`, `buildPublished`) to produce a draw for Bamboo Tee, then
  freezes it.
- `demo-video/fixtures/bamboo-tee-draw.json` holds the groups, waves, times, flights and locks;
  `demo-video/fixtures/bamboo-tee-published.json` holds the same groups as a published snapshot.
- A small loader seeds `initialState` with both, on this branch only, so `/admin`, `/draw`, `/print`
  and `/pairings` are populated from the first frame.
- The payment block and response email in `src/lib/demo/data.ts` are replaced with generic values
  ("Sample Bank", masked number, `demo@example.com`).
- The public entry form is rendered in demo mode with a hardcoded config, so scene 5 shows the real
  form instead of the "connect Supabase" notice.
- The control room map is left as it is: all 18 holes are already drawn from hardcoded layout data.

No real player data, no photos, no external assets. The fixtures are obviously sample data and are
labelled as such on screen.

## 13. Amendment 1: Cloudflare R2 storage for the AVP media (19 Oct 2026)

Added after the owner flagged that the storage bucket size had been overlooked. Status: **proposal.
Nothing here has been created or applied.** Creating the Cloudflare account, bucket and token is the
owner's job (`AGENTS.md`: ask before adding infrastructure). Agents write the scripts and the
instructions only.

### 13.1 What the bucket problem is (checked, and what is still a guess)

Verified by reading the code on `develop` (`90b7204`) and the vendor pages, 19 Oct 2026:

- **The live app stores no photos today.** `saveConsentedPhoto` in `src/lib/data/supabase/players.ts`
  uploads to the private `player-photos` bucket, but it is only reached through `persistDeskAction`,
  and that is only imported by `src/lib/store/legacy-supabase-store.tsx`, which nothing mounts. The
  live adapters (`src/lib/data/supabase/adapters.ts`) write `players` rows with no photo column.
  The photo consent item in the `docs/PLAN.md` checklist says the same. The upload code is dead until someone wires it in.
- **Supabase Free allows 1 GB of storage and a 50 MB maximum file** (supabase.com/docs/pricing). Pro
  allows 100 GB included. `supabase/config.toml` also sets a 50 MiB local file limit.
- **This brief has no hosting step.** Section 5 git-ignores `*.wav`, `*.mp4` and `*.webm`, so the
  finished video exists only on the recording machine.

Inference, not verified: the size problem is the **AVP media** (raw `.webm`, per-scene `.wav`, the
5-minute and 90-second `.mp4`, poster, captions), which will not fit comfortably in a 50 MB file limit
or a 1 GB free bucket, and has nowhere to live once the recording machine is turned off. Measure it:
after the first full build, record `du -sh` of `demo-video/out/` in `demo-video/README.md`. Do not
assume a figure.

If the owner meant player photos instead, say so (13.9, question 1). Section 13.2 explains why the
answer would change.

### 13.2 Decision: R2 holds the AVP media only. Photos stay where they are.

| Item | Goes to R2? | Why |
| --- | --- | --- |
| Finished files: `avp-5min.mp4`, `avp-90s.mp4`, `.srt`, `chapters.txt`, `poster.jpg` | **Yes** | Large, demo data only, needed by people outside the repo |
| Raw footage and per-scene audio | Optional, owner's call | Only needed to rebuild. A rebuild from `steps.json` is meant to be possible, so these are not backed up by default |
| Player photos | **No** | See below |
| Anything with real player data | **Never** | Out of scope in section 1 and `AGENTS.md` |

Why photos stay in Supabase: the `player-photos` bucket is private, scoped by club folder, and guarded
by the `player_photos_member_all` policy (`20261017000000_init.sql`), with a 5 MiB and three-type limit
(`20261032000000`). R2 has no row-level security. Moving photos there means a server route that signs
links after checking consent and club membership, which is a change to auth, RLS and infrastructure.
That needs the owner's decision and its own plan. It is not a side effect of an AVP amendment. R2
presigned links also cannot be used on a custom domain (13.3), which constrains that design.

### 13.3 What was verified about R2 (Cloudflare docs, 19 Oct 2026)

| Fact | Detail |
| --- | --- |
| Free tier | 10 GB-month storage, 1M Class A and 10M Class B operations a month, egress free |
| Past the free tier | $0.015 per GB-month, $4.50 per million Class A, $0.36 per million Class B |
| Ingress | The owner said "no ingress fee". The pricing page verifies **zero egress fees**. It does not state anything about ingress, so treat that as unconfirmed |
| API tokens | Admin Read and Write, Admin Read only, Object Read and Write, Object Read only. Object tokens can be limited to named buckets. The secret is shown once |
| S3 endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto` |
| Presigned links | Valid from 1 second to **7 days**. They are bearer tokens. They **do not work on a custom domain**, only on the S3 endpoint. Changing the path, method or expiry gives 403 |
| `r2.dev` public URL | Rate limited and "for development only". Not for the board link |
| Custom domain | Needed for public production access, caching and access rules. Requires the domain to be on Cloudflare |
| CORS | A bucket setting. Browsers enforce it, including on presigned links. Only needed if a web page fetches or uploads directly. A Node upload script needs none |
| Limits | 5 GiB per single upload, multipart above that; 1,024 byte object keys |

Not verified: whether Cloudflare asks for a payment method before enabling R2 on a free account;
whether the AWS SDK for JavaScript v3 needs its checksum setting relaxed for R2 (some versions have been
reported to; test on the first upload and read the error).

### 13.4 Setup for the owner (dashboard steps; agents do not do these)

The word that was hard to remember is probably one of two things. **API token permissions** decide what
a script may do (read, write, which bucket). **CORS** decides which websites a browser may call the
bucket from. Both are below.

1. Sign in to Cloudflare, open **R2 Object Storage**, enable it for the account.
2. Create one bucket, for example `teeline-avp`, Standard storage class. Leave public access **off**.
3. Create an **R2 API token** with **Object Read and Write**, limited to that one bucket. Copy the
   Access Key ID and Secret Access Key now; the secret is not shown again. Also copy the account ID.
4. Put the values in `demo-video/.env` on the recording machine. The root `.gitignore` already ignores
   `.env*` and keeps only `.env.example`. Commit `demo-video/.env.example` with names and no values:

   ```
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=teeline-avp
   ```

   The endpoint is built from the account ID in code. None of these may start with `NEXT_PUBLIC_`, go
   into Vercel, appear in `steps.json`, a log or a screenshot, or be pasted into a pull request.
5. CORS: skip it for the upload script. Add it only if a web page will play or upload the file
   directly. A starting rule for playback (replace the origin):

   ```json
   [{"AllowedOrigins": ["https://<the page's origin>"], "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600}]
   ```

   Changes can take up to about 30 seconds to apply.
6. If a secret leaks (committed, pasted, shown on screen): delete the token in the dashboard, make a
   new one, and treat any presigned link made with the old one as exposed.

### 13.5 The publish step (`demo-video/build/publish.mjs`, throwaway branch only)

- Reads the four variables above. Uploads only the files named in section 1, from
  `demo-video/out/`, to keys of the form `avp/v0.8.0/<build id>/<file>`. Set `Content-Type` on each.
  Use multipart for the `.mp4` files.
- Before uploading, runs the QA gate from section 9 and refuses if it has not passed. Nothing goes to
  R2 that has not been checked for payment blocks, real names and photos.
- After uploading, sends a HEAD request for each key and compares size with the local file. Writes
  `out/publish.json` with key, size, sha256 and status. This file is git-ignored.
- Prints one presigned GET link per file. Default expiry 72 hours, never above 7 days. The links are
  bearer tokens: they go to the owner only, they are not committed, and they are not pasted into a
  public place.
- Adds one dependency (`@aws-sdk/client-s3`, with `@aws-sdk/s3-request-presigner`) on
  `avp/demo-fixtures` only. It is not added to `develop` or `main`. The owner approves this by
  approving the amendment.

### 13.6 Fallback: the video must never depend on R2

The local `demo-video/out/` folder and its checksums are the source of truth. R2 is a convenience copy.
Same idea as `docs/RUNBOOK.md`: prepare the fallback before the day, not on the day.

| What goes wrong | How it shows | Fallback |
| --- | --- | --- |
| No R2 account or token yet | `publish.mjs` exits with code 3 and "R2 is not configured" | Skip publishing. The build is still complete and valid. Share through step 2 below |
| Wrong or revoked token, network down, bucket missing | Upload fails with 403, 404 or a timeout. Exit code 4, `publish.json` status `not_published` | Fix the cause and re-run. Files already uploaded are overwritten by key, so a re-run is safe |
| Storage over the free 10 GB | Not expected: the finished set should be small. If it happens, billing starts at $0.015 per GB-month | Delete old `avp/<version>/<build id>/` folders. Keep only the approved build |
| Presigned link expired | 403 `ExpiredRequest` | Run `node demo-video/build/publish.mjs --links-only` to issue new links. No re-upload |
| Cloudflare unavailable on the day | Link does not open | Play from the laptop (step 1) |

Order of fallbacks for showing the video to the board:

1. **Local copy on the presenting laptop and on a USB stick**, copied the day before. This is the one
   that cannot fail with the network. Required whatever else is used.
2. **A file the owner shares from Google Drive.** Upload by hand from `out/`. This needs no new infrastructure.
3. **Supabase Storage**, only if the file is under 50 MB on the Free plan (re-encode with a higher CRF
   or use the 90-second cut). It needs a **new bucket, which is a schema and infrastructure change**,
   so it needs the owner's approval first and is not used by default.

Not a fallback: a GitHub Release or a committed file. The throwaway branch is never merged, and large
binaries in Git history cannot be removed cleanly.

### 13.7 QA additions (independent agent; append to section 9)

- [ ] An unsigned GET of an object URL is refused (403). The bucket is private.
- [ ] The token is limited to one bucket (read the token's setting in the dashboard; do not test by
      trying other people's buckets).
- [ ] A presigned link opens from a different machine and network, and plays the video.
- [ ] An expired link fails with 403. Issue one with a 60-second expiry and test it after a minute.
- [ ] Object size equals the local file size, and the sha256 in `publish.json` matches the local file.
- [ ] `git grep -n "r2.cloudflarestorage.com\|R2_SECRET"` on the branch finds variable names in
      `.env.example` and the script only, no values. The access key ID does not appear in `git log -p`.
- [ ] Failure path: run `publish.mjs` with a wrong secret. It exits with code 4, writes
      `not_published`, and `out/` is untouched.
- [ ] No object in the bucket other than the files listed in section 1.

### 13.8 Agent lanes for this amendment

| Lane | Work | Agent |
| --- | --- | --- |
| A | `demo-video/.env.example`, README section "Publishing", `.gitignore` check | DeepSeek V4 Pro |
| C | `publish.mjs`: upload, HEAD check, `publish.json`, presigned links, exit codes 3 and 4, `--links-only` | MIMO v2.5 Pro |
| E | If uploads fail in a way the error does not explain (checksum, multipart, endpoint) | Kimi 3 |
| QA | Section 13.7, by an agent that did not write `publish.mjs` | any agent that did not build it |

### 13.9 Questions for the owner

| # | Question | Default if not answered |
| --- | --- | --- |
| 1 | Did "bucket size" mean the **AVP media**, or **player photos**? 13.1 infers the AVP media. | Media only; photos untouched |
| 2 | Is it fine to stay on a **private bucket with expiring links** (max 7 days), or does the video need a **permanent public address** on a domain that is on Cloudflare? | Private, expiring links |
| 3 | Does Cloudflare ask for a **payment method** before R2 is enabled on your account? (Not verified here.) | Assume it may; budget for it |
| 4 | Do you approve adding the AWS S3 SDK on the **throwaway branch only**? | Yes, throwaway branch only |
| 5 | Should raw footage and per-scene audio be backed up to R2, or only the finished files? | Finished files only |
| 6 | Do you want player photos moved off Supabase at all? | No. It needs its own plan (13.2) |
