# Acceptance test run sheet

For the organizer. One session, about ninety minutes. Print this, or keep it open beside the desk.

## Write this down first

| | |
| --- | --- |
| **Version or build** | shown at the bottom of the desk and on the sign-in page. Copy it exactly. |
| Date | |
| Who is testing | |
| Signed in as | the role is shown next to the name in the top bar |

The version matters. Results are only comparable between testers who tested the same build, so a
finding is only useful with the version beside it.

## Before you start

Two things have to be true, or some steps cannot be done:

- **A staff account for the organizer.** If you are still using the two test accounts, say so on the
  form: their passwords are temporary and must be rotated before the real event.
- **A player account, for step 8.** Without one, skip step 8 and write "no player account yet" rather
  than marking it failed.

Steps 1, 2, 7 and 8 need an internet connection. Everything else is the desk.

## How to score what you find

| Severity | Means | Example |
| --- | --- | --- |
| **1. Stops the event** | The club cannot run the day | The draw will not generate; a sheet prints wrong |
| **2. Slows the desk or looks wrong** | Usable, but you would not want it on the day | A label that reads oddly; a save that needs two tries |
| **3. Polish** | Worth noting, not blocking | Spacing, wording, a colour |

Write the step number, what you did, what happened, and what you expected. A screenshot helps but the
steps are more important.

## The walkthrough

**1. The public side.** Open the site with no account at all.
*You should see:* the landing page, and the published pairings with no sign-in. If nothing has been
published yet the pairings page says so, which is correct.

**2. Sign in.** Sign in as the organizer.
*You should see:* the control room, with your name and role in the top bar.

**Expected once, and not a finding:** on the first load right after signing in, the desk may say "The
tournament desk did not load" with a Retry button. **Reload the page** and it works. This is a known
issue (gap 16 in the plan), it only happens on that first load, and it is fixed by the reload. Do not
write it up. If it happens on any *other* load, do write it up.

**3. Settings.** Open Settings and enter the club's real Course Rating, Slope, Par and stroke index,
the categories and the flight ranges.
*You should see:* every section saving, and the session bar saying the write landed. Type a stroke
index twice and the card should refuse to be called complete.

*To test the stale-save guard properly, use two browser tabs.* Load Settings in both, change something
in the first and save, then change something in the second and save. The second save should be refused
and ask you to reload, rather than overwriting the first. Saving twice in one tab is not a test of
this: the second save is not stale.

*Then tick "These tees and holes match the club scorecard"* and confirm the course section stops
warning. Change one rating afterwards and the tick should withdraw itself.

If the club's scorecard has not arrived, **do not invent numbers**. Leave the sample values, leave the
card unconfirmed, and note that the printed sheets carry a placeholder mark because of it. That is the
designed behaviour, not a fault.

**4. Players.** Add two or three players with a birthdate, gender and handicap index.
*You should see:* each one routed to a category and a tee by the rules you entered, and anything
missing from a record flagged as needing review rather than guessed at.

**5. The draw.** Make the draw. Move one player by hand and give a reason. Lock a group, then re-run
the draw with "keep locks".
*You should see:* the moved player staying where you put them, the locked group not moving, and the
rest re-proposed.

**6. Print.** Print the start sheet, the pairings and one group's scorecards, on the club's paper.
*You should see:* the layout surviving A4, the pages readable after a photocopier, and the scorecards
carrying the right holes and stroke indexes. If the card is unconfirmed, the placeholder mark should
be there, and it should be obvious.

**7. Publish.** Publish the pairings, then open them on a phone and search a name.
*You should see:* a version number, and the published list matching what the desk shows. Then open the
desk again and confirm it says the published version is out.

**8. The player side.** Sign in as a player, claim the member record, and look at the entry and the
start time.
*You should see:* only that player's own entry, with the start time and group. Nothing about anyone
else. If you have no player account, skip this and say so.

## Findings

| # | Step | What I did | What happened | Severity |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |

## If something stops you

Tell the desk at once rather than working around it. If the site goes down completely, the day runs
from the printed sheets: see [the runbook](RUNBOOK.md). Print the sheets **before** the event, not on
the morning.
