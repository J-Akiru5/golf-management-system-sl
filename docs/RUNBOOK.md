# Runbook

What to do when something is wrong, and what to do on the day. Two audiences: whoever deploys, and
whoever runs the event. Plain steps, in the order they are needed.

Everything here is reversible except one thing, which is called out where it matters: **rolling the
code back does not roll the database back.**

## What is live

```bash
git fetch origin --prune
git tag --sort=-v:refname                            # newest tags first
git show v0.11.0 --no-patch --format="%H %d"         # the commit a tag points at
git ls-remote origin main                            # what main points at now
supabase migration list --linked                      # local vs applied migrations
```

Production tracks `main`, and `main` is kept level with `develop` after each merge. The app shows
`v{version} · {short commit} · {environment}` on the desk, the sign-in page and the landing page, so
a tester can read what they are actually looking at.

## Deploying

1. Confirm `main` is where you expect with `git ls-remote origin main`.
2. In Vercel, the project tracks `main`. A merge to `main` may or may not trigger a build depending
   on the project's settings: **check the dashboard rather than assuming**, and start a deploy if
   none appeared.
3. Wait for the build, then open the site once and read the version label. It must match the tag you
   intend to be live.
4. If the release carries a migration, apply it **before** deploying the code:
   `supabase db push --linked`. Migrations are written to tolerate this order, and the new code can
   then rely on the column being there.

## Rolling back

**Code:** in Vercel, open the previous successful deployment and promote it to production. That is
faster than reverting and rebuilding, and it puts the site on a build that was already known good.

**Code, in the repository:** if you would rather the history said so, revert the merge commit on
`develop`, merge that, and deploy. Do not rewrite `main`.

**The database cannot be rolled back by either of those.** A deploy that carries a migration needs
the reverse of that migration written by hand, and only if the change was destructive. Every
migration applied so far has been **additive** (a column with a default, a table, a policy, a grant),
which is deliberate: it means the previous code keeps working against the newer schema, so a code
rollback is always safe on its own. Keep it that way. If a future change has to drop or rename
something, plan its rollback before applying it, not after.

## If the site is down on the day

The desk cannot run the event without the site: entries, the draw, the start sheet and the results
all live there. So the fallback is paper, and it has to be prepared the day before, not on the day.

**Prepare the day before:**

1. Publish the pairings, so the public page shows the draw even if the desk is unreachable.
2. Print the start sheet, the pairings and one scorecard per group from the Print center. These are
   the fallback. Do not leave printing until the morning.
3. Keep the printed set with the club's own scoreboard, which is what decides the result if nothing
   digital works.

**On the day, if the site is down:**

| What still works | What does not |
| --- | --- |
| The printed start sheet and scorecards | Registration, late entries and withdrawals |
| The club's own scoreboard and rules | The draw, once it needs changing |
| Whatever was already published, if Vercel is up and only the desk is not | Anything that needs the database |

**Then:** tell the players nothing has changed about their tee time, run the day from the printed
sheet, and enter the results afterwards if the club wants a digital record. A late withdrawal is
handled by the group playing short and the organizer noting it.

## Known failure modes, and what they look like

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| "The setup changed since this screen loaded" but nobody else touched it | A stale revision: two saves from the same browser disagreed about the draw revision | Reload the page and try again. If it repeats, note the screen and the time: this was a real bug, fixed in 0.8.0, and a repeat means a new one |
| The desk shows no players or no event | Signed in, but the club has no data yet, or the load failed | Check the session bar. The connected desk starts empty on purpose; it never falls back to sample data |
| **Just signed in and the desk says "The tournament desk did not load" / "Session unavailable"** | **Known issue.** The first client load after signing in does not see the session even though the cookie is set. Reload the page and it works, every time | Reload. If it happens on any load other than the first after signing in, note the screen and the time: that would be new. See gap 16 in `docs/PLAN.md` |
| A save reports a missing column | The code is newer than the database | Apply the migrations: `supabase db push --linked`. The message names the migration |
| The bell says "Could not check alerts" | The notification check failed | It keeps the last good list rather than claiming all clear. Retry from the bell; a repeat is worth reporting |
| The version label does not match the tag you deployed | A stale build is being served | Re-deploy from the dashboard and confirm the label again |

## Doing the acceptance test

Work through [the run sheet](PLAN.md) in `docs/PLAN.md`, section 8. Write the version label from the
app onto the form: results are only comparable between testers who tested the same version. Record
every finding with a severity the same day, while the screen is still fresh.
