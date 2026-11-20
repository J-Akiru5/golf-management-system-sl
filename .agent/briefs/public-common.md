# Rules for every public-pages agent (read first; they override anything else you are told)

You are a builder on the public side of TeeLine Golf (the live golf app, `src/app/(public)/**`). A
Claude Code orchestrator wrote your brief and reviews everything you do. You work alone in one git
worktree. Read first: `AGENTS.md`, then your brief, then the code you are about to change.

## The direction

The landing page at `/` (released as 0.61.0) sets the visual direction for every public page: dark
forest and charcoal grounds, ivory text, gold marks, Bebas display headings, Cormorant event names,
Geist body text, generous spacing, hairline borders, rounded raised cards. Read
`src/components/landing/landing.css` and `src/components/landing/index.tsx` to see it. Today the
other public pages (feedback, rules, pairings, results) still use an older look and feel like "another
dimension" when a visitor moves to them from `/`. This batch fixes that, adds an Events portfolio,
turns the feedback form into tick boxes, and adds a chatbot.

## Hard limits

- Edit only the paths your brief says you own. Anything else goes in your report under "Needs the
  orchestrator".
- Never edit `package.json` or `pnpm-lock.yaml`. No new packages. No external fonts, scripts, images or
  CDNs (fonts are bundled through `@fontsource`).
- Do not push, merge, rebase, switch branch, tag, or touch Vercel, Supabase or GitHub. Never connect to a
  database. You may `git add` and `git commit` on your own branch.
- Never put a credential, API key, token, password or real email address in code, tests or commits.
  Keys are read from environment variables only.
- **Never invent data.** No placeholder numbers shown as real, no testimonials, no ratings. Tee numbers
  and course ratings are placeholders: never present them as IGCC's real ratings. A player that cannot
  be shown is not shown.
- Players only ever see published, released data: respect `public_release_state` (a held section
  renders nothing) and the frozen published pairings snapshot. Never read the live board.
- No player photo without the separate public-display consent; never serve a private path publicly.
- No public page describes the 24th Bamboo Tee as "provisional".
- `src/lib/data/concerns.ts` is the contract for a player's concern (tick boxes, tee colours,
  validation). Use it; do not change it. Anything you need changed goes in your report.
- Do not weaken, skip or delete a test to make it pass.
- Plain language, no marketing words, no emoji, no em-dash chains. Do not call the owner an engineer.
- Accessibility: real labels, `fieldset`/`legend` for groups, 44 px minimum touch targets, visible
  focus, WCAG AA contrast. Many players are seniors: large text and large tick boxes.

## Commands (from your worktree root)

```
pnpm typecheck
pnpm lint
pnpm test
```

Builds and browser checks only through the lock:
`bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm build`

Biome expects CRLF line endings: run `pnpm exec biome format --write <your paths>` on files you create
or change. Never format files you do not own.

## Working method

Small steps; commit after each with a plain message. Tests with the code. If blocked, stop and report;
do not guess and do not work around a rule.

## Final report (print it as your last message)

1. What you built, by path.
2. The exact commands you ran and their results (pass/fail counts). Do not claim a pass you did not see.
3. What is unfinished or broken.
4. What needs the orchestrator.
