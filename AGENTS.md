# AGENTS.md

Guidance for AI coding agents (OpenCode, Claude Code and others). Humans: see `README.md` and `docs/PLAN.md`.

## Read first

1. `docs/PLAN.md`: current status, verified gaps, roadmap, open decisions.
2. `docs/spec/IGCC_Tournament_Desk.md`: the confirmed rules and build spec.
3. The code you are about to change.

If the plan and the code disagree, trust the code and tell the owner so the plan gets fixed.

## Project

Golf tournament management for Iloilo Golf & Country Club (Syntaxure Labs). Auto-routes players to
category, tee, flight, group and start slot; the organizer reviews and publishes. Multi-tenant ready
(`club_id` on every table), IGCC is the only club for now.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck && pnpm lint && pnpm test   # run all three before every commit
pnpm build
```

## Stack

Next.js 16 App Router, React 19, strict TypeScript (`noUncheckedIndexedAccess`), pnpm, Biome
(lint and format), Vitest, `supabase-js` with SQL migrations in `supabase/migrations` (no Prisma). Deploys to Vercel.

## Rules

- Golf rules (allowance, max index, age bands, wave gap, group size) are **tournament settings**. Never hard-code them in the engine.
- `src/lib/routing` and `src/lib/draw` are pure functions. No I/O there. Add tests with every change.
- Never guess data. A player who cannot be routed is `needs_review`, not given a default.
- Players only see the frozen `Published` snapshot, never the live board.
- Photos only where consent is recorded. Never on public pages.
- Tee numbers in the demo and tests are placeholders. Do not present them as IGCC's real ratings.
- Fonts and assets are bundled; no external font or script calls.
- Do not weaken or delete a test to make it pass.

## Ask the owner before

Applying migrations to a real project, changing the schema, auth or RLS, changing a confirmed rule,
deleting data or branches, or adding infrastructure. Do not ask the owner for things you can verify
by reading the code.

## Git

Base branch `develop`. Work on a feature branch and open a PR into `develop`; the owner merges.
Do not push to `develop` directly. `main` exists but is behind `develop`; there is no `staging` yet.
Check the remote (`git ls-remote`) before stating what is merged.

## Writing style

Plain language. No em-dash pile-ups, no marketing words. Do not call the owner an "engineer" in documents.
