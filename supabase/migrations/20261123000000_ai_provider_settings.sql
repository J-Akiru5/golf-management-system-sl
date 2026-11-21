-- TeeLine BYOK, part 1 of 1: the AI provider chain and its encrypted keys.
-- ADDITIVE: creates two new tables, seeds three rows and adds four functions. Nothing existing is
-- altered or dropped.
--
-- The workspace app (apps/ops) owns the screen and writes through the SECURITY DEFINER functions at
-- the bottom of this file. The golf app reads the same rows with its existing service-role client.
-- The `anon` and `authenticated` roles have no table grant and no policy: the functions are the only
-- door for a signed-in owner, and the service role bypasses RLS for the golf server.
--
-- Key material is never returned by a function and never written to the audit table. A row carries
-- AES-256-GCM ciphertext, its 12-byte IV and its 16-byte tag as base64 text, plus the key generation
-- and the last four characters for the screen. Only the golf app decrypts, using AI_SECRET_KEY.

-- 1. Settings -----------------------------------------------------------------------------------

create table public.ai_provider_settings (
  provider text primary key
    check (provider in ('gemini', 'openai_compat', 'opencode_go')),
  model text not null default '',
  priority integer not null default 100 check (priority between 0 and 1000),
  enabled boolean not null default true,
  reasoning_effort text not null default 'low'
    check (reasoning_effort in ('none', 'low', 'medium', 'high')),
  base_url text
    check (
      base_url is null
      or (
        provider = 'openai_compat'
        and char_length(btrim(base_url)) between 8 and 300
        and btrim(base_url) ~ '^https://'
      )
    ),
  api_key_env text not null default ''
    check (api_key_env = '' or api_key_env ~ '^[A-Z][A-Z0-9_]*$'),
  key_ciphertext text,
  key_iv text,
  key_tag text,
  key_version integer check (key_version is null or key_version > 0),
  key_hint text check (key_hint is null or char_length(key_hint) = 4),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  -- The key columns are all present or all absent, so a half-saved key cannot look usable.
  check (
    (
      key_ciphertext is null
      and key_iv is null
      and key_tag is null
      and key_version is null
      and key_hint is null
    )
    or (
      key_ciphertext is not null
      and key_iv is not null
      and key_tag is not null
      and key_version is not null
      and key_hint is not null
    )
  )
);

comment on table public.ai_provider_settings is
  'The Teeo provider fallback chain, managed by a workspace owner in apps/ops. Keys are encrypted.';
comment on column public.ai_provider_settings.key_ciphertext is
  'AES-256-GCM ciphertext, base64. Never returned by a function and never in the audit table.';
comment on column public.ai_provider_settings.key_hint is
  'The last four characters of the key, for the screen only. Never the whole key.';

create index ai_provider_settings_chain
  on public.ai_provider_settings (enabled, priority);

insert into public.ai_provider_settings
  (provider, model, priority, enabled, reasoning_effort, api_key_env)
values
  ('gemini', 'gemini-2.5-flash', 10, true, 'low', 'GEMINI_API_KEY'),
  ('openai_compat', 'gpt-4o-mini', 20, true, 'low', 'OPENAI_COMPAT_API_KEY'),
  ('opencode_go', 'deepseek-v4.1-flash', 30, true, 'low', 'OPENCODE_GO_API_KEY')
on conflict (provider) do nothing;

-- 2. Audit --------------------------------------------------------------------------------------

create table public.ai_provider_audit (
  id bigint generated always as identity primary key,
  provider text not null
    check (provider in ('gemini', 'openai_compat', 'opencode_go')),
  action text not null check (action in ('save', 'set_key', 'clear_key')),
  reason text not null check (char_length(btrim(reason)) >= 10),
  -- A change summary only: never a key, a ciphertext, an IV or a tag.
  changes jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid() references auth.users (id) on delete set null,
  at timestamptz not null default now()
);

comment on table public.ai_provider_audit is
  'Who changed which provider setting and why. Never stores key material.';

create index ai_provider_audit_recent
  on public.ai_provider_audit (at desc);

-- 3. Row level security -------------------------------------------------------------------------
-- No policy is created on purpose. Reads and writes go only through the functions below, or through
-- the golf server's service role.

alter table public.ai_provider_settings enable row level security;
alter table public.ai_provider_audit enable row level security;

revoke all on table public.ai_provider_settings from public, anon, authenticated;
revoke all on table public.ai_provider_audit from public, anon, authenticated;
revoke all on sequence public.ai_provider_audit_id_seq from public, anon, authenticated;

