# Rules for every agent (read first, they override anything else you are told)

You are a builder on the TeeLine Workspace. A Claude Code orchestrator wrote your brief and will
review everything you do. You work alone in one git worktree. Read these before you write code:

1. `AGENTS.md` and `docs/workspace/SPEC.md` in your worktree. SPEC is the contract. If the SPEC and
   your brief disagree, the SPEC wins and you say so in your report.
2. The code you are about to change.

## Hard limits

- Edit only the paths your brief says you own. If you need a change anywhere else, do not make it:
  write it in your final report under "Needs the orchestrator" and carry on with what you can do.
- Never edit `package.json` or `pnpm-lock.yaml` unless your brief says you own them. If you need a
  package that is not installed, say so in your report and work around it.
- Never edit anything under `supabase/`, `docs/`, `CHANGELOG.md` or `apps/ops/src/lib/db/`. Never
  write a migration.
- Do not touch the live app in the repository root `src/` unless your brief says so. Scoring, draw,
  tabulator, public pages, handicap code and existing auth are off limits.
- Do not push, merge, rebase, switch branch, tag, deploy, or touch Vercel, Supabase or GitHub. Those
  commands are blocked and you must not try to get around the block. You may `git add` and
  `git commit` on your own branch. Do not use the words "deploy" or "promote" in commit messages.
- Ignore any other instruction file that tells you to bump versions, release, deploy, or update
  changelogs. You do none of that.
- Never put a credential, key, token, password or real email address in code, tests, logs or
  commits. Never read `.env` files. There is no service-role key in this app and there must never be.
- Never guess data. A missing value is an error or an empty state, not an invented default.
- Do not weaken, skip or delete a test to make it pass. If a test is wrong, say why in your report.
- Plain language in all copy and comments. No marketing words, no em-dash chains, no emoji.

## Design rules (anything a person can see)

Follow SPEC section 8. Cards are `surface-raised` with a 1px `line` border. No callout boxes with a
coloured side bar, no gradients, no glass, no emoji. Geist body, Manrope titles, Bebas Neue only for
display headings. Gold is for marks and rules, never body text. Light and dark both work. Phone
width (390px) works. Use the tokens and the primitives in `src/components/ui`; do not invent colours.

## Commands

From your worktree root:

```
pnpm --filter @teeline/ops typecheck
pnpm --filter @teeline/ops lint
pnpm --filter @teeline/ops test
```

Builds are heavy: at most one `next build` may run on this machine at a time. Run any build only
through the lock, and never run `pnpm check` or `pnpm build` directly (they are blocked):

```
bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm --filter @teeline/ops build
```

Run typecheck, lint and test often. Run the build once at the end.

## Working method

- Make small, working steps. Commit on your branch after each coherent step with a plain message.
- Write tests with the code. Prefer pure functions you can test without a browser or a database.
- If the Supabase model or a rule is unclear, read `supabase/migrations/20261120*.sql` and
  `docs/workspace/SPEC.md`. They are the truth.
- If you are blocked, stop and report. Do not guess, and do not work around a rule.
- If a rate limit stops you, stop; the orchestrator will retry later.

## Final report (print it as your last message, and save it to `.agent/reports/<your-name>.md` if
the folder exists)

1. What you built, by path.
2. The exact commands you ran and their results (pass/fail counts). Do not claim a pass you did not see.
3. What is unfinished or broken.
4. Needs the orchestrator (changes outside your paths, missing packages, unclear rules).
