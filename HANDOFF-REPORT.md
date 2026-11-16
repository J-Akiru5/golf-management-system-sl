# S3 onboarding: handoff report

Branch `focus/s3-onboarding`, worktree `S:\Dev\golf-management-system-sl\focus-s3`.
All work is committed locally in five commits. Nothing was pushed, merged or deployed.

## What changed, and why

### 1. A resumable onboarding engine (`src/lib/onboarding`)

Typed steps, ordering, resume, seen rules, install detection and the staff checklist live in pure
functions with unit tests. The player has four steps; staff has six. Different `userId` values keep
separate progress. A missing or junk localStorage record is treated as a first visit, never an error.

- `types.ts`: `PLAYER_STEPS`, `STAFF_STEPS`, step shape, role type.
- `steps.ts`: clamp, next, previous, first/last, find by anchor or fallback.
- `storage.ts`: tolerant progress store, per-role and per-user scope, localStorage always written.
- `checklist.ts`: four first-day items, tolerant store, toggle and count.
- `install.ts`: iOS Safari, Android Chromium, already installed, other.
- `onboarding.test.ts`: 24 tests.

Why: the first minute at the club has to survive a reload, a skipped step and a borrowed phone. The
storage keeps the current step until the person finishes or skips, so closing on step 2 does not
start them over.

### 2. Player first run (`OnboardingGate`, `PlayerTour`, `OnboardingSheet`)

Four steps, under a minute:

1. Language: English, Tagalog, Hiligaynon. The cookie is written and the page refreshes, so the app
   switches immediately, not after the tour.
2. Find your name: explains the existing claim step, says plainly that the NGAP number is only a
   fallback when the email does not match, and offers "Find my entry" plus "Just look around".
3. Three swipeable cards built from the app's own chips and rows: tee time, board and scorecard.
4. Keep it on your phone: Share / Add to Home Screen on iOS Safari, `beforeinstallprompt` Install on
   Android Chromium, a browser-menu hint elsewhere, and a plain "Not now".

The sheet is a bottom sheet on phones and a centred card on a wide screen. It is a modal Radix
dialog, so focus is trapped, Escape closes, focus returns, and the heading and step are announced.
Closing with Escape, the X or the backdrop remembers the step. Skip and the final action mark it
seen. `?onboarding=1` replays from the start. A "Replay welcome" link appears on the home screen
after the tour has been seen.

The old help centre "Welcome to My golf" panel is marked seen when the player gate mounts. Otherwise
two first-run dialogs stacked on top of each other. The help `?` sheet itself is untouched.

### 3. Staff first run (`StaffTour`)

Shown on `/staff`: Today, Players and arrivals, Schedule, Score, the account area, then a "Before
the first tee" checklist. The coach marks look for `data-onboard="..."` first and fall back to the
controls that exist today, so the tour works now and improves when the other stream lands its
anchors. A missing anchor is a plain panel, not an error. Checklist ticks are stored locally and
survive replay.

The four checklist items are: confirm the event and day, test one arrival and undo it, open the
schedule, test a score entry.

### 4. Public `/join` card

A server-rendered page with a phone view and an A5 print card:

- QR built with `qrcode.react`. It encodes `NEXT_PUBLIC_SITE_URL` when set, otherwise the current
  origin, always the bare app root. A same-size placeholder avoids layout shift.
- Three player steps in English, Tagalog and Hiligaynon at once, each labelled, plus the club name.
- A short English staff block: sign in with your own account, never share one.
- Print button and hint, hidden in print.
- Print CSS sets `@page size: A5 portrait; margin: 0` and an exact `148mm x 210mm` card with
  `overflow: hidden`. The PDF is one page.

### 5. Mount lines

Only these two JSX lines were added to other streams' screens:

- `src/app/(player)/layout.tsx`: `<OnboardingGate role="player" />`
- `src/app/(staff)/layout.tsx`: `<OnboardingGate role="staff" />`

The player mount sits before `FirstRunWelcome` so the help welcome is suppressed before it reads its
storage. The staff mount sits inside `StaffShell`.

## Files

New:

