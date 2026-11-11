# Notification read state and the unread list (issue 219)

## Objective

Marking a notification as read must take it out of the unread list immediately, persist across a
reload and update the other open tabs. The badge must still keep counting unresolved blocking and
warning items: that rule exists so a read mark cannot hide a publish blocker.

Issues #197 and #219 describe the same symptom. This branch fixes the UI behaviour; the database
function and its migration already existed and are recorded as applied on 8 November 2026.

## Branch

- Repository: `golf-management-system-sl`
- Worktree: `C:\Users\Client\Teeline Golf\wt-219-notification-read`
- Branch: `feat/issue-219-notification-read`, based on `origin/develop` at `bb790c4`
- Issue: #219 (duplicate of #197)

## Root cause

The panel had one list. A successful read mark set `read: true` on the row, but the row stayed in the
same list between the unread items. There was no optimistic update, so the item moved only after the
round trip, and no cross-tab signal existed.

## What changed

- `splitAlerts()` divides the list into unread and read sections.
- `AlertsBell` renders unread items as before and puts read items under a collapsed **Read (N)**
  section. A read item leaves the unread list and can still be opened.
- A single mark updates the row optimistically, then writes `mark_notification_read`; a failed write
  puts the row back and shows the error.
- Mark all updates the stored rows optimistically, reverts the whole set on failure, then writes
  `mark_notifications_read`.
- A `BroadcastChannel` (`teeline:alert-read`) carries the stored and live ids to other open tabs, so
  they update immediately instead of waiting for the next poll. The message parser ignores malformed
  or empty messages.
- The badge rule is unchanged: read info notices leave the badge; blocking and warning items stay
  until their cause is fixed. The panel footer now says so.
- The browser checks open the Read section and verify the item moved; the phone sheet checks the
  Read summary.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 182 files, 1888 tests passed.
- `pnpm build`: passed.
- `pnpm check:ui`: 167 checks passed, 0 failed, 0 console errors.
- New pure tests cover `splitAlerts`, `parseReadBroadcast` and the existing badge rules.

## Note

The persisted read row was already implemented: `mark_notification_read` in
`supabase/migrations/20261108000200_notification_single_read.sql`, recorded as applied to the live
project on 8 November 2026. No migration ships with this change.
