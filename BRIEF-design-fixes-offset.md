# Brief: the sticky card hides behind the app header (one-line fix, same branch)

You are a builder. Work only in this worktree (branch `agent/design-fixes`, one commit on it). Do not
push, merge, deploy or touch any other branch. Read `AGENTS.md` first.

## What was found

The orchestrator opened your change in the browser (demo mode, a 375px phone and a 1280px desk
screen). The sticky element is stuck at `top: 0`, but the app's own header is also sticky, 84px
tall (`--shell-header: 84px`) and has a higher z-index (`z-30` against your `z-20`). So the stuck
bar is completely behind the header: at 375px it measures 76px tall at `top: 0`, header bottom at 84,
nothing of it visible, and the Submit button disappears as soon as the page scrolls. At 1280px the
`lg:sticky lg:top-0` card is 150px tall at `top: 0`, so its first 84px (the Submit button included)
is hidden too. The original code had the same flaw, so this is not a regression, but the change is not
useful until it is fixed.

## The fix

In `src/components/scoring/ScorecardWorkspace.tsx` only:

- The phone bar uses `top-[var(--shell-header)]` instead of `top-0`.
- The desk card uses `lg:top-[var(--shell-header)]` instead of `lg:top-0`.
- Look at `src/app/globals.css` and the shell layout (search for `--shell-header` and the class
  `shell-chrome`) to confirm the variable is defined at every width the page is shown, and use the
  same variable the header itself uses, so the two cannot drift apart. If the variable has a
  different name or the header height changes at some breakpoint, use the real one.
- Keep everything else as it is. Do not change z-indexes unless the header and the bar would now
  overlap (they should not: the bar sits just below the header).
- Check whether the page already has a scroll-margin or sticky offset elsewhere (for example the
  per-nine label column inside the horizontal scroll region): that one scrolls inside its own box and
  must **not** get the header offset.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/components/scoring` and run the three again. Add one new commit
with a plain subject line (do not amend) and stop. Do not push. Do not run `pnpm check:ui`. In your
final message say which variable you used and where it is defined.