-- 4. The four doors -----------------------------------------------------------------------------
-- Every function is SECURITY DEFINER with an empty search_path, so it runs with the table owner's
-- rights and cannot be steered through a caller's schema. Each checks that the caller is an active
-- workspace owner (42501 otherwise). The three writers also require a reason of at least ten
-- characters and record one audit row. The list function reads, so it records nothing.

create function public.ws_list_ai_providers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_providers jsonb;
  v_audit jsonb;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can manage AI providers' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider', s.provider,
        'model', s.model,
        'priority', s.priority,
        'enabled', s.enabled,
        'reasoning_effort', s.reasoning_effort,
        'base_url', s.base_url,
        'api_key_env', s.api_key_env,
        'key_version', s.key_version,
        'key_hint', s.key_hint,
        'has_stored_key', s.key_ciphertext is not null,
        'updated_at', s.updated_at,
        'updated_by', s.updated_by
      )
      order by s.priority, s.provider
    ),
    '[]'::jsonb
  )
  into v_providers
  from public.ai_provider_settings s;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'provider', a.provider,
        'action', a.action,
        'reason', a.reason,
        'changes', a.changes,
        'actor', a.actor,
        'at', a.at
      )
      order by a.at desc, a.id desc
    ),
    '[]'::jsonb
  )
  into v_audit
  from (
    select *
    from public.ai_provider_audit
    order by at desc, id desc
    limit 20
  ) a;

  return jsonb_build_object('providers', v_providers, 'audit', v_audit);
end;
$$;

create function public.ws_save_ai_provider(
  p_provider text,
  p_model text,
  p_priority integer,
  p_enabled boolean,
  p_reasoning_effort text,
  p_base_url text,
  p_api_key_env text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_model text := btrim(coalesce(p_model, ''));
  v_effort text := btrim(coalesce(p_reasoning_effort, ''));
  v_base_url text := nullif(btrim(coalesce(p_base_url, '')), '');
  v_env text := btrim(coalesce(p_api_key_env, ''));
  v_before public.ai_provider_settings;
  v_after public.ai_provider_settings;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can manage AI providers' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('gemini', 'openai_compat', 'opencode_go') then
    raise exception 'unknown provider %', p_provider using errcode = '22023';
  end if;
  if p_priority is null or p_priority < 0 or p_priority > 1000 then
    raise exception 'priority must be between 0 and 1000' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'enabled must be true or false' using errcode = '22023';
  end if;
  if char_length(v_model) > 100 then
    raise exception 'the model name is too long' using errcode = '22023';
  end if;
  if v_effort not in ('none', 'low', 'medium', 'high') then
    raise exception 'unknown reasoning effort %', v_effort using errcode = '22023';
  end if;
  if v_env <> '' and v_env !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception 'the key variable must be an upper-case name' using errcode = '22023';
  end if;
  if v_base_url is not null then
    if p_provider <> 'openai_compat' then
      raise exception 'only the OpenAI-compatible provider takes a base URL'
        using errcode = '22023';
    end if;
    if char_length(v_base_url) < 8 or char_length(v_base_url) > 300 then
      raise exception 'the base URL must be between 8 and 300 characters'
        using errcode = '22023';
    end if;
    if v_base_url !~ '^https://' then
      raise exception 'the base URL must use https' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1 from public.ai_provider_settings s where s.provider = p_provider
  ) then
    raise exception 'no provider % is configured; apply the seed first', p_provider
      using errcode = 'P0002';
  end if;

  select * into v_before
  from public.ai_provider_settings s
  where s.provider = p_provider;

  update public.ai_provider_settings
  set
    model = v_model,
    priority = p_priority,
    enabled = p_enabled,
    reasoning_effort = v_effort,
    base_url = v_base_url,
    api_key_env = v_env,
    updated_at = now(),
    updated_by = (select auth.uid())
  where provider = p_provider
  returning * into v_after;

  insert into public.ai_provider_audit (provider, action, reason, changes, actor)
  values (
    p_provider,
    'save',
    v_reason,
    jsonb_build_object(
      'before', jsonb_build_object(
        'model', v_before.model,
        'priority', v_before.priority,
        'enabled', v_before.enabled,
        'reasoning_effort', v_before.reasoning_effort,
        'base_url', v_before.base_url,
        'api_key_env', v_before.api_key_env
      ),
      'after', jsonb_build_object(
        'model', v_after.model,
        'priority', v_after.priority,
        'enabled', v_after.enabled,
        'reasoning_effort', v_after.reasoning_effort,
        'base_url', v_after.base_url,
        'api_key_env', v_after.api_key_env
      )
    ),
    (select auth.uid())
  );
end;
$$;

