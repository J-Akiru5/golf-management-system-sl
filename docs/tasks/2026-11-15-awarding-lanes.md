# Results blackout, awarding lanes and the timed reveal (issue 302)

Built on branch `agent/fd-blackout` for the final day of the 24th Bamboo Tee. The awarding is released
one lane at a time, each lane with its own countdown, and the public sees a blank board until the club
releases that lane.

## What is built

| Piece | Where |
| --- | --- |
| The six lanes, lane state, the countdown maths and the stored board | `src/lib/public/results-reveal.ts` |
| Building and confirming a top three, tie marks | `src/lib/public/awarding.ts` |
| The desk screen: six rows, Hold, Release now, Release in N seconds | `/awarding` (`src/app/(desk)/awarding`, `src/components/desk/AwardingLanes.tsx`) |
| The public page: six boards, blank, cinema countdown, flash | `/results` (`src/app/(public)/results/page.tsx`, `src/components/public/AwardingPodium.tsx`) |
| All scores, moved off `/results` | `/results/all` |
| The lane read the public page uses | `GET /api/results/reveal`, `public_reveal_state()` in `20261115000200_results_reveal.sql` |
| The demo (staging only) | `AWARDING_DEMO=1`, `src/lib/public/awarding-demo.ts`, `src/lib/demo/awarding.ts` |

The six lanes, in the order the page prints them: Class A, Class B, Class C, Class D, Net overall,
Gross overall. A class lane is ranked on net points, the gross overall board on gross points. The
class is the flight the desk assigned, which is what the desk screens and the public cards already
print as the class.

## Where the lane state lives

`tournaments.publish_views` is one JSON object. The awarding adds one key:

```json
{
  "resultsLanes": {
    "classA": { "state": "released", "board": [{"position": 1, "name": "...", "score": 38, "tie": false}] },
    "classB": { "state": "held", "releaseAt": "2026-11-15T14:00:15Z", "board": [] },
    "classC": { "state": "held" },
    "classD": { "state": "held" },
    "netOverall": { "state": "held" },
    "grossOverall": { "state": "held" }
  }
}
```

One lane write never touches another lane. The board is the top three the desk confirmed, and it is
returned to the public only while that lane is released.

## Every public route that returns scores or player data, and how it is gated

| Route | What it can return | Gate |
| --- | --- | --- |
| `/results` (awarding) | the six lane boards | `public_reveal_state()` returns a board only for a released lane. Without the migration, the page falls back to the `leaderboard` release key. |
| `/results/all` (All scores) | every player's published card | `public_team_leaderboard()` and the `leaderboard` release key, inside the database. |
| `/leaderboard` | the cumulative pair board | same `leaderboard` key, inside the database. |
| `/pairings` (pairings tab) | pairings, tee times, rules | `pairings`, `teeTimes` and `rules` keys. These stay open during the awarding, by the owner's decision. |
| `/pairings?tab=profile` | one player's scorecard and team total | `public_player_scorecard()` and the `leaderboard` key; held means the page asks for nothing. |
| `/roster` | the confirmed field | the `roster` key empties the players section inside `public_programme()`. |
| `/tv` | the clubhouse board | the same reads as the leaderboard, plus the `leaderboard` key. |
| `/` (home) | the leaderboard teaser | the `leaderboard` key; held means the teaser is not read at all. |
| `/api/results/reveal` | two surface booleans, one time, six lane states and the released boards | reads the two public functions; it can never widen what they answer. |

`/spotlight/[id]` is an operator display fed by the desk's own browser store, not a signed-out public
page, and is not part of the blackout.

## The demo

`AWARDING_DEMO=1` on a **preview** deployment serves the demo build's fictional sample boards for all
six lanes on a three-minute loop: all six held, then Class A counts down and appears, then Class B, and
so on. It needs no database, so it works on a deployment that has not applied the migration.

The flag is refused when `VERCEL_ENV=production`, and refused again for a production build without
Vercel. A stray variable on the production project cannot switch sample scores on.

## What the owner still does

1. **Apply `20261115000200_results_reveal.sql`.** Until then the desk can hold and release lanes and
   the public page falls back to the existing `leaderboard` key: one switch for all six boards, no
   per-lane countdown.
2. **Set `AWARDING_DEMO=1` on the staging preview** (not on production) to rehearse the flow.
3. **Look at the T marks on `/awarding` before releasing a lane.** The board shows what the desk
   confirms; the display never decides a tie.

## Known limits

- The desk page performs the release when its countdown reaches zero. If it is closed mid-countdown the
  lane stays held (nothing leaks) and the next visit finishes it.
- A tie at the cut is marked on the third row rather than expanded to four rows. The desk decides.
- The awarding page is `noindex`: it is for the room, not for search results.
