---
id: T-0014
title: Complete the feedback event, resolution and alert follow-ups
milestone: M2
priority: P1
status: ready
rev: 1
objective: "Finish the feedback follow-ups deferred from T-0012: associate a note with an event, filter the inbox by event, record a private resolution note, show a new-feedback count in the desk shell, and queue an optional digest only when mail is configured."
outcome: "The organizer can see which event a note concerns, triage it with a resolution note, notice new notes from the desk, and optionally queue one digest without exposing anything publicly."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - supabase/migrations/20261110000300_feedback_followups.sql
  - src/lib/data/feedback.ts
  - src/lib/data/feedback.test.ts
  - src/lib/data/feedback-digest.ts
  - src/lib/data/feedback-digest.test.ts
  - src/lib/data/supabase/feedback.ts
  - src/lib/data/supabase/feedback.test.ts
  - src/lib/demo/feedback.ts
  - src/lib/demo/feedback.test.ts
  - src/lib/email/config.ts
  - src/lib/email/config.test.ts
  - src/lib/feedback-events.ts
  - src/lib/feedback-events.test.ts
  - src/lib/data/email.ts
  - src/lib/supabase/types.ts
  - src/components/feedback/FeedbackInbox.tsx
  - src/components/feedback/useFeedbackAlertCount.ts
  - src/components/AppShell.tsx
  - src/components/public/FeedbackForm.tsx
  - src/app/(public)/feedback/page.tsx
  - src/app/(desk)/feedback-inbox/page.tsx
  - src/app/api/feedback/digest/route.ts
  - src/lib/i18n/dictionaries/en.ts
  - src/lib/i18n/dictionaries/tl.ts
  - src/lib/i18n/dictionaries/hil.ts
  - CHANGELOG.md
  - docs/PLAN.md
out_of_scope:
  - Public feedback, counts or resolution notes.
  - Changing the event publish policy or the frozen draw.
  - Applying the migration to the live project without owner approval.
interfaces:
  - public.public_feedback (new tournament_id, resolution_note and audit columns)
  - public.submit_feedback(..., p_tournament uuid)
  - public.email_outbox kind feedback_digest
deliverables:
  - Additive follow-up migration and event/visibility validation.
  - Event filter and labels in the inbox.
  - Resolution note editor with owner/organizer enforcement.
  - Private new-feedback count in the desk shell.
  - Optional digest route guarded by mail configuration.
  - Tests, changelog and plan record.
acceptance:
  - "AC1 [test]: A note stores a valid event when supplied or a general null; a caller cannot choose another club's event."
  - "AC2 [test]: The inbox filters and labels by event without exposing feedback publicly."
  - "AC3 [review]: Only owner/organizer can save a resolution note; desk is read-only."
  - "AC4 [test]: The new-feedback count appears and clears on status changes; no public count."
  - "AC5 [review]: A digest is queued only when mail is configured; the inbox still works without it."
  - "AC6 [cmd]: pnpm typecheck, pnpm lint, pnpm test and pnpm build pass; browser checks pass."
constraints_security:
  - Never expose feedback, counts or resolution notes publicly.
  - Validate the event server-side against the resolved club and public visibility.
  - Keep the table grants narrow; do not allow contact or message edits.
constraints_compatibility:
  - The migration is additive; existing feedback remains readable with a null event.
  - Do not record delivery until the provider answers.
database_migration: additive
escalation:
  - Owner approval is required before applying the migration to the live project.
deployment_impact: code
deployment_verification: "pnpm typecheck, pnpm lint, pnpm test, pnpm build and pnpm verify:ui; static check that vercel.json is unchanged and no deployment is created."
---

# Context

This closes the event filter, resolution note and notification follow-ups from issue #208 and issue
#210. The feedback MVP and the public release policy are already on `develop`. The migration is
prepared but not applied; the owner applies it separately.
