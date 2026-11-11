-- A short organizer advisory on the public pages (24th Bamboo Tee) -------------------------------
--
-- ADDITIVE. One nullable column on public.tournaments, one read-only SECURITY DEFINER function and
-- its grants. No existing table, column, policy, grant or function is changed, and no event row is
-- touched by this migration.
--
-- The stored shape is:
--
--   {"show": boolean, "title": text, "lines": [text], "signature": text, "until": "YYYY-MM-DD"}
--
-- The column is nullable and has no default, so every existing event keeps answering null and the
-- public pages render exactly as they do today. A database that has not applied this migration is
-- also safe: the client treats a missing `public_advisory` function as "no advisory" (PGRST202),
-- exactly as it already does for `public_release_state`.
--
-- The function is the only public door. It returns the five allow-listed keys, never the stored
-- object as-is, so a key added to the column later is not exposed by accident. It answers only while
-- the event is published and the `advisory` release key allows it. `publish_allows` treats an absent
-- key as true, which is the existing default-and-open behaviour; making the surface depend on that
-- function now means a later migration or a later desk action cannot silently reopen a held advisory.
--
-- Nothing here is applied to the live project by this branch.

-- 1. The column -----------------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists public_advisory jsonb default null;

comment on column public.tournaments.public_advisory is
  'Optional organizer advisory for the public pages. Nullable. Read only through public_advisory(); the raw object is never exposed.';

-- 2. The public read ------------------------------------------------------------------------------

create or replace function public.public_advisory(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select
      t.id,
      t.published,
      case
        when jsonb_typeof(t.public_advisory) = 'object' then t.public_advisory
        else null
      end as advisory
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  )
  select case
    when s.published
      and s.advisory is not null
      and public.publish_allows(s.id, 'advisory')
    then jsonb_build_object(
      -- Only a real JSON boolean counts. A malformed value reads as "do not show".
      'show', case
        when jsonb_typeof(s.advisory -> 'show') = 'boolean'
          then (s.advisory ->> 'show')::boolean
        else false
      end,
      'title', nullif(btrim(coalesce(s.advisory ->> 'title', '')), ''),
      -- Strings only, empty entries dropped, original order kept.
      'lines', coalesce(
        (
          select jsonb_agg(entry.value #>> '{}' order by entry.seq)
          from jsonb_array_elements(
            case
              when jsonb_typeof(s.advisory -> 'lines') = 'array'
                then s.advisory -> 'lines'
              else '[]'::jsonb
            end
          ) with ordinality as entry(value, seq)
          where jsonb_typeof(entry.value) = 'string'
            and btrim(entry.value #>> '{}') <> ''
        ),
        '[]'::jsonb
      ),
      'signature', nullif(btrim(coalesce(s.advisory ->> 'signature', '')), ''),
      -- An unreadable date is returned as null, and the client then hides the advisory.
      'until', case
        when coalesce(s.advisory ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}$'
          then s.advisory ->> 'until'
        else null
      end
    )
    else null
  end
  from selected s;
$$;

revoke all on function public.public_advisory(uuid) from public;
grant execute on function public.public_advisory(uuid) to anon, authenticated;

-- 3. Self-check -----------------------------------------------------------------------------------
-- Catalog checks only. No tournament, registration or player row is read or written here.

do $$
declare
  v_body text;
  v_nullable text;
begin
  if to_regclass('public.tournaments') is null then
    raise exception 'public.tournaments is missing';
  end if;

  select c.is_nullable into v_nullable
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'tournaments'
     and c.column_name = 'public_advisory';
  if v_nullable is null then
    raise exception 'public.tournaments.public_advisory was not created';
  end if;
  if v_nullable <> 'YES' then
    raise exception 'public.tournaments.public_advisory must be nullable';
  end if;

  if to_regprocedure('public.public_advisory(uuid)') is null then
    raise exception 'public.public_advisory was not created';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_advisory';
  if v_body not like '%publish_allows(s.id, ''advisory'')%'
     or v_body not like '%t.published%' then
    raise exception 'public_advisory does not gate the advisory key and the published state';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'public_advisory'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef
  ) then
    raise exception 'public_advisory is not a security definer function';
  end if;

  if not has_function_privilege('anon', 'public.public_advisory(uuid)', 'EXECUTE') then
    raise exception 'anon cannot execute public.public_advisory';
  end if;
end $$;
