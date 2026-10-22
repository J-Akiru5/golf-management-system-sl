# New-entry alerts at the desk

A player who submits the public entry form is written with `status = 'needs_review'`. Before this
change the bell only showed a stored summary ("N registrations need review"), which the desk had to
notice and act on. It now shows **one alert per waiting entry, with the player's name**, and the desk
can see an entry arrive while the screen is open.

## What the desk sees

- A warning in the bell: **New entry: Ana Cruz**.
- The link goes to `/register`, where the entry is confirmed or rejected.
- Confirming or rejecting the entry removes its alert. There is no separate "mark read": the
  acknowledgement is the confirmation, so an alert cannot be dismissed while the entry is still
  waiting.
- The stored `needs_review` summary is hidden while per-entry alerts exist, so the badge counts
  two players as two, not three.

The same alerts belong to every owner and organizer who can see the event; the registrations read
through the existing row-level security, so no new access rule was added.

## How it stays current

The bell already loads the event's registrations. Each alert is derived from that list, not stored:

- A one-minute timer, and returning to the tab, asks the database for **one count**: how many entries
  for this event are still `needs_review`.
- When the count rises, the desk reloads once. The new registration is now in the list, so its alert
  appears with the next render.
- Nothing reloads on a timer when the count is unchanged, and no reload is triggered by the timer
  itself. That keeps a half-typed form from being thrown away.

Limits worth stating plainly:

- The alert is in-app only. It appears while a desk screen is open (or when one is next opened).
  Email is Phase 2 and needs the Resend key and a verified sender domain.
- The count is read with the signed-in member's session; a signed-out visitor sees nothing.
- If the count cannot be read, the bell keeps its last state rather than claiming zero.

## Why this does not add a notification row

A stored `registration_new` row would need a trigger on `registrations` and a change to
`sync_notifications`, whose first statement resolves every open notification for the event. The
registrations are already loaded in the bell, so deriving the alert avoids both, cannot go stale, and
cannot disagree with the registration list. A stored row becomes worthwhile when the same fact must
also drive email or an audit trail; that is when Phase 2 adds it, with the digest.

## Where the code is

- `src/components/notifications/alerts.ts` — `registrationAlerts`, the aggregate suppression in
  `buildAlerts`, and the `/register` fix link.
- `src/components/notifications/AlertsBell.tsx` — the merge with stored and live alerts, the timer and
  focus poll, and the reload-on-rise.
- `src/lib/data/notifications.ts` — `pendingRegistrationCount`, a `head` count over one event's
  `needs_review` entries.
- Tests: `src/components/notifications/alerts.test.ts` and `src/lib/data/notifications.test.ts`.
