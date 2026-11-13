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

## Backups and restore

The live database is Supabase project `golf-management-system`, ref `egfwfyznbndunqfqzxjx`, in
organisation `prlnzbfjnvtizzwkjogs`.

**Where the settings are.** Supabase dashboard, project `egfwfyznbndunqfqzxjx`, **Database →
Backups**. The daily backups and the restore control are on that page. Point in Time Recovery is a
separate tab and a paid add-on; do not assume it is on.

**Confirm the plan tier first.** Backups are a paid feature. Free has none and pauses after a week
idle; Pro keeps 7 daily backups; Team keeps 14. The plan is documented as Pro, but the dashboard is
the only proof: open **Organisation → Billing** and read the tier before the event. If it says Free,
take a `supabase db dump` before the event and keep the file off this machine, because there will be
nothing to restore from.

**Restore:**

1. Open **Database → Backups** and choose the closest backup taken before the incident. The closer
   the backup, the less data is lost.
2. Read the confirmation dialog. It must name project `egfwfyznbndunqfqzxjx`. The project is
   unavailable while it restores, so do this before the first tee if you can, not during play.
3. Wait for the dashboard notification. Do not deploy or run a migration while it is restoring.
4. Sign in to the desk and check the event, the entries and the published pairings. If the backup is
   older than the code, redeploy the code that matches it (see Rolling back).
5. Tell the organizer what was lost. A daily backup can lose up to a day of entries and scores.

**What a database backup does not cover:** Storage objects. The `player-photos` bucket is not in the
database backup, and a restore does not bring back a photo deleted from Storage.

**Who holds access.** The owning Supabase account and the members of organisation
`prlnzbfjnvtizzwkjogs`. Check **Organisation → Team** before the event and make sure at least two
people can open the project, because the person on the desk may not be the person with the login.
A restore is a dashboard job: check `supabase projects list` before relying on the CLI, which has
previously been signed into an account that cannot see this project.

## Rolling back

**Find the last good release.** Every release is tagged. `git tag --sort=-v:refname` lists them
newest first, and `git show v0.27.2 --no-patch --format="%H %d"` shows the commit a tag points at.
The app prints the version on the desk, the sign-in page and the landing page, so match that label
to a deployment before promoting it. Do not reconstruct the good state from memory.

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

## Event-week watch list

Check these in the morning, after each round is published, and whenever a player reports a problem.
The 24th Bamboo Tee is played 12 to 15 November.

| What | Where | Watch | Act now when |
| --- | --- | --- | --- |
| The public site | https://golf.syntaxure.dev/ | The event strip shows the 24th Bamboo Tee, not a blank hero | The strip is missing, or the page fails twice in a row |
| Pairings | https://golf.syntaxure.dev/pairings | The published version and every group for the day | A group is missing, the version does not change after a publish, or the page errors |
| Leaderboard | https://golf.syntaxure.dev/leaderboard | One row per player with a published card; the day's count rises | A published card is missing, a score is wrong, or the count falls |
| Player view | https://golf.syntaxure.dev/my | Sign-in, then the player's own start | A player cannot see a start the desk has published |
| Health check | GitHub → Actions → Health check | Green every 15 minutes | Two runs fail in a row, or no run appears for an hour |
| Database | Supabase → Reports | API errors, database size, connections, disk | Connections above 80% of the plan's limit, disk above 80%, or 5xx errors in the logs |
| Hosting | Vercel → project → Logs | 5xx responses and failed functions | Any 5xx on `/pairings` or `/leaderboard` |

The counts that matter: entries on `/` (they should not fall while entries are closed), groups on
`/pairings` (they should match the draw), and scored cards on `/leaderboard` (they should rise after
each round). A count that falls during the day means a publish or an import replaced the day's data:
stop publishing and call.

Run the check by hand with `node scripts/health-check.mjs`; `--json` prints the same result for a
script. The GitHub workflow reads `HEALTH_SUPABASE_URL` and `HEALTH_SUPABASE_ANON_KEY` from
repository secrets. With neither set it still checks the site and skips the database line.

## Complaint desk

A player says something is wrong. The desk team files it as one GitHub issue in this repository, and
the issue is the record until it is closed. There is no separate complaint screen.

