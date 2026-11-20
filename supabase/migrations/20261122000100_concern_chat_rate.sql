-- Concern chat rate limit (public chat, 20 Nov 2026).
--
-- ADDITIVE. One new private table, two indexes, one SECURITY DEFINER function and its grants. No
-- existing table, policy, grant or public function is changed.
--
-- Why a table of its own: the chat is a different door from the feedback form. The form's bucket
-- lives in `public_feedback` and counts notes that were actually filed; a chat turn is not a note, and
-- putting turns there would put a player's half-finished sentences in the organizer's inbox.
--
-- Privacy, recorded here because it is easy to lose later:
--   * The key is a pseudonymous digest made by the route (a SHA-256 value over the client address or
--     the conversation id, truncated). This table never sees a raw address or a user agent, and the
--     key cannot be read back as an address.
--   * Rows are pruned after a day, well past the longest window this function is called with.
--   * Nothing in this table is exposed to a visitor. Only the function below may touch it.
--
-- The function both counts and records, in one call under an advisory lock, so two simultaneous
-- requests from one connection cannot both slip in as the last allowed one.

create table if not exists public.chat_rate_events (
  id bigint generated always as identity primary key,
  rate_key text not null
    check (char_length(rate_key) between 1 and 64),
  created_at timestamptz not null default now()
);

comment on table public.chat_rate_events is
  'Pseudonymous buckets for the public concern chat. Never a raw address; pruned after a day.';
comment on column public.chat_rate_events.rate_key is
  'A truncated SHA-256 digest of a client address or conversation id. Not reversible to either.';

create index if not exists chat_rate_events_key_created_idx
  on public.chat_rate_events (rate_key, created_at desc);

create index if not exists chat_rate_events_created_idx
  on public.chat_rate_events (created_at);

alter table public.chat_rate_events enable row level security;

-- Closed at the privilege layer as well as by the absence of a policy. The RPC below is the only door.
revoke all on table public.chat_rate_events from public, anon, authenticated;

create or replace function public.chat_rate_check(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_recent integer;
begin
  v_key := btrim(coalesce(p_key, ''));

  -- A refused call returns false and records nothing. The bounds keep a caller from asking for an
  -- unbounded window or an oversized bucket, which would make the prune meaningless.
  if v_key = '' or char_length(v_key) > 64 then
    return false;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  -- Serialize the check-and-record for one bucket.
  perform pg_advisory_xact_lock(hashtextextended('chat-rate|' || v_key, 0));

  -- Prune everything past the longest window this function accepts. The index on created_at keeps
  -- this cheap and the table small.
  delete from public.chat_rate_events e where e.created_at < now() - interval '1 day';

  select count(*) into v_recent
    from public.chat_rate_events e
   where e.rate_key = v_key
     and e.created_at > now() - make_interval(secs => p_window_seconds);

  if v_recent >= p_limit then
    return false;
  end if;

  insert into public.chat_rate_events (rate_key) values (v_key);
  return true;
end;
$$;

revoke all on function public.chat_rate_check(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.chat_rate_check(text, integer, integer)
  to anon, authenticated;

-- Self-check ---------------------------------------------------------------------------------------

do $$
declare
  v_key text := 'self-check:' || replace(gen_random_uuid()::text, '-', '');
  v_first boolean;
  v_second boolean;
  v_third boolean;
begin
  if to_regclass('public.chat_rate_events') is null then
    raise exception 'public.chat_rate_events was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.chat_rate_events'::regclass) then
    raise exception 'public.chat_rate_events does not have row-level security enabled';
  end if;

  if has_table_privilege('anon', 'public.chat_rate_events', 'SELECT')
     or has_table_privilege('anon', 'public.chat_rate_events', 'INSERT')
     or has_table_privilege('anon', 'public.chat_rate_events', 'UPDATE')
     or has_table_privilege('anon', 'public.chat_rate_events', 'DELETE') then
    raise exception 'anon still has a table privilege on public.chat_rate_events';
  end if;

  if not has_function_privilege(
    'anon',
    'public.chat_rate_check(text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute public.chat_rate_check';
  end if;

  -- A limit of two allows two calls and refuses the third. Every call records one row.
  v_first := public.chat_rate_check(v_key, 2, 600);
  v_second := public.chat_rate_check(v_key, 2, 600);
  v_third := public.chat_rate_check(v_key, 2, 600);

  if v_first is not true or v_second is not true then
    raise exception 'chat_rate_check refused a call within its limit';
  end if;
  if v_third is not false then
    raise exception 'chat_rate_check allowed a call past its limit';
  end if;

  if public.chat_rate_check('', 5, 600) is not false then
    raise exception 'chat_rate_check accepted an empty key';
  end if;
  if public.chat_rate_check(repeat('x', 65), 5, 600) is not false then
    raise exception 'chat_rate_check accepted an oversized key';
  end if;
  if public.chat_rate_check(v_key, 0, 600) is not false then
    raise exception 'chat_rate_check accepted a limit of zero';
  end if;
  if public.chat_rate_check(v_key, 5, 0) is not false then
    raise exception 'chat_rate_check accepted a zero window';
  end if;

  delete from public.chat_rate_events where rate_key = v_key;
end $$;
