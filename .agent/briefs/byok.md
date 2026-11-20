# Brief: BYOK (AI provider keys managed in the TeeLine Workspace, used by Teeo)

Branch `teeo/byok`, from `feat/teeo-byok`. Common rules attached. A design builder is changing
`src/components/chat/**` and `src/lib/chat/copy.ts`; do not touch them.

## What the owner wants

"For the API key, it should be like a BYOK, something like PakaonAI has built on their super admin;
on TeeLine that corresponds to the ops app." The reference is OptiFeed (public repo
J-Akiru5/OptiFeed, same owner). Read with `gh api repos/J-Akiru5/OptiFeed/contents/<path> --jq
.content` piped to base64 decoding:
`apps/web/lib/ai-providers/{secrets,config,types,registry,reasoning}.ts`,
`apps/web/lib/actions/ai-providers.ts`, `apps/web/components/superadmin/ai-provider-settings.tsx`,
`apps/web/app/[locale]/(superadmin)/superadmin/ai-providers/page.tsx`, and the two Prisma migrations
`apps/web/prisma/migrations/20261022000000_add_ai_provider_config/migration.sql` and
`20261031150000_add_ai_provider_secrets/migration.sql`. Port the design, not the Prisma code.

## The design (decided by the orchestrator)

- **Storage**: Supabase (the same project both apps use). New migration
  `supabase/migrations/20261123000000_ai_provider_settings.sql`:
  - `public.ai_provider_settings` (`provider text primary key check in ('gemini','openai_compat',
    'opencode_go')`, `model text`, `priority int`, `enabled boolean`, `reasoning_effort text check in
    ('none','low','medium','high')`, `base_url text` (only for openai_compat), `api_key_env text`,
    `key_ciphertext text`, `key_iv text`, `key_tag text`, `key_version int`, `key_hint text` (last
    four characters only), `updated_at`, `updated_by uuid`). Seed the three rows: gemini priority 10
    model `gemini-2.5-flash` env `GEMINI_API_KEY`; openai_compat priority 20 env `OPENAI_COMPAT_API_KEY`;
    opencode_go priority 30 env `OPENCODE_GO_API_KEY`; all enabled, reasoning `low`.
  - `public.ai_provider_audit` (`id`, `provider`, `action` in save/set_key/clear_key, `reason text`
    (at least 10 characters), `changes jsonb` (never a key or ciphertext), `actor uuid`, `at`).
  - RLS on both tables with **no** policies for `anon`/`authenticated`: reads and writes go only through
    the security definer functions below (and the golf server's service role).
  - Functions, all `security definer`, `set search_path = ''`, each requiring
    `public.ws_has_role(array['owner'])` (`42501` otherwise) and a reason of at least 10 characters,
    each writing one audit row, granted to `authenticated` only:
    `ws_list_ai_providers()` returns every row **without** ciphertext/iv/tag, plus `has_stored_key`
    and `key_hint`, plus the last 20 audit rows; `ws_save_ai_provider(p_provider, p_model, p_priority,
    p_enabled, p_reasoning_effort, p_base_url, p_api_key_env, p_reason)`; `ws_set_ai_provider_key(
    p_provider, p_ciphertext, p_iv, p_tag, p_key_version, p_hint, p_reason)`;
    `ws_clear_ai_provider_key(p_provider, p_reason)`.
  - Self-check `do` block. Then `docs/ai-providers/apply-on-live.sql` (header, `begin;`, migration,
    `commit;`, check queries).
- **Encryption**: AES-256-GCM, a random 12-byte IV per write, the tag stored beside it, the master key
  `AI_SECRET_KEY` (base64 of 32 random bytes) with `AI_SECRET_KEY_VERSION` and
  `AI_SECRET_KEY_PREVIOUS` for rotation, exactly as OptiFeed's `secrets.ts`. The same module in two
  places, byte-for-byte identical: `src/lib/ai/secrets.ts` (golf app, decrypts) and
  `apps/ops/src/lib/ai/secrets.ts` (ops app, encrypts). Each gets a test that decrypts one fixed test
  vector produced with a fixed test key (in the test only, clearly a test value), so the two can never
  drift. Server-only modules (`import "server-only"` if the app uses it, otherwise keep them out of
  client components).
- **Ops app** (`apps/ops`): a third Settings tab **"AI providers"** at
  `apps/ops/src/app/(app)/settings/ai-providers/` (page + server actions), owner-only (others see a
  plain "Only a workspace owner can manage AI providers"). Add the tab to
  `components/settings/settings-tabs.tsx`. Like PakaonAI's screen, using the ops app's own UI kit
  (`components/ui`): an intro card ("Teeo tries providers in priority order and falls back on any
  failure. Keys are encrypted with AES-256-GCM; only the last four characters are ever shown.
  Without a stored key, the environment variable named on each card is used, and a provider with
  neither is skipped."), then **one card per provider**: Model, Priority (lower runs first), API key
  env var (name only), Reasoning effort (select), Base URL (OpenAI-compatible only), "Enabled in the
  fallback chain" checkbox, Reason (required, at least 10 characters, "Recorded in the audit log"),
  **Save**. Inside each card an **API key** box: a status badge (`Stored key ••••abcd` /
  `Key from environment` / `No key`), a password input "Paste the provider key", **Save key** which
  first makes one tiny live call to that provider with the pasted key (server action, short timeout;
  on failure nothing is stored and the provider's error is summarised), then encrypts and stores it;
  **Remove stored key**. Below the cards, the recent audit list. When `AI_SECRET_KEY` is missing,
  show "Key storage is off until AI_SECRET_KEY is set on this project" and disable Save key (the rest
  still works). Never return or log a key; clear the input after saving.
- **Golf app**: `src/lib/ai/config.ts` (and what calls it) loads the chain from
  `ai_provider_settings` with a **server-only service-role client** (`SUPABASE_SERVICE_ROLE_KEY` or
  `SUPABASE_SECRET_ROLE_KEY`, as `src/lib/scorecards/store.ts` already does), enabled rows in priority
  order; for each, a stored key is decrypted with `AI_SECRET_KEY`, else the env var named in the row,
  else the provider is skipped. Cache the chain for 60 seconds. If the table is missing, unreachable or
  the service key is absent, fall back to today's env-only behaviour exactly. Tests with mocks.
- `.env.example` in both apps: `AI_SECRET_KEY`, `AI_SECRET_KEY_VERSION`, `AI_SECRET_KEY_PREVIOUS`
  (names and a one-line comment; no values).

## Acceptance

Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and in `apps/ops`: `pnpm --filter @teeline/ops
typecheck`, `pnpm --filter @teeline/ops lint`, `pnpm --filter @teeline/ops test` all pass. Never
call a real provider in tests, never connect to a database. Final report as in the common rules,
including the exact env vars each Vercel project needs.
