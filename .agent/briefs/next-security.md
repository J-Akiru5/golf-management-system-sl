# Brief: NEXTSEC (independent; branch chore/next-security from origin/develop)

Goal: upgrade Next.js in the LIVE app so `next build` stops failing on the security advisory, with no
change in behaviour. The owner will review it in the morning; it is NOT merged by you and not deployed.

Context, verified on 20 Nov 2026: the root app pins `next ^16.4.2` and resolves 16.4.2. npm's advisory
service reports it as affected (all of 16.4.0 to 16.4.4). 16.4.5 and 16.4.6 exist; 16.4.6 is the latest
stable and is not listed as affected. At the end of every `next build` the check stops the build with
`SecurityFatalError`. Typecheck, lint, tests and the compile step already pass.

Note: this branch does not contain `docs/workspace/SPEC.md` or `apps/`. Ignore the parts of the common
rules that refer to them. You own the root `package.json` and `pnpm-lock.yaml` on this branch.

## Do
1. Raise `next` to `^16.4.6` in the root `package.json` and update the lockfile
   (`pnpm install`). Change nothing else in `package.json` except what the upgrade strictly needs
   (for example a matching `eslint-config-next` or `@next/*` package if one is present).
2. Read the Next.js 16.4.5 and 16.4.6 release notes and any breaking-change notes between 16.4.2 and
   16.4.6, and check this repo for each affected API (`use cache`, `unstable_cache`, image optimisation of
   SVGs, edge runtime routes, root params, cache components). Report which of those the app uses, if any.
3. At the repo root run `pnpm typecheck`, `pnpm lint`, `pnpm test`. Fix only what the upgrade breaks, with the
   smallest possible change, and list every such change.
4. Run the build once through the lock: `bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm build`.
   It must complete with no `SecurityFatalError`. (You are allowed to run this exact command; the plain
   `pnpm build` is blocked.)
5. Run `pnpm audit --prod` and paste the summary into your report. Do not "fix" anything else it lists.

## Report
The final report (rules in the common brief) must state: versions before and after, every file changed, the
results of typecheck, lint, test and the build with counts, which affected Next.js features the app uses, and
anything you were unsure about. Commit on your branch with a plain message.
