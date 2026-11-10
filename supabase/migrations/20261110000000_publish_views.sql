-- Which public surfaces are live for an event, and a gate that holds them.
--
-- `tournaments.publish_views` is one JSON object with a key per surface. Every key defaults to true,
-- so publishing behaves exactly as it did before this migration until the desk turns a surface off.
--
-- The pairings list is the one surface that has to be held at the database, not in the browser: the
-- public pairings are read with the anon key, which anyone can call directly. Gating them in the
-- page would hide nothing. So `public_pairings` and `public_pairings_by_day` are renamed to `_all`,
-- their execute grants to anon and authenticated are revoked, and same-signature wrappers filter the
-- rows through `publish_allows`.
--
-- What this does NOT hide: a player's own pair and start. Those come from the player portal's own
-- read, not from these functions, so a player still sees their tee time while the field list is
-- withheld.

alter table public.tournaments
  add column if not exists publish_views jsonb not null
  default '{"pairings":true,"ownPair":true,"roster":true,"leaderboard":true,"photos":true}'::jsonb;

comment on column public.tournaments.publish_views is
  'Which public surfaces are live for this event. Every key defaults to true, so publishing behaves exactly as before until the desk turns a surface off.';

create or replace function public.publish_allows(p_tournament uuid, p_surface text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (t.publish_views ->> p_surface)::boolean
       from public.tournaments t
      where t.id = p_tournament),
    true
  );
$$;

revoke all on function public.publish_allows(uuid, text) from public;
grant execute on function public.publish_allows(uuid, text) to anon, authenticated;

-- The originals keep their bodies and are renamed rather than dropped, so nothing about their
-- behaviour is lost. Their grants go, so the bare name cannot be used to read around the gate.
alter function public.public_pairings(uuid) rename to public_pairings_all;
alter function public.public_pairings_by_day(uuid) rename to public_pairings_by_day_all;

revoke all on function public.public_pairings_all(uuid) from public, anon, authenticated;
revoke all on function public.public_pairings_by_day_all(uuid) from public, anon, authenticated;

create function public.public_pairings(p_tournament uuid default null)
returns TABLE(
  tournament_id uuid, tournament_name text, play_date date, start_format text,
  first_tee_time time without time zone, published_at timestamp with time zone, version integer,
  group_number smallint, wave text, start_hole smallint, tee_time time without time zone,
  flight_name text, player_id uuid, player_name text, photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.public_pairings_all(p_tournament) f
   where public.publish_allows(f.tournament_id, 'pairings');
$$;

create function public.public_pairings_by_day(p_tournament uuid default null)
returns TABLE(
  tournament_id uuid, tournament_name text, play_date date, start_format text,
  first_tee_time time without time zone, published_at timestamp with time zone, version integer,
  group_number smallint, wave text, start_hole smallint, tee_time time without time zone,
  flight_name text, player_id uuid, player_name text, photo_path text,
  day_number smallint, day_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.public_pairings_by_day_all(p_tournament) f
   where public.publish_allows(f.tournament_id, 'pairings');
$$;

revoke all on function public.public_pairings(uuid) from public;
revoke all on function public.public_pairings_by_day(uuid) from public;
grant execute on function public.public_pairings(uuid) to anon, authenticated;
grant execute on function public.public_pairings_by_day(uuid) to anon, authenticated;

-- The 24th Bamboo Tee holds the field list and keeps everything else public.
update public.tournaments
   set publish_views = jsonb_set(publish_views, '{pairings}', 'false'::jsonb)
 where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb';
