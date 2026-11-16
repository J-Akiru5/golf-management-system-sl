# Brief: fixes after the orchestrator's review of commit ecb7955

You are a builder. Work only in this worktree (branch `agent/card-context`). Do not push, merge,
deploy or touch any other branch. Read `AGENTS.md` first. This is a follow-up to
`BRIEF-card-context.md`; your first commit `ecb7955` is already on this branch. Make a **new
commit** on top of it (do not amend).

The orchestrator ran the desk in a browser in demo mode and found three real problems. Fix exactly
these and nothing else.

## 1. The context line says things that are not true (must fix)

`ScoresDesk.tsx` does not pass `context` yet, so on every card the line shows **Class: Not set**
and **Partner: None on file** in the warning colour. That tells the desk a player has no class and
no partner when the data was simply not loaded. It also prints on the paper card.

Change the rule in `src/lib/scoring/card-context.ts`:

- A field that is `undefined` means "the caller does not have this": **leave the part out**.
- A field that is `null` or a blank string means "the caller looked and there is none": show the
  "missing" part as now (`Class Not set`, `Partner None on file`).
- Apply this to `class` and `partner`. For `playingHandicap` keep today's behaviour only when the
  caller passed `null` (the desk always passes it, `null` meaning no snapshot, shown as
  `Not calculated`); `undefined` leaves it out.
- Update the doc comment and the tests: `undefined` omitted, `null` and blank shown as missing,
  and the old "empty input" test must change to match (empty input now returns `[]`).

In `src/components/scoring/ScorecardWorkspace.tsx`, stop collapsing `undefined` to `null` for the
fields that come from `context`: pass `context?.className`, `context?.partnerName` and so on as they
are, so a desk that passes no `context` shows only day, marker and playing handicap. Keep
`playingHandicap: selectedPlayer?.handicap?.playingHandicap ?? null` and
`markerName: selectedScorer?.playerName ?? null`.

## 2. The printed card is unreadable in the dark theme (must fix)

When the desk is in the dark theme, a printed card keeps the dark surface colour on the **Par
row, the row-label column (Par, Hcp row, Score, Net pts) and the OUT/IN total cells**, while the
text is forced to black. With "Background graphics" on, that is black on near-black.

In the print rules you added in `src/app/globals.css` (the `body:has([data-print="scorecard"])`
block), make every cell and row inside the card print on white, except the hole-number header
row, which keeps its light band `#dfe7e2` with `print-color-adjust: exact`:

- `[data-print="scorecard"] tr, th, td, tbody th` get `background: #fff !important;` and
  `color: #000 !important;`.
- `thead th` keeps `background: #dfe7e2 !important;`. Declare `thead th` after the white rule so it
  wins, or make the white rule `:not(thead th)`.
- Add `color-scheme: light;` on `[data-print="scorecard"]` inside the print block.
- The par digits must remain visible as black on white.

## 3. Smaller things (should fix)

- Hide the screen status text that prints in the card footer. In `ScorecardWorkspace.tsx` the row
  at the bottom of the card has a "Needs 18 holes" status next to "Fill with par"; add
  `print:hidden` to that status element, and to the whole footer row if nothing else in it should
  print.
- Rename the button label from "Print card" to **"Print this card"**. The page already has a
  "Print scorecards" button that opens the print center, and the two labels must not read alike.
  Keep the icon, `min-h-11` and `onClick`.

## Rules

- Strict TypeScript, no `any`, no new dependencies. Plain language. Do not weaken or delete any
  test (changing the "empty input" expectation is part of item 1; say so in your report).
- Do not change `ScoresDesk.tsx`, the data layer, the schema, auth or RLS.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring src/components/scoring src/app/globals.css` and run
the three again. Commit with one plain subject line and stop. Do not push. In your final message
list the files changed and anything you were unsure about.