create function public.ws_set_ai_provider_key(
  p_provider text,
  p_ciphertext text,
  p_iv text,
  p_tag text,
  p_key_version integer,
  p_hint text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ciphertext text := btrim(coalesce(p_ciphertext, ''));
  v_iv text := btrim(coalesce(p_iv, ''));
  v_tag text := btrim(coalesce(p_tag, ''));
  v_hint text := btrim(coalesce(p_hint, ''));
  v_updated integer;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can manage AI providers' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('gemini', 'openai_compat', 'opencode_go') then
    raise exception 'unknown provider %', p_provider using errcode = '22023';
  end if;
  if v_ciphertext = '' or v_iv = '' or v_tag = '' then
    raise exception 'the encrypted key is incomplete' using errcode = '22023';
  end if;
  if char_length(v_ciphertext) > 4096 or char_length(v_iv) > 64 or char_length(v_tag) > 64 then
    raise exception 'the encrypted key is too large' using errcode = '22023';
  end if;
  if p_key_version is null or p_key_version < 1 then
    raise exception 'the key generation must be a positive number' using errcode = '22023';
  end if;
  if char_length(v_hint) <> 4 then
    raise exception 'the key hint must be the last four characters' using errcode = '22023';
  end if;

  update public.ai_provider_settings
  set
    key_ciphertext = v_ciphertext,
    key_iv = v_iv,
    key_tag = v_tag,
    key_version = p_key_version,
    key_hint = v_hint,
    updated_at = now(),
    updated_by = (select auth.uid())
  where provider = p_provider;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'no provider % is configured; apply the seed first', p_provider
      using errcode = 'P0002';
  end if;

  insert into public.ai_provider_audit (provider, action, reason, changes, actor)
  values (
    p_provider,
    'set_key',
    v_reason,
    jsonb_build_object('has_stored_key', true, 'key_version', p_key_version),
    (select auth.uid())
  );
end;
$$;

create function public.ws_clear_ai_provider_key(p_provider text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_updated integer;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can manage AI providers' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('gemini', 'openai_compat', 'opencode_go') then
    raise exception 'unknown provider %', p_provider using errcode = '22023';
  end if;

  update public.ai_provider_settings
  set
    key_ciphertext = null,
    key_iv = null,
    key_tag = null,
    key_version = null,
    key_hint = null,
    updated_at = now(),
    updated_by = (select auth.uid())
  where provider = p_provider;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'no provider % is configured; apply the seed first', p_provider
      using errcode = 'P0002';
  end if;

  insert into public.ai_provider_audit (provider, action, reason, changes, actor)
  values (
    p_provider,
    'clear_key',
    v_reason,
    jsonb_build_object('has_stored_key', false),
    (select auth.uid())
  );
end;
$$;

revoke all on function public.ws_list_ai_providers() from public, anon;
revoke all on function public.ws_save_ai_provider(
  text, text, integer, boolean, text, text, text, text
) from public, anon;
revoke all on function public.ws_set_ai_provider_key(
  text, text, text, text, integer, text, text
) from public, anon;
revoke all on function public.ws_clear_ai_provider_key(text, text) from public, anon;

grant execute on function public.ws_list_ai_providers() to authenticated;
grant execute on function public.ws_save_ai_provider(
  text, text, integer, boolean, text, text, text, text
) to authenticated;
grant execute on function public.ws_set_ai_provider_key(
  text, text, text, text, integer, text, text
) to authenticated;
grant execute on function public.ws_clear_ai_provider_key(text, text) to authenticated;

-- 5. Self-check ---------------------------------------------------------------------------------
-- A wrong seed, a missing function or an accidental policy should stop the migration rather than
-- leave a half-configured chain behind.

do $$
declare
  v_rows integer;
  v_functions integer;
  v_rls integer;
  v_policies integer;
begin
  select count(*) into v_rows from public.ai_provider_settings;
  if v_rows <> 3 then
    raise exception 'expected 3 seeded providers, found %', v_rows;
  end if;

  select count(*) into v_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'ws_list_ai_providers',
      'ws_save_ai_provider',
      'ws_set_ai_provider_key',
      'ws_clear_ai_provider_key'
    );
  if v_functions <> 4 then
    raise exception 'expected 4 AI provider functions, found %', v_functions;
  end if;

  select count(*) into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('ai_provider_settings', 'ai_provider_audit')
    and c.relrowsecurity;
  if v_rls <> 2 then
    raise exception 'expected row level security on both AI provider tables, found %', v_rls;
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('ai_provider_settings', 'ai_provider_audit');
  if v_policies <> 0 then
    raise exception 'the AI provider tables must have no direct policy, found %', v_policies;
  end if;
end;
$$;
