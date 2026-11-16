# Brief: desk card context line and single-card print (step 2, first slice)

You are a builder. Work only in this worktree (branch `agent/card-context`). Do not push, merge,
deploy, apply migrations or touch any other branch. Read `AGENTS.md` first and follow it.

## Why

On Day 1 the standalone scoring page showed each card with the player's class, partner, team
handicap, tee and group beside the scores, and it printed one card cleanly with the TeeLine mark.
The desk card (`src/components/scoring/ScorecardWorkspace.tsx`) shows only
"Day N · Marker X · Playing handicap Y". This slice adds the context line and a print button. It
changes no data layer and no schema.

## What to build

### 1. Pure helper: `src/lib/scoring/card-context.ts` and `card-context.test.ts`

```ts
export interface CardContextInput {
  dayNumber?: number | null;
  markerName?: string | null;
  playingHandicap?: number | null;
  /** The number written in the card's HDCP box. For comparison only. */
  cardHandicap?: number | null;
  className?: string | null;
  partnerName?: string | null;
  teamHandicap?: number | null;
  teeName?: string | null;
  groupLabel?: string | null;
}

export type CardContextTone = "normal" | "missing";

export interface CardContextPart {
  key: "day" | "marker" | "class" | "partner" | "teamHandicap" | "tee" | "group"
    | "playingHandicap" | "cardHandicap";
  label: string;
  value: string;
  tone: CardContextTone;
}

export function buildCardContext(input: CardContextInput): CardContextPart[];
```

Rules:
- Return parts in this fixed order: day, marker, class, partner, teamHandicap, tee, group,
  playingHandicap, cardHandicap.
- A value that is `null`, `undefined` or blank is **left out**, except `class`, `playingHandicap`
  and `partner`, which are shown with the value `Not set` (class), `Not calculated`
  (playingHandicap) or `None on file` (partner) and `tone: "missing"`. A missing class is a fact
  the desk must see, never silently hidden. Day and marker are left out when absent.
- Never invent, default or compute a value. Do not work out the class from a handicap: the class
  bands are tournament settings and are not in this code. Show only what was passed.
- `cardHandicap` is shown as "Card HDCP" with the passed number, and only when it differs from
  `playingHandicap` (so the desk sees a difference). When they are equal, leave it out.
- Numbers print as whole numbers when whole, and with one decimal otherwise (use `fmtHcp` from
  `@/lib/format` if it fits, read it first).
- Labels are plain words: "Day", "Marker", "Class", "Partner", "Team handicap", "Tee", "Group",
  "Playing handicap", "Card HDCP".

Tests: order; each omitted field; the three "missing" cases; cardHandicap shown only on a
difference; whole and decimal numbers; empty input returns `[]` plus the three missing parts
(class, partner, playingHandicap); blank strings count as missing; no mutation.

### 2. Component: `src/components/scoring/CardContextLine.tsx`

Renders the parts as one wrapping line of "Label value" pairs. Rules for the design system, which
the orchestrator will check:

- Use only existing tokens and classes: `text-ink`, `text-ink-muted`, `text-warning` for a
  `missing` part, `mono` for numbers, `hint`, and the existing `pill warn` for a missing part if it
  reads better. No raw hex, no new CSS file, no inline `style` colours.
- A missing value must say so in words (it already does: "Not set"). Colour is never the only cue.
- Reads at 360px wide: parts wrap, nothing scrolls sideways, no truncation with ellipsis.
- It is plain text in a `<p>` (or `<dl>` if you prefer), not a row of buttons. It is not
  interactive.
- Works in the light and the dark theme because it uses tokens only.

### 3. Wire it into `ScorecardWorkspace.tsx`

- Replace the current `<p className="hint m-0">Day … · Marker … · Playing handicap …</p>` in the
  card header with `<CardContextLine parts={...} />`.
- Add one new optional prop to `ScorecardWorkspace`: `context?: { className?: string | null;
  partnerName?: string | null; teamHandicap?: number | null; teeName?: string | null;
  groupLabel?: string | null; cardHandicap?: number | null }`. Callers do not pass it yet (the data
  layer does not load these). Day, marker and playing handicap come from what the workspace already
  has. Do not touch `ScoresDesk.tsx` data loading, `src/lib/data/*` or any query.
- When `context` is not passed, the line shows day, marker and playing handicap as before, plus the
  three "missing" parts only if you decide they belong; follow the helper's rules exactly and
  accept that Class shows "Not set" until the data layer passes it.

### 4. Print one card

- Add a "Print card" button in the card header, next to "Total on card". Use the same button
  classes the workspace already uses (look at how other buttons in the file are written, for
  example `btn ghost small`) and a Lucide `Printer` icon with `aria-hidden`. Minimum height 44px
  (`min-h-11`). It calls `window.print()`.
- Add print rules so that printing from the desk shows **only the card section**
  (`#scorecard-sheet`), not the sticky picker, notices, scan panel or the rest of the page.
  Put them in the existing `@media print` block in `src/app/globals.css` that already holds the
  print-center rules (the one around line 2072), scoped so they cannot affect the print center,
  the pairings sheet or any other printed page: apply them only when the `<body>` or the card
  carries a clear opt-in, for example a `data-print="scorecard"` attribute set on the card section
  and a `:has()` selector, or a class on a wrapper that only the workspace renders. State in your
  report which selector approach you used and why it cannot leak.
- Printed card: black ink on white (the file already has a `.print-sheet-scope` rule; reuse it if
  it fits), hole-number header row dark text on a light band (`#dfe7e2`) with
  `print-color-adjust: exact`, borders 1px black, the footer line kept, input boxes shown as plain
  numbers (a printed `<input>` must show its value; check how the browser prints it, and if it does
  not, render the number as text in a print-only span next to it). The card must fit on one portrait
  page with the TeeLine horizontal mark small at the top right of the card
  (`/brand/teeline-horizontal-primary.svg`, an `<img>` with `alt="TeeLine Golf"`, about 25mm wide
  when printed, hidden on screen: `hidden print:block` or equivalent).
- Fonts and assets are bundled. No external requests.

## Rules to respect

- Strict TypeScript, `noUncheckedIndexedAccess`, no `any`, no new dependencies.
- Plain language in comments and UI text. No marketing words, no em-dash pile-ups.
- Do not weaken or delete any existing test. Existing tests for the workspace and the hole grid
  must still pass.
- Do not change `ScorecardHoleGrid.tsx` behaviour (scan states, Enter to next hole).
- Do not change the schema, the data layer, auth or RLS.

## Done means

Run these in this worktree and report the actual output. They must all pass:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

If lint reports format problems, run
`pnpm exec biome check --write src/lib/scoring src/components/scoring` and run the three commands
again. Do not run `pnpm build` or `pnpm check:ui`; the orchestrator does that.

When finished, commit on this branch with a plain message (one subject line) and stop. Do not push.
In your final message list: files changed, the test count, which print selector approach you used,
and anything you were unsure about.
