# Pending migrations (written, not applied)

As of 8 Nov 2026. Apply in this order in the Supabase SQL editor. Every file is additive. Nothing
here has been run by an agent. `20261108000100_open_round.sql` was applied by the owner on 8 Nov
2026 and is not repeated here.

| # | File | What it adds | Needed by |
| - | ---- | ------------ | --------- |
| 1 | `20261106000000_staff_check_in.sql` | `checked_in_at` and `checked_in_by` on `registration_days`, plus the guarded arrive and undo functions. Its version sorts before migrations already applied, so apply it by hand. | Staff app arrivals |
| 2 | `20261108000200_notification_single_read.sql` | `mark_notification_read(uuid)` | Alerts bell, Mark as read |
| 3 | `20261108000300_player_self_profile.sql` | `player_own_profile()` (read) and `player_update_own_contact(phone, email, nickname)` (write), both for the caller's own record | `/my/profile` |
| 4 | `20261108000500_rounds_per_playing_day.sql` | One `competition_rounds` row per playing day, plus a trigger for days added later | Scheduling (#174) |
| 5 | `20261108000600_public_pairings_by_day.sql` | A new public pairings function that returns every playing day | Scheduling (#176) |
| 6 | `20261108000700_portal_starts_by_day.sql` | Replaces the body of the player portal function so each player gets one start per day. Same signature and grants. | Scheduling (#176) |

Rules for the SQL editor: run one file at a time, read the result, then run the next. Keep 4, 5 and
6 in that order; I did not find a hard dependency of 5 or 6 on 4, but the code that reads them
assumes all three are in. After 6, check `/my` for a player in a two-day event.

The same files live in the focus worktree (`S:\Dev\golf-management-system-sl\focus`), which is
where the work is merged. The copies here are identical so you can see and open them.
