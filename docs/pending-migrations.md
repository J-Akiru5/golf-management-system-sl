# Migrations written in the 8 Nov 2026 session

As of 8 Nov 2026. The owner reports that **all nine files below have been run** in the Supabase SQL
editor (`20261108000100_open_round.sql` earlier, files 1 to 6 after the first batch, files 7 to 9 after
the scheduling follow-up). That is the owner's report. It has not been checked from this tree: the
Supabase CLI account here gets 403 and the connector only offers logs. Every file is additive and
idempotent (`if not exists` or `create or replace`), so re-running one is harmless.

| # | File | What it adds | Needed by |
| - | ---- | ------------ | --------- |
| 1 | `20261106000000_staff_check_in.sql` | `checked_in_at` and `checked_in_by` on `registration_days`, plus the guarded arrive and undo functions. Its version sorts before migrations already applied, so it was applied by hand. | Staff app arrivals |
| 2 | `20261108000200_notification_single_read.sql` | `mark_notification_read(uuid)` | Alerts bell, Mark as read |
| 3 | `20261108000300_player_self_profile.sql` | `player_own_profile()` (read) and `player_update_own_contact(phone, email, nickname)` (write), both for the caller's own record | `/my/profile` |
| 4 | `20261108000500_rounds_per_playing_day.sql` | One `competition_rounds` row per playing day, plus a trigger for days added later | Scheduling (#174) |
| 5 | `20261108000600_public_pairings_by_day.sql` | A new public pairings function that returns every playing day | Scheduling (#176) |
| 6 | `20261108000700_portal_starts_by_day.sql` | Replaces the body of the player portal function so each player gets one start per day. Same signature and grants. | Scheduling (#176) |
| 7 | `20261108000800_day_pm_start.sql` | One nullable column, `tournament_days.pm_start_time`, a playing day's own afternoon start | Tee times: per-day PM start |
| 8 | `20261108000900_save_draw_requires_day.sql` | Replaces the body of `save_draw`: an unnamed save is refused once an event has more than one round, so it can no longer wipe every day's board. Signature and grants unchanged. | Scheduling (C9) |
| 9 | `20261108001000_notifications_per_day.sql` | Replaces the body of `sync_notifications`: a ready player is "unplaced" per playing day they selected, not once for the whole event. Signature and grants unchanged. | Alerts (C10) |

`20261108000100_open_round.sql` (opening a scoring round from the published draw) is applied and is
not repeated in the table.

## What to check after running them

None of these checks has been run by an agent. They are quick to do from the SQL editor or the app:

- **7:** `select column_name from information_schema.columns where table_name = 'tournament_days' and column_name = 'pm_start_time';` returns one row.
- **4:** every playing day of the 24th Bamboo Tee has a round: `select count(*) from public.competition_rounds` should equal the number of playing days of the event.
- **8:** on a multi-day event the desk still saves a draw (it always names the day). A save that sends no round should now be refused with a message, not replace the board.
- **9:** in a two-day event, take a player off day 2's board; the Alerts bell should raise the unplaced warning for that day.
- **5 and 6:** `/pairings` lists each day, and `/my` for a player in a two-day event shows one start per day.

## Which code needs which file

The released code (v0.28.0 on `main`) and the scheduling follow-up (on `staging` and `develop`, not yet
on `main`) both tolerate a missing file 7: the loader reads the afternoon start on its own and falls
back to the defaults if the column is absent. Files 4, 5 and 6 are needed for a real multi-day event.
Files 8 and 9 only harden what already works.

## Where the files are

The migration files are in `supabase/migrations/` in this folder and in the released branches. This
folder holds copies identical to the ones on `develop`, so you can see and open them in the file tree.