### Filing

Anyone on the desk team files a complaint, from a phone if that is where the player is standing. Go
to **Issues** → **New issue** and pick the form that matches. The form sets the title and the labels.

| The player says | Form | Labels |
| --- | --- | --- |
| Their index, playing handicap or class is wrong | Complaint: handicap index | `complaint`, `complaint:index` |
| Their tee time, hole, group or playing day is wrong | Complaint: schedule | `complaint`, `complaint:schedule` |
| A posted score is wrong, or a card went public unchecked | Complaint: score | `complaint`, `complaint:score` |
| A name is misspelled or on the wrong player | Complaint: name | `complaint`, `complaint:name` |

Add `P0` when the player cannot play until it is settled, `P1` when it affects the current day's
result, and `P2` for anything that can wait for the next event.

**While the repository is public**, the issue uses the pair number or the player ID only. No names,
no contact details, and no index written next to a name. The name form asks for a description of the
correction, not the full name. This rule drops when the owner makes the repository private.

### The states

An issue is in one of five states. Move it by writing one line in the issue saying where it stands.

1. **New.** The form was sent and nobody has looked at the claim yet.
2. **Checking.** Someone is comparing the claim against the evidence. Say who, and what they are
   checking.
3. **Fixed in the system.** The change is saved in the app. Write what changed, where, and the time.
   It goes back to **Checking** if the fix turns out to be wrong.
4. **Told the player.** The person who made the change told the player the result.
5. **Rejected.** The claim was checked and the system was right. Write which evidence settled it.

What settles each type:

| Type | Evidence that decides it |
| --- | --- |
| Index | The club's member-guest sheet, or the NGAP record. The sheet wins over a setting |
| Schedule | The tee-off sheet, or the organizer's instruction for that day |
| Score | The paper card for that round, hole by hole |
| Name | The club sheet, an ID shown at the desk, or the player's own word if the sheet is silent |

### Where to look before deciding

- `/audit`: who changed what, and when. Each row says `ok`, `refused` or `failed`, and scoring
  activity is in the same list. Only an owner or organizer account gets rows back, so a desk account
  asks Jeff or the organizer to read it.
- `/register`, on the entry, and `/draw` on the player row: **Edit index**. An index fix changes the
  entry's index, playing handicap and class. It does not move the player, so check the group again
  afterwards.
- `/scores`: the card for the day and session. Check the hole, the total, and how many holes are
  verified. Publishing is still a manual click, so an unverified card can go out; that is what the
  `needs-verification` issue below is for.

The time of the change is part of the answer. A change made before the report and a change made after
it are different answers, and `/audit` is what tells them apart.

### Who decides and who closes

**Jeff decides.** He reads the claim, the evidence and the audit row, then moves the issue to **Fixed
in the system** or **Rejected**. The person who made the change closes the issue, and only after the
player has been told. If the player is at the desk, tell them then; the issue still waits for that
sentence to be written.

One complaint, one issue. If two players raise the same problem, add them to the same issue rather
than filing a second one.

### Published before it was checked

A change may be made first and checked afterwards. That is allowed. Anything published without the
check gets its own issue labelled `needs-verification`, naming what went out, the version, and what
has not been checked yet. File it even when nobody complained: the point is to write down what is
still unconfirmed. It closes when someone has checked it against the evidence above, and the closing
line says what they checked.

## Who to call

In this order. Stop at the first person who answers.

1. **The organizer running the desk.** They decide whether the day continues on paper. The printed
   start sheet and scorecards are the fallback, prepared the day before.
2. **The club's account holder for Supabase and Vercel.** They can restore a backup, promote a
   deployment, or read the project's plan and logs.
3. **Jeff (Syntaxure Labs).** The application, the database schema and anything the first two cannot
   explain.
4. **Supabase support** for the database and auth, or **Vercel support** for hosting, after checking
   `status.supabase.com` and `www.vercelstatus.com`. Give them the project ref
   `egfwfyznbndunqfqzxjx` (Supabase) and the time of the first failure.

The phone numbers are deliberately not in this repository. Keep the current list in the club's event
folder and in the organizer's phone, and check it the day before. A role in this file is not a
contact.

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
