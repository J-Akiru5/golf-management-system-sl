# Brief: the context line must not read "Class Class A"

You are a builder. Work only in this worktree (branch `agent/desk-class`). Do not push, merge,
deploy or touch any other branch. Make a **new commit** on top of `5995c08`; do not amend.

## Problem

Class names are stored as "Class A", "Class B", "Class C", "Class D" (see `src/lib/demo/data.ts`
lines 70 to 73). The context line in `src/lib/scoring/card-context.ts` labels the part "Class" and
then prints the stored name, so the desk would read **Class Class A**.

## Fix

In `src/lib/scoring/card-context.ts`, for the `class` part only: when the class name starts with
the word "class" (any case) followed by a space, drop that leading word from the **value**, so the
line reads `Class A`, `Class B`. A name that does not start with "class" (for example "Gold" or
"A") is shown unchanged after the label. A blank or null name behaves exactly as today. Do not
change the label, the other parts, or `ScorecardWorkspace.tsx`. Do not change `classLabel` in
`src/lib/scoring/class-label.ts`: the standings table prints the full name and that is correct.

Tests, in `src/lib/scoring/card-context.test.ts`: "Class A" gives value "A"; "class b" gives "b";
"Classic" is unchanged (the word must be followed by a space); "Gold" and "A" are unchanged;
blank still gives "Not set" only when `null` or blank was passed. Do not weaken or delete any
existing test.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring` and run the three again. Commit with one plain
subject line and stop. Do not push. In your final message list the files changed.
