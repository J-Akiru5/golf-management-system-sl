# Live updates: how to check them on event day

- **Issue:** #349, live updates so the desk and the public pages refresh themselves.
- **Built:** 21 November 2026, on `feat/349-live-updates`.
- **Scope:** polling only. No Supabase Realtime, no new service, no new infrastructure, no migration.

## What refreshes itself

| Screen | What it does | Timing |
| --- | --- | --- |
| Desk, `Scores` (`Enter card` and `Review`) | Reads the day's round again and replaces the screen only when a card, approval, resolution, handicap snapshot or publication changed | 10 seconds while the tab is visible and online |
| Public `/leaderboard` | Checks one short signature and re-renders the page when a round is published, a pairings version changes or a release key is toggled | 10 seconds, visible and online |
| Public `/results/all` | Same | 10 seconds |
| Public `/roster` | Same, because the roster is part of the published programme | 10 seconds |
| Public `/pairings` | Unchanged: it already polls the pairings version every 30 seconds | 30 seconds |

Nothing polls while the tab is hidden or the phone is offline. Both resume and check at once when
the tab comes back or the connection returns. A failing check slows down (up to two minutes)
instead of hammering the server.

Saves made on the same screen still appear instantly, because each write returns the new round.
The poll is for the other screens.

## On tournament morning, before the first card

1. **Two desk screens.** Open `/scores/review` on the scoring laptop and on a second device (or a
   second browser profile, signed in as another staff account). Enter and approve one card on the
   laptop. Without touching the second device, its Cards table should show the new card within
   about 10 seconds.
2. **Handicap.** On the laptop, open a player's card and use **Correct handicap** with a reason.
   The second device's player card and card queue should show the corrected handicap within about
   10 seconds. The public pages must **not** change yet: they only show published results.
3. **Publish.** Publish the round from `/scores/review` (or let automatic publishing do it after a
   saved card). On a phone signed out, with `/leaderboard` open, the new points should appear
   within about ten seconds without a reload. Repeat with `/results/all`.
4. **Hold and release.** Toggle the leaderboard hold off and on in the desk's public release
   controls. An open `/leaderboard` should switch to the holding screen and back within about ten
   seconds, on its own.

If all four happen, live updates work for the day. If one does not, note which of the four, the
time, the screen and the device; that is enough to locate the fault from the sections below.

## Known limits to state plainly

- **The desk's `/players` directory does not poll.** It is a different screen and was outside this
  issue's files. It refreshes when the page is opened or reloaded, and a handicap corrected on the
  scoring screen is written to the round snapshot, not to the directory row. Decide separately
  whether that screen should poll too.
- **The public pages never show live data.** An approved card that is not published stays invisible
  to players, by design. If automatic publishing is set to manual, the public board will not move
  until the round is published, and that is correct rather than a live-update fault.
- **A hidden phone stops asking.** A phone in a pocket shows the page from when it was last visible
  until it is brought back, then it checks at once. This is deliberate and keeps the load down.
- **One extra read per visible desk screen every 10 seconds.** On a two-screen desk that is about
  12 round reads a minute; a round read is the same handful of queries the screen already makes on
  load. The public check is one small cached read served with a 5-second edge cache, and the page
  data itself keeps its 30-second cache, so a field of phones does not multiply database reads.
- **A stale copy cannot overwrite a save on the same screen.** A poll that started before this
  screen's own save is discarded (`stamp` in `useLiveRound`), so an approved card never flips back
  to "Approve" for one cycle.

## Where it lives

- `src/lib/public/live-signature.ts`: what identifies a public change, and the poll intervals.
- `src/lib/data/supabase/public-cache.ts`: `readPublicResultsSignature`, `readPublicLiveSignature`
  (cached reads under the existing `public-published` tag, so a publish clears them at once).
- `src/app/api/revalidate-pairings/route.ts`: `GET` serves the live signature; `POST` is unchanged.
- `src/components/public/PublicLive.tsx`: the public poll (invisible; it only calls
  `router.refresh()` when the signature moves).
- `src/lib/scoring/live-signature.ts`: what identifies a change to the desk's round.
- `src/components/scoring/useLiveRound.ts`: the desk poll, its pause rules and the stale-read guard.
- `src/components/scoring/ScoresDesk.tsx`: wires the poll to the `Scores` screen and mentions it in
  the connected-round note.

## If it does not update

1. **Is the tab actually visible?** A hidden tab is not supposed to poll. Bring it forward.
2. **Is it online?** The desk refuses writes offline and the polls pause; both resume on reconnect.
3. **Did the round publish?** Check the desk's "Last publish vN" line. Manual publishing mode means
   no public change until the desk publishes.
4. **Is the surface held?** A release key that is held keeps the public page on its holding or empty
   state even after a publish. The signature still moves when it is released.
5. **Only one screen updating?** The desk poll is per screen; a screen left on another playing day
   follows that day, not the day being scored.
6. **Endpoint failing?** `GET /api/revalidate-pairings` should answer
   `{"signature":"pairings:...;results:..."}`. A 502 means the published reads failed; the pages
   slow their checks down and recover without a reload once it answers again.
