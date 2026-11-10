---
id: T-0013
title: Add feedback notifications and organizer digest
milestone: M2
priority: P2
status: blocked
rev: 1
objective: "Raise a private desk signal when public feedback arrives and optionally queue a digest when the mail channel is configured."
outcome: "The organizer notices new feedback without checking the inbox; no feedback content is public."
verification_profile: unit
integration_target: develop
dependencies:
  - T-0012
ownership:
  - src/app/(desk)/feedback/**
  - src/components/public/FeedbackLink.tsx
  - src/lib/data/feedback.ts
  - src/lib/data/supabase/feedback.ts
  - src/lib/data/supabase/email.ts
  - src/lib/data/supabase/email.test.ts
  - src/lib/supabase/types.ts
out_of_scope:
  - Public display of feedback or counts.
  - Email replies, attachments or a public roadmap.
  - Applying any migration to the live project.
interfaces:
  - public_feedback rows
  - the desk shell count/bell
  - email_outbox and the optional Resend sender
deliverables:
  - A private count/badge for new feedback, clearing on read/planned.
  - An optional digest queued through email_outbox when the mail channel is configured.
  - Tests and a browser check of the signal lifecycle.
acceptance:
  - "AC1 [test]: A new submission raises a private count or badge without a full page reload."
  - "AC2 [test]: Marking the item read or planned clears the signal for that item."
  - "AC3 [review]: A digest is queued only when the mail channel is configured; without it the inbox still works."
  - "AC4 [review]: No public page exposes feedback content, contact detail or a public count."
  - "AC5 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - The signal is staff-only and must not reveal the message on a public page.
  - Do not claim mail was delivered until the provider answers.
constraints_compatibility:
  - The email_outbox kind constraint may need an additive migration for a feedback digest.
  - The MVP inbox must remain usable without email.
database_migration: additive
escalation:
  - Decide whether a feedback alert is club-level or event-scoped before touching the bell.
  - Owner approval is required for any migration and for enabling Resend delivery.
deployment_impact: code
deployment_verification: "pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created."
---

# Context

This is the Phase 2 follow-up to T-0012. It may be deferred until the inbox is in use; the release
UI and the feedback MVP are the priorities for the 24th Bamboo Tee.
