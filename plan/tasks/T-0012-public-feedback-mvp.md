---
id: T-0012
title: Add the public feedback form and organizer inbox
milestone: M2
priority: P0
status: ready
rev: 1
objective: "Let a public visitor send improvement, bug or content feedback and give the organizer a private desk inbox to read and triage it."
outcome: "Public feedback reaches the organizer; nothing about a submission is public."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - supabase/migrations/20261110000200_public_feedback.sql
  - src/app/(public)/feedback/**
  - src/components/public/FeedbackForm.tsx
  - src/components/public/FeedbackLink.tsx
  - src/app/(public)/layout.tsx
  - src/lib/data/feedback.ts
  - src/lib/data/feedback.test.ts
  - src/lib/data/supabase/feedback.ts
  - src/lib/data/supabase/feedback.test.ts
  - src/app/(desk)/feedback/**
  - src/lib/supabase/types.ts
out_of_scope:
  - Feedback notifications, badges and email digest (T-0013).
  - Public roadmaps, upvotes or public status pages.
  - File or photo attachments.
  - Applying the migration to the live project.
interfaces:
  - public.submit_feedback(...)
  - public.public_feedback table
  - the public layout footer
  - the staff role helpers
deliverables:
  - An additive public_feedback table, RLS and submit_feedback RPC.
  - A /feedback public page and a footer/help link in three languages.
  - A desk /feedback inbox with filters, detail and statuses.
  - Validation, rate limiting, privacy copy and tests.
acceptance:
  - "AC1 [test]: Anon can submit feedback, and anon cannot select or update the table or call a staff read."
  - "AC2 [test]: Non-staff cannot read; desk can read; owner/organizer can change status."
  - "AC3 [test]: Empty, oversized, invalid-category and missing-consent submissions are refused with clear errors."
  - "AC4 [test]: The rate limit and honeypot work without storing a raw IP address."
  - "AC5 [review]: A submitted note appears in the desk inbox and can move through new, read, planned, done and dismissed."
  - "AC6 [review]: No public page shows a submission, contact detail or status."
  - "AC7 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - No anon select or update on public_feedback; inserts only through a SECURITY DEFINER RPC.
  - Contact is optional and stored only with consent; no raw IPs; no attachments.
  - The message is organizer-only and covered by a privacy note.
constraints_compatibility:
  - The public form works while pairings are held; it is about the site, not the draw.
  - Keep the public pages usable without JavaScript for the link; the form may be a client component.
database_migration: additive
escalation:
  - Owner decisions on anonymity, read/triage roles, retention and whether contact is required must be confirmed before applying.
  - If the public form cannot be rate-limited without new infrastructure, propose the smallest safe DB-backed limit instead of shipping an unprotected form.
deployment_impact: code
deployment_verification: "pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created."
---

# Context

There is no public feedback path on any branch. The help-centre "Report a bug" in decision 21 is
unbuilt and defaults to a prefilled GitHub issue, which is not an organizer inbox.

The public registration form is the pattern to follow: a SECURITY DEFINER RPC validates the input
and returns a small result; the browser never writes the table directly.

Use a new table, not the event-scoped notifications table. Feedback may be site-wide, and a
notification is not a triage record.