- `src/lib/onboarding/{types,steps,storage,checklist,install,index,onboarding.test}.ts`
- `src/components/onboarding/{OnboardingGate,OnboardingSheet,PlayerTour,StaffTour,JoinQr,index}.tsx`
- `src/components/onboarding/onboarding.module.css`
- `src/app/(public)/join/{page.tsx,join.module.css}`

Modified:

- `src/lib/i18n/dictionaries/{en,tl,hil}.ts`: append-only `onboard.*` block. All player-facing strings
  exist in all three dictionaries and the coverage test passes.
- `src/app/(player)/layout.tsx`, `src/app/(staff)/layout.tsx`: the two mount lines above.

## Evidence

All screenshots and the raw run data are in `.tmp/ux/s3/` (gitignored, not committed).

### Layout and tap targets

Playwright measured the live app with the dev server on port 3203, demo mode, no Supabase env.

| Check | Result |
| --- | --- |
| Horizontal overflow, 390x844 | none (`scrollWidth 390 = innerWidth 390`) on player steps 1, 2, 4, staff step 1 and checklist, `/join` |
| Horizontal overflow, 360x740 | none on player and staff |
| Horizontal overflow, 430x932 | none on player and staff |
| Horizontal overflow, 1280x800 | none on staff and `/join` |
| Tap targets under 44x44 | 0 in the onboarding sheets and on `/join` at every measured viewport |
| Inputs under 16px font | 0 |
| Console errors | 0 |
| Page errors | 0 |

### Behaviour

| Check | Result |
| --- | --- |
| Focus trap, player step 1 | 16/16 Tab presses stayed inside the sheet |
| Focus trap, player find step | 16/16 stayed inside |
| Focus trap, staff step 2 | 16/16 stayed inside |
| Escape | closed the sheet (`closed: true`) |
| Skip | closed and wrote seen true |
| Resume after closing on step 2 | a plain load of `/my` reopened at "2 of 4" |
| Seen state | `{"player":{"seen":true,...}}`, replay link visible |
| Language | cookie `desk-lang=tl`, Tagalog copy visible after refresh |
| Reduced motion | sheet `animation-name: none` |
| Staff checklist | `{"staff":{"confirm-day":true}}`, still ticked after replay |
| Staff coach marks | 4 of 5 steps found a real control: day pills, arrivals, schedule tab, score/scan. The account sheet anchor is not in this branch, so that step is a plain panel |
| `/join` QR | `data-qr-url` = `http://localhost:3203`, the page origin; one QR SVG |
| `/join` print | card 559.36 x 793.69 CSS px = 148 x 210 mm at 96 dpi; scrollHeight 794 = clientHeight 794; PDF 1 page, 71,585 bytes at both a 390-wide and a 1280-wide print context |

### Contrast (computed from the rendered colours)

| Pair | Ratio |
| --- | --- |
| Player sheet title, light | 15.57:1 |
| Player sheet title, dark | 13.27:1 |
| Join card title | 15.57:1 |

All are above 4.5:1. No new colour tokens were needed for the player sheet; the staff sheet uses the
same white/high-contrast palette as `staff.module.css`.

### Screenshots

`.tmp/ux/s3/` contains:

- Player 390: `player-390-step1-language.png`, `player-390-step2-find.png`,
  `player-390-step3-preview.png`, `player-390-step3-preview-card2.png`,
  `player-390-step4-install.png`, `player-390-done-replay-link.png`, `player-390-tagalog.png`,
  `player-390-dark.png`.
- Player 360 and 430: `player-360-step1.png`, `player-360-step3.png`, `player-430-step1.png`,
  `player-430-step3.png`.
- Staff 390: `staff-390-step1-today.png`, `staff-390-step2-players.png`,
  `staff-390-step3-schedule.png`, `staff-390-step4-score.png`, `staff-390-step5-account.png`,
  `staff-390-step6-checklist.png`, `staff-390-checklist-ticked.png`,
  `staff-390-done-replay-link.png`.
- Staff 360 and 430: `staff-360-step1.png`, `staff-360-checklist.png`, `staff-430-step1.png`,
  `staff-430-checklist.png`.
