---
id: T-0004
title: Normalise calendar conflicts and sparse dates
milestone: M1
priority: P2
status: ready
rev: 1
objective: "Close audit findings C7 and C8 so calendar conflicts compare normalised times, preview every day's start, and handle dates without a day row and non-playing days."
outcome: The calendar save gate blocks real double bookings instead of allowing them as warnings, and it ignores days the club is not playing.
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/lib/calendar/**
  - "src/app/(desk)/calendar/**"
out_of_scope:
  - Changing the database calendar trigger or the .ics export format.
  - Redesigning the calendar screens.
interfaces:
  - CalendarEvent and findCalendarConflicts in src/lib/calendar
  - The desk calendar edit sheet
deliverables:
  - Normalised start-time comparison and a per-day conflict preview.
  - Tests for normalisation, sparse dates and non-playing days.
acceptance:
  - "AC1 [test]: 06:30 and 06:30:00 on the same course and date are reported as the same slot and block a save."
  - "AC2 [test]: The edit preview maps each draft date to that existing day's start time, so a conflict on the second day is blocking."
  - "AC3 [test]: A date in dates but missing from days is checked, and a day with isPlayingDay false is ignored."
  - "AC4 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - No player or contact data is added to the calendar model.
constraints_compatibility:
  - Keep the existing CalendarEvent public shape unless the whole call site is updated.
  - Existing .ics and month-view behaviour stays unchanged for valid events.
database_migration: none
escalation:
  - If the fix needs a schema change to store per-day start times, stop and propose it as a separate contract.
deployment_impact: code
deployment_verification: pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created.
---

# Context

Audit sections C7 and C8 are untouched by the 8 November follow-up.

C7 compares raw time strings, so `06:30` and `06:30:00` are only a warning. The edit sheet gives a
start time only to day 1, so a second-day conflict is downgraded and reaches the database trigger
late. C8 builds days from `days` but not from `dates`, and shows non-playing days. A date that is in
the event's range but has no day row is not checked at all.

The audit lists the smallest fixes and tests. The calendar library is pure; keep it that way.
