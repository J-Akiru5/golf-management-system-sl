# Versioning and releases

How TeeLine Golf is numbered, tagged and shipped. Short on purpose.

**This file is the single source of truth for which version production runs.** If `package.json`,
`CHANGELOG.md` and the tags ever disagree, stop and reconcile them before deploying anything. A
repo-state claim about production ("it is on v0.8.0") is answered from the tag, not from memory.

## The number

`MAJOR.MINOR.PATCH`, for example `0.5.1`.

| Part | Meaning before 1.0.0 | After 1.0.0 |
| --- | --- | --- |
| MAJOR | Stays `0` until the club has signed off the acceptance test and real data is in production | Breaking change for the club or for stored data |
| MINOR | A release testers will notice: new screen, new workflow, new rule setting, or a database migration | New feature, backwards compatible |
| PATCH | Fixes and documentation only; no new migration | Fixes only |

`1.0.0` is a decision, not a date. It means: the organizer has run the acceptance test on real event
data, the open items in `docs/PLAN.md` are closed, and the database is on a paid
Supabase plan.

## Where the version lives

- `package.json` `version` and the root `VERSION` file are the source of truth for the number. Bump both in the pull request that makes the release.
- **Git tag `vMAJOR.MINOR.PATCH` marks the released commit**: the merge commit on `develop` that carries that bump. The tag, not the tip of `main`, is the authoritative release.
- `CHANGELOG.md` has one section per version, newest first, with the migrations that ship with it.
- The app should show `v{version} · {short commit} · {environment}` somewhere staff can see it (footer
  or About), so a tester can quote exactly what they tested. This is tracked as a task, not yet built.

## What production is running

```
git tag --sort=-v:refname                             # newest tags first
git show v0.8.0 --no-patch --format="%H %d"           # the commit the tag points at
git ls-remote origin main                             # what main points at right now
```

Production serves the latest tag's code. `main` may carry a docs-only commit after the tag; that does
not change the build, and the tag stays the release. Any **code** change reaches `main` only as a new
tagged release.

## Code and database are released separately

The database is one live Supabase project. Migrations are applied by the owner and can run ahead of
the code on `develop`. So every CHANGELOG entry lists its migrations and says whether they are applied.
Before deploying a version, check `supabase migration list --linked` against the migrations that
version expects.

## How to cut a release

1. Make sure the work is merged into `develop` (the orchestrator merges reviewed issue branches directly, no pull request) and `pnpm typecheck && pnpm lint && pnpm test` pass there. Promote the stable batch to `staging` and check it there.
2. Commit a small change on `develop` that bumps `package.json` and moves the Unreleased notes in `CHANGELOG.md` under the new version with today's date.
3. Ask the owner before moving `main`.
4. Tag the merge commit and push the tag:

   ```bash
   git checkout develop && git pull
   git tag -a v0.6.0 -m "TeeLine Golf 0.6.0"
   git push origin v0.6.0
   ```

5. Optional: on GitHub, Releases, "Draft a new release", pick the tag, paste the CHANGELOG section.
6. Production tracks `main`. Move `main` forward to the tagged commit only when the owner wants that
   version live, and say so in the release notes. `main` carries only released code; a docs-only commit
   may follow the tag, but never an untagged code change.

Do not tag a commit that has not been through step 1. Do not move or delete a published tag; ship a
new patch instead.

## Tags for the versions already built

The history below was reconstructed from the merge log on 18 Oct 2026. The tags are published; follow
the process above from the next release. Versions 0.6.0 onward point at the merge commit that carries
their `package.json` bump.

| Version | Commit | What it is |
| --- | --- | --- |
| v0.1.0 | `2fdebe6040b2e6d4b60115eda0641dc2a37608fd` | Scaffold, routing engine, NGAP import |
| v0.2.0 | `6d49b6cdc4046f128d39e9c3ecbe6467d12670d3` | Organizer UI, design system, plan |
| v0.3.0 | `7e4525cf6b309eeaddc955702ca25c2a813b97ab` | Supabase, staff auth, TeeLine rebrand, entry link |
| v0.4.0 | `11812f1ce60cb05b0e366bb676d969d664890dd8` | Desk components, print sheets, wiring, register confirm |
| v0.5.0 | `5302371b1d6cf31b47b744a0a23f50ff4488b93b` | Versioned publish, player area |
| v0.5.1 | merge commit of the PR that added this file | Event setup call, fixes, versioning docs |
| v0.6.0 | `1fd2b76960f8528c39fa70072121df31e2e15e0b` | Alerts bell, paged lists, import review tabs |
| v0.6.1 | `54683ff2521936dd45802d88563512485008814b` | Browser check and the two bugs it found |
| v0.7.0 | `45dce3c10115e702c97501a4d6c29cbda341ecad` | Settings that save, deployed entry link, Add a day |
| v0.19.0 | `7143f20480268a78526f2a947bce294d6946200b` | Landing motion, footer and legal pages; production baseline before 0.22.0 |
| v0.22.0 | `e5716376032f4ea9c29f69e94ddf4d51e79e6c0e` | Production integrity, registration workbook import, structured playing days, public day picker, Tee times screen, scoring reconciliation |
| v0.23.0 | release merge commit (see the tag) | Connected scorecard workflow: `/scores` reads and writes through the guarded scoring RPCs, with proposed defaults |
| v0.23.1 | release merge commit (see the tag) | Registration workbook day-column import fix; no migration |
| v0.24.0 | release merge commit (see the tag) | Caddie profiles and assignment, two-consent public player photos, public leaderboard, admin player editing and audit reader; migration `20261039000000` applied and recorded 22 Oct 2026 |
| v0.25.0 | release merge commit (see the tag) | Scorecard photo scan with private R2 storage and an optional reviewed card reader; no migration |

**0.20.0 and 0.21.0 were develop-only version numbers.** They were never tagged or promoted to `main`.
`v0.22.0` was the next release after `v0.19.0`; `v0.23.0` adds the connected scorecard workflow.

After the release pull request is merged, tag its merge commit:

```bash
git checkout develop && git pull
git tag -a v0.25.0 -m "TeeLine Golf 0.25.0"
git push origin v0.25.0
```

```bash
git tag -a v0.1.0 2fdebe6040b2e6d4b60115eda0641dc2a37608fd -m "TeeLine Golf 0.1.0"
git tag -a v0.2.0 6d49b6cdc4046f128d39e9c3ecbe6467d12670d3 -m "TeeLine Golf 0.2.0"
git tag -a v0.3.0 7e4525cf6b309eeaddc955702ca25c2a813b97ab -m "TeeLine Golf 0.3.0"
git tag -a v0.4.0 11812f1ce60cb05b0e366bb676d969d664890dd8 -m "TeeLine Golf 0.4.0"
git tag -a v0.5.0 5302371b1d6cf31b47b744a0a23f50ff4488b93b -m "TeeLine Golf 0.5.0"
git push origin --tags
```

Note that `package.json` said `0.1.0` on every one of these commits. The numbers 0.2.0 to 0.5.0 are
labels applied afterwards; only 0.5.1 onward match the file at the tagged commit.

## For the acceptance test

Testers write the version shown in the app (or the tag) in the "Version or build" field of the test
form. Results are only comparable between testers who tested the same version.
