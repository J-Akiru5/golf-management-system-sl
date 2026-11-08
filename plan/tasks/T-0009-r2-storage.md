---
id: T-0009
title: Generalise Cloudflare R2 storage for media and documents
milestone: M2
priority: P1
status: ready
rev: 1
objective: "Turn the scorecard-scan R2 client into a reusable storage service with validated presigned uploads and downloads, public or signed URL selection, deletion, a staff-guarded upload route and an owner runbook, without changing the live scan contract."
outcome: "Player avatars, event logos, course maps and generated PDFs have one storage path that validates type and size, keeps secrets on the server and still supports the existing scorecard scan."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/lib/storage/**
  - src/lib/scoring/scan/r2.ts
  - src/lib/scoring/scan/r2.test.ts
  - src/app/api/storage/**
  - src/app/api/scoring/scan/presign/route.ts
  - .env.example
  - docs/tasks/2026-11-08-r2-storage.md
out_of_scope:
  - Creating a Cloudflare account, bucket, custom domain, CORS rule or API token.
  - Applying a migration or changing a Supabase bucket policy.
  - Wiring a player avatar upload that needs a new auth or RLS rule.
  - Changing the scorecard scan request or response contract.
  - Deploying any branch or changing vercel.json.
interfaces:
  - src/lib/scoring/scan/r2.ts
  - src/app/api/scoring/scan/presign/route.ts
  - .env.example R2 variables
  - aws4fetch AwsClient and AwsV4Signer
deliverables:
  - A reusable R2 configuration and client module with no secret logging.
  - Presigned PUT and GET helpers, a public URL helper, a delete helper and typed validation errors.
  - MIME and size validation for images and PDFs.
  - A staff-guarded presign route that returns only the upload URL, headers, key and expiry.
  - Unit tests with a mocked signer and fetch; no network call in the suite.
  - An owner runbook for bucket, token, CORS, custom domain and environment setup.
  - A refactor of the scan presign route onto the shared client with unchanged behaviour.
acceptance:
  - "AC1 [test]: Configuration parsing rejects missing account, key, secret or bucket values, accepts an optional public URL and endpoint, and no error or log line contains a secret value."
  - "AC2 [test]: The MIME allow-list accepts JPEG, PNG, WebP and PDF, rejects other types, enforces the image and document size caps, and returns a typed validation error for each rejection."
  - "AC3 [test]: Presigned PUT and GET return a URL, method, key and expiry with the expected signed query, delete issues one bucket request, and the suite makes no real network call."
  - "AC4 [review]: The existing scorecard scan presign route still returns the same shape and the scan UI is unchanged; the new upload route refuses an unauthenticated caller and never returns an access key or secret."
  - "AC5 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - Secrets stay server-side; no key, secret, token or signed URL is logged or committed.
  - The .env.example file carries variable names and comments only, never values.
  - "The upload route checks the caller's role before signing and scopes the object key to the club and use case."
  - The bucket remains private by default; a public URL is returned only for an object the caller explicitly marks public.
constraints_compatibility:
  - Keep the scorecard scan key format and response contract unchanged.
  - Reuse the installed aws4fetch package; do not add a new dependency.
  - Preserve the demo presign path used by the local scan demo.
database_migration: none
escalation:
  - Stop before creating or changing a real bucket, token, CORS rule or custom domain; those are owner actions.
  - Stop before adding a player avatar write path that needs a new auth or RLS rule.
  - Stop if the existing scan contract cannot be preserved by the refactor.
deployment_impact: code
deployment_verification: "Focused unit checks plus pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json and package.json are unchanged and that no new secret is committed. No deployment is created."
---

# Context

Issue #187. The app already has a narrow R2 client for scorecard scan photos: `src/lib/scoring/scan/r2.ts` uses `aws4fetch` to presign a PUT, with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and an optional `R2_ENDPOINT`. The issue asks for a reusable path for avatars, logos, course maps and generated PDFs, with validation, public or signed URLs, deletion and an `.env.example` update.

This task generalises the existing client instead of adding a second storage system. The scan route keeps its key format and response shape. The new service adds what the wider use cases need: a MIME and size check, a public URL helper, a delete call, and a staff-guarded presign route.

The task stops at the owner boundary. No bucket, token, CORS rule or custom domain is created, and no player avatar write is wired, because both need the owner and, for the avatar, a new auth or RLS rule. The runbook records exactly what the owner must set up and how to verify it without deploying.
