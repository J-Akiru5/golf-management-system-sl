---
id: T-0007
title: Add a dedicated public player roster that excludes pairings and private data
milestone: M2
priority: P1
status: ready
rev: 1
objective: "Add a public /roster route that reuses the published, allow-listed programme projection, supports name search and flight filtering, and proves the browser payload never carries a tee time, pairing key, contact detail or private photo path."
outcome: "Players and spectators can browse the confirmed field without seeing the draw or any private data, and the roster disappears while the event is unpublished."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/app/(public)/roster/**
  - src/app/(public)/pairings/**
  - src/components/public/**
  - src/lib/data/public.ts
  - src/lib/data/supabase/public-programme.ts
  - src/lib/data/types.ts
  - src/lib/seo.ts
  - src/app/sitemap.ts
  - docs/tasks/2026-11-08-public-roster.md
out_of_scope:
  - Changing the public_programme() SQL function or adding a migration.
  - Showing tee times, groups, start holes or pairings on the roster.
  - Serving private player photos, or public photos without the existing separate public-display consent projection.
  - Changing the published pairings page beyond a link to the roster.
interfaces:
  - public_programme(p_tournament uuid) from 20261041000000
  - PublicProgramme and PublicProgrammePlayer in src/lib/data/types.ts
  - mapPublicProgramme in src/lib/data/public.ts
  - loadPublicProgramme in src/lib/data/supabase/public-programme.ts
deliverables:
  - A server-rendered /roster page available without login.
  - A client roster component with name search and a flight or division filter.
  - A server-side projection that passes only roster fields to the browser.
  - Unit tests for the filter and for the allow-listed roster type.
  - A link from /pairings and a sitemap entry.
  - A short task note describing what the roster shows and what it never shows.
acceptance:
  - "AC1 [test]: The roster projection returns only the allow-listed player fields; a fixture carrying tee times, pairing keys, email, phone, birthdate, gender, notes and private photo paths serializes with none of those fields present."
  - "AC2 [test]: Name search is case-insensitive and matches partial names; the flight filter returns only the selected flight and clearing it restores the full list."
  - "AC3 [review]: /roster renders the published field without login, returns no roster content while the event is unpublished, and a page source check shows no tee time, hole, group, email, phone or private photo path."
  - "AC4 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - The roster reads through the existing published allow-list and never queries a private table from the browser.
  - No contact detail, birthdate, gender, note, billing field or private photo path is added to any public type or payload.
  - Public photos are out of scope unless the existing public-display consent projection is used unchanged.
constraints_compatibility:
  - Keep the published pairings page and its frozen snapshot unchanged except for a link to the roster.
  - The roster must keep working in demo mode with the existing demo programme data.
database_migration: none
escalation:
  - Stop if a field the issue asks for is not present in the published allow-list; propose an additive projection instead of reading a private table.
  - Stop if showing registration status would require exposing a new private field.
deployment_impact: code
deployment_verification: "Focused unit checks plus pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json, package.json and the public_programme() migration are unchanged. No deployment is created."
---

# Context

Issue #185. The public programme at `/pairings` already shows a player list with name, home club, frozen index, category and flight, and `public_programme()` already returns null while the event is unpublished. The issue asks for a dedicated roster route, a flight filter, and a backend payload that is stripped before it reaches an unauthenticated browser.

This task closes that gap without a schema change. The roster is a server-side projection of the existing published programme: the browser receives only the roster fields, never the day times, groups, pairings or rules that share the same source. The page is public but its data is gated by the same published check the pairings page already relies on.

The issue also lists photos and registration status as allowed. Both stay out of this task because the existing public photo path needs the separate public-display consent and the registration status is not part of the current projection. Showing them is a later owner decision, not a reason to read a private table.