- Staff desktop: `staff-1280-step1.png`.
- Join: `join-390.png`, `join-1280.png`, `join-print-a5.png`, `join-a5.pdf`,
  `join-a5-desktop.pdf`.
- Raw measurements: `last-run.json` (latest run), `report.json` (earlier run).

### Checks run

- `pnpm vitest run src/lib/onboarding/onboarding.test.ts src/lib/i18n/i18n.test.ts`:
  2 files, 32 tests passed.
- `pnpm typecheck`: exit 0, no errors. Last lines:

```text
> golf-management-system-sl@0.27.4 typecheck
> tsc --noEmit
```

- Targeted `pnpm exec biome check` on the new files and the three dictionaries: clean.
- Playwright run at 390x844, 360x740, 430x932 and 1280x800: 0 console errors, 0 page errors.

I did not run `pnpm lint`, the full `pnpm test`, or `pnpm build`, per the session rules.

## What I could not verify

- Real iOS Safari and Android Chrome install flows. The UA detection is unit tested. The
  `beforeinstallprompt` branch is coded but cannot fire in headless Chromium, so the Install button
  was not clicked in a real browser.
- A physical A5 print. The PDF page count and exact card box are measured, but not a real printer's
  margins or paper feed.
- A real screen reader. Focus order, labels, landmarks and live regions are in place; the
  announcement quality was not heard.
- The help welcome suppression with a live Supabase session. It was verified in demo mode, where the
  write is local and synchronous. The order is guaranteed by mounting the gate before the help
  panel, but a configured app has an extra auth read for the user id after the local write.
- Real touch swipes and real weak signal. The carousel uses scroll-snap and was scrolled
  programmatically; onboarding makes no network request of its own.
- The staff account sheet anchor. `data-onboard="staff-account"` is not in this branch, so that step
  is a plain panel. The other four anchors found current controls through fallback selectors.

## Noticed but left

- The help centre welcome and the new onboarding both existed. I suppress the old welcome from the
  gate because it says less than the tour and stacking them is unusable. The help `?` sheet remains.
- Seen state is localStorage only. It is scoped per user when a Supabase session exists, but it is
  not cross-device. A cross-device record would need a new `onboarding_seen` table and an applied
  migration; I did not add one because the club demo has to work without applying anything. If
  cross-device is wanted, mirror `src/lib/help/seen.ts`.
- `onboard.common.optional` is currently unused. It is kept in the dictionary for the claim work.
- `?onboarding=1` restarts the tour on every full load. That is deliberate for demos.
- The demo `/my` page shows its existing "demo data" notice behind the tour. On a configured app the
  "Find my entry" action scrolls to the real claim card.
- The existing staff header has no account sheet yet. The only account-like control is "Full desk",
  so I removed the fallback to it. Pointing at the wrong control would be worse than a plain panel.
- The Next.js dev badge is hidden in the screenshots only. It is not part of the product.

## What to try on your phone

Replace `http://localhost:3203` with the deployed preview URL if you are not on the dev machine.

1. Open `http://localhost:3203/my?onboarding=1`. Tap **Tagalog**. The whole sheet and the header
   switch immediately.
2. Tap **Next**, then tap **Just look around** on the find step.
3. Swipe the preview card left, or tap the second dot. You should land on the board card.
4. Tap **Next** to the install step, then **Not now**. The **Replay welcome** link appears; tap it to
   run the tour again.
5. Open `http://localhost:3203/staff?onboarding=1`. Tap **Next** twice to reach Schedule. The
   Schedule tab at the bottom is ringed and the sheet moves to the top.
6. Tap **Open schedule** from that step. The tour closes and the schedule opens. Go back to Today
   and the tour resumes at the same step.
7. Replay the staff tour, tick **Confirm the event and today's playing day**, tap **Done**, then
   **Replay welcome** and walk back to the checklist. The tick is still there.
8. Open `http://localhost:3203/join` on the phone. Scan the QR with another phone; it opens the app
   root. Tap **Print the A5 card** and choose A5 or Actual size.
9. Close any sheet with Escape or the X, then load `/my` without `?onboarding=1`. The tour resumes on
   the step where you stopped.
