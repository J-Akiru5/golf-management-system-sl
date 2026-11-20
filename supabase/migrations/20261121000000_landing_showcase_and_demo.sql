-- The landing page's event list, the home page feature, and demo requests in the feedback inbox
--
-- Three small additions, in one file because the landing page needs all three:
--
--   * `public.tournaments.landing_featured` is the one event an organizer chose to show at the top
--     of the public home page. A partial unique index keeps it to one event per club, and
--     `set_landing_feature()` is the only supported way to change it: it checks the caller's role
--     and clears the previous feature in the same statement, so the index can never be tripped by a
--     normal switch. The page itself never picks a featured event.
--
--   * `public_showcase_events()` returns the same payload as `public_events()` plus `finished` and
--     `featured` flags, and keeps a finished event listed for about a year. The landing page's
--     carousel can then mark the club's most recent event Completed instead of losing it a week
--     after it ended, and the hero can show the organizer's featured event.
--     `public_events()` and `public_open_events()` are unchanged; the app still falls back to them
--     while this migration has not reached a project.
--
--   * The public feedback inbox learns one category: `demo`, for a request made on /demo. It reuses
--     the existing table, permission model and `submit_feedback` write path. A demo request must
--     carry a contact email, because the point of the note is a reply.
--
-- The public read functions are security definer, like the other public reads and writes, because
-- every club table is behind `is_club_member` and a visitor is not a member. The setter is security
-- definer too, and refuses anyone who is not the club's owner or organizer. The grants below are
-- explicit: new functions are private by default.

-- 1. The home page feature ----------------------------------------------------------------------
-- Which event sits at the top of the public home page is the organizer's decision, not a rule the
-- page applies. The column is private until `set_landing_feature()` says otherwise, and the partial
-- unique index is what makes "one event at a time" a database fact rather than a promise. The column
-- comes first in this file because `public_showcase_events()` below reads it.

alter table public.tournaments
  add column if not exists landing_featured boolean not null default false;

comment on column public.tournaments.landing_featured is
  'True for the one event an organizer chose to feature at the top of the public home page. At most one per club, enforced by tournaments_one_landing_feature.';

create unique index if not exists tournaments_one_landing_feature
  on public.tournaments (club_id)
  where landing_featured;

create or replace function public.set_landing_feature(
  p_tournament uuid,
  p_featured boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  if p_featured is null then
    raise exception 'A feature value is required' using errcode = '22023';
  end if;

  -- Lock the row so two switches pressed at once cannot interleave the clear and the set.
  select t.club_id into v_club
    from public.tournaments t
   where t.id = p_tournament
   for update;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can change the home page feature'
      using errcode = '42501';
  end if;

  -- Turning the feature on replaces any other event of the club, before the new one is set, so the
  -- unique index is never violated for a moment.
  if p_featured then
    update public.tournaments
       set landing_featured = false
     where club_id = v_club
       and id <> p_tournament
       and landing_featured;
  end if;

  update public.tournaments
     set landing_featured = p_featured
   where id = p_tournament;

  return jsonb_build_object('tournamentId', p_tournament, 'featured', p_featured);
end;
$$;

revoke all on function public.set_landing_feature(uuid, boolean) from public;
grant execute on function public.set_landing_feature(uuid, boolean) to authenticated;

-- 2. The landing page's event list --------------------------------------------------------------

create or replace function public.public_showcase_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with listed as (
    select
      (coalesce(t.dates, array[t.play_date]))[1] as first_date,
      t.name,
      jsonb_build_object(
        'tournamentId', t.id,
        'name', t.name,
        'dates', to_jsonb(coalesce(t.dates, array[t.play_date])),
        'startFormat', t.start_format,
        'firstTeeTime', to_char(t.first_tee_time, 'HH24:MI'),
        'cutOffDate', t.cutoff_date,
        'entriesOpen', (t.state = 'open' and t.cutoff_date >= current_date),
        'featured', t.landing_featured,
        'entered', (
          select count(*)
          from public.registrations r
          where r.tournament_id = t.id and r.status = 'ok'
        )
      ) as entry,
      coalesce(
        (select max(d) from unnest(coalesce(t.dates, array[t.play_date])) as d),
        t.play_date
      ) as last_date
    from public.tournaments t
    where t.state in ('open', 'closed')
  )
  select coalesce(
    jsonb_agg(entry || jsonb_build_object('finished', last_date < current_date)
      order by first_date, name),
    '[]'::jsonb
  )
  from listed
  where last_date >= current_date - 400;
$$;

comment on function public.public_showcase_events() is
  'Events the landing page may show, including ones finished in the last year, each with a finished flag and the organizer''s featured flag. Same fields as public_events(): no contact details, no player data.';

revoke all on function public.public_showcase_events() from public;
grant execute on function public.public_showcase_events() to anon, authenticated;

-- 3. Demo requests in the feedback inbox --------------------------------------------------------

-- The table check and the function check both name the allowed categories. They are kept in step
-- here, in one file, so a note cannot pass one and fail the other.
alter table public.public_feedback
  drop constraint if exists public_feedback_category_check;
alter table public.public_feedback
  add constraint public_feedback_category_check
  check (category in ('improvement', 'bug', 'content', 'demo'));

-- The latest definition, from 20261110000300_feedback_followups.sql, with only the category list
-- extended and the demo email rule added. Every other check, message and behaviour is unchanged.
create or replace function public.submit_feedback(
  p_category text,
  p_message text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_consent boolean default false,
  p_page_path text default null,
  p_locale text default 'en',
  p_honeypot text default null,
  p_tournament uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clubs integer;
  v_club uuid;
  v_tournament uuid;
  v_category text;
  v_message text;
  v_contact_name text;
  v_contact_email text;
  v_consent boolean;
  v_page_path text;
  v_locale text;
  v_headers jsonb := '{}'::jsonb;
  v_address text;
  v_rate_key text;
  v_recent integer;
begin
  -- The honeypot is checked first. A filled field is treated exactly like a real note from the
  -- browser's point of view: the same accepted reply, and no row. See the MVP migration for why.
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'accepted',
      'message', 'Thank you. The organizer will read your note.'
    );
  end if;

  v_category := lower(btrim(coalesce(p_category, '')));
  if v_category not in ('improvement', 'bug', 'content', 'demo') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_category',
      'message', 'Choose what the note is about.'
    );
  end if;

  v_message := btrim(coalesce(p_message, ''));
  if v_message = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'message_required',
      'message', 'Write your message.'
    );
  end if;
  if char_length(v_message) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'message_too_short',
      'message', 'Write a little more so the organizer can understand it.'
    );
  end if;
  if char_length(v_message) > 2000 then
    return jsonb_build_object(
      'ok', false,
      'code', 'message_too_long',
      'message', 'Keep the message to 2000 characters or fewer.'
    );
  end if;

  v_contact_name := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_contact_email := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_consent := coalesce(p_contact_consent, false);

  if v_contact_name is not null and char_length(v_contact_name) > 120 then
    return jsonb_build_object(
      'ok', false,
      'code', 'contact_name_too_long',
      'message', 'Keep the name to 120 characters or fewer.'
    );
  end if;

  if v_contact_email is not null and (
    char_length(v_contact_email) > 254
    or v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'contact_email_invalid',
      'message', 'That email address looks incomplete. Check it and try again.'
    );
  end if;

  -- A demo request exists to be answered, so the email is required. The form asks for one; this is
  -- the server's own check, in the same small result shape as every other refusal.
  if v_category = 'demo' and v_contact_email is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'contact_email_required',
      'message', 'Enter an email address so the club can reply about a demo.'
    );
  end if;

  if v_contact_name is not null or v_contact_email is not null then
    if not v_consent then
      return jsonb_build_object(
        'ok', false,
        'code', 'consent_required',
        'message', 'Tick the box if the club may contact you, or remove your contact details.'
      );
    end if;
  else
    -- Consent without contact details is not meaningful, so it is not stored as consent.
    v_consent := false;
  end if;

  v_page_path := nullif(btrim(coalesce(p_page_path, '')), '');
  if v_page_path is not null then
    -- Store the path, not a query string or a fragment: those can accidentally carry personal data.
    v_page_path := split_part(split_part(v_page_path, '?', 1), '#', 1);
    if left(v_page_path, 1) <> '/'
       or char_length(v_page_path) > 300
       or v_page_path ~ '[[:cntrl:]]' then
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_page',
        'message', 'The page address is not valid. Reload the page and try again.'
      );
    end if;
  end if;

  v_locale := lower(btrim(coalesce(p_locale, 'en')));
  if v_locale = '' then
    v_locale := 'en';
  end if;
  if v_locale not in ('en', 'tl', 'hil') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_locale',
      'message', 'Choose a language.'
    );
  end if;

  -- One club is the current release. Refuse rather than guess when the project has none or several.
  select count(*) into v_clubs from public.clubs;
  if v_clubs = 1 then
    select id into v_club from public.clubs limit 1;
  end if;

  if v_club is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_configured',
      'message', 'Feedback is not switched on yet. Please try again later.'
    );
  end if;

  -- The event check happens after the club is resolved and before the rate limit. A supplied id
  -- must belong to this club and be visible on the public site. A blank id resolves the current
  -- public event with the same ordering public_programme() uses; no public event means no link.
  if p_tournament is not null then
    select t.id into v_tournament
      from public.tournaments t
     where t.id = p_tournament
       and t.club_id = v_club
       and t.published
       and t.state in ('open', 'closed');

    if v_tournament is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_event',
        'message', 'That event is not available for feedback. Send a general note instead.'
      );
    end if;
  else
    select t.id into v_tournament
      from public.tournaments t
     where t.club_id = v_club
       and t.published
       and t.state in ('open', 'closed')
     order by
       case when t.play_date >= current_date then 0 else 1 end,
       case when t.play_date >= current_date then t.play_date end asc nulls last,
       case when t.play_date < current_date then t.play_date end desc nulls last,
       t.created_at desc
     limit 1;
  end if;

  -- The pseudonymous key. The proxy header is the best signal; the connection address is the
  -- fallback; `no-address` is the smallest safe last resort and shares one bucket.
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_address := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  if v_address is null then
    v_address := nullif(btrim(coalesce(v_headers ->> 'x-real-ip', '')), '');
  end if;
  if v_address is null then
    v_address := nullif(host(inet_client_addr()), '');
  end if;

  v_rate_key := hashtextextended(
    'feedback|' || v_club::text || '|' || coalesce(v_address, 'no-address'),
    0
  )::text;

  -- Serialize the check-and-insert for one bucket, so two simultaneous requests cannot both see
  -- four rows and both slip in as the fifth and sixth.
  perform pg_advisory_xact_lock(hashtextextended('feedback-rate|' || v_rate_key, 0));

  select count(*) into v_recent
    from public.public_feedback f
   where f.club_id = v_club
     and f.rate_key = v_rate_key
     and f.created_at > now() - interval '10 minutes';

  if v_recent >= 5 then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'message', 'Too many notes were sent just now. Wait a few minutes and try again.'
    );
  end if;

  insert into public.public_feedback (
    club_id, tournament_id, category, message, contact_name, contact_email, contact_consent,
    page_path, locale, rate_key
  )
  values (
    v_club, v_tournament, v_category, v_message, v_contact_name, v_contact_email, v_consent,
    v_page_path, v_locale, v_rate_key
  );

  -- Only the small result leaves the function. No id, no row, no count.
  return jsonb_build_object(
    'ok', true,
    'code', 'accepted',
    'message', 'Thank you. The organizer will read your note.'
  );
end;
$$;

revoke all on function public.submit_feedback(
  text, text, text, text, boolean, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.submit_feedback(
  text, text, text, text, boolean, text, text, text, uuid
) to anon, authenticated;

-- 4. Self-check ---------------------------------------------------------------------------------
-- Prove the new filter, the finished and featured flags, the field list, the feature setting and the
-- demo rule, in this transaction. The probes are deleted explicitly rather than relying on a
-- rollback: the SQL editor runs a script statement by statement, so an inserted row can outlive the
-- block that raised.

do $$
declare
  v_club uuid;
  v_course uuid;
  v_rows jsonb;
  v_names text[];
  v_finished boolean;
  v_open_flag boolean;
  v_keys text[];
  v_clubs integer;
  v_result jsonb;
begin
  select club_id, course_id into v_club, v_course from public.tournaments limit 1;
  if v_club is null then
    raise notice 'No event exists to derive a club and course from; skipping the event self-check.';
  else
    insert into public.tournaments
      (club_id, course_id, name, play_date, cutoff_date, start_format, first_tee_time, state, dates)
    values
      (v_club, v_course, 'zz-showcase-open', current_date + 20, current_date + 10, 'shotgun',
       '23:45', 'open', array[current_date + 20]),
      (v_club, v_course, 'zz-showcase-closed', current_date + 21, current_date - 1, 'shotgun',
       '23:45', 'closed', array[current_date + 21]),
      (v_club, v_course, 'zz-showcase-draft', current_date + 22, current_date + 10, 'shotgun',
       '23:45', 'draft', array[current_date + 22]),
      (v_club, v_course, 'zz-showcase-finished', current_date - 40, current_date - 50, 'shotgun',
       '23:45', 'closed', array[current_date - 40]),
      (v_club, v_course, 'zz-showcase-old', current_date - 401, current_date - 410, 'shotgun',
       '23:45', 'closed', array[current_date - 401]);

    v_rows := public.public_showcase_events();

    select array_agg(e ->> 'name') into v_names from jsonb_array_elements(v_rows) e;
    if not ('zz-showcase-open' = any (v_names)) then
      raise exception 'An open event was not listed: %', v_names;
    end if;
    if not ('zz-showcase-closed' = any (v_names)) then
      raise exception 'An event whose entries have closed was not listed: %', v_names;
    end if;
    if not ('zz-showcase-finished' = any (v_names)) then
      raise exception 'An event finished within the year was not listed: %', v_names;
    end if;
    if 'zz-showcase-draft' = any (v_names) then
      raise exception 'A draft event was listed publicly: %', v_names;
    end if;
    if 'zz-showcase-old' = any (v_names) then
      raise exception 'An event finished more than a year ago was listed: %', v_names;
    end if;

    select (e ->> 'finished')::boolean into v_finished
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-showcase-finished';
    if v_finished is not true then
      raise exception 'A finished event did not report finished: %', v_finished;
    end if;

    select (e ->> 'finished')::boolean into v_finished
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-showcase-open';
    if v_finished is not false then
      raise exception 'An upcoming event reported finished: %', v_finished;
    end if;

    select (e ->> 'entriesOpen')::boolean into v_open_flag
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-showcase-open';
    if v_open_flag is not true then
      raise exception 'An open event did not report entriesOpen: %', v_open_flag;
    end if;

    select array_agg(k) into v_keys
    from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k
    where k not in ('tournamentId', 'name', 'dates', 'startFormat', 'firstTeeTime', 'cutOffDate',
                    'entriesOpen', 'entered', 'finished', 'featured');
    if v_keys is not null then
      raise exception 'The showcase payload carries unexpected fields: %', v_keys;
    end if;

    delete from public.tournaments where name like 'zz-showcase-%';
  end if;

  -- The home page feature is a column, one-per-club index and authenticated setter. Catalog checks
  -- only: no event row is read or written here.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'tournaments'
       and column_name = 'landing_featured'
  ) then
    raise exception 'public.tournaments has no landing_featured column';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'tournaments'
       and indexname = 'tournaments_one_landing_feature'
  ) then
    raise exception 'The one-feature-per-club index is missing';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'set_landing_feature'
  ) then
    raise exception 'public.set_landing_feature is missing';
  end if;

  if has_function_privilege('anon', 'public.set_landing_feature(uuid, boolean)', 'EXECUTE') then
    raise exception 'anon can execute public.set_landing_feature';
  end if;

  -- The category check accepts demo, and the function requires an email for it.
  if not exists (
    select 1 from pg_constraint
     where conname = 'public_feedback_category_check'
       and pg_get_constraintdef(oid) like '%demo%'
  ) then
    raise exception 'public_feedback does not accept the demo category';
  end if;

  if not has_function_privilege(
    'anon',
    'public.public_showcase_events()',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute public.public_showcase_events';
  end if;

  -- The refusal paths write nothing. Only run them when the project has exactly one club, so the
  -- migration also runs on an empty development database.
  select count(*) into v_clubs from public.clubs;
  if v_clubs = 1 then
    v_result := public.submit_feedback(
      'demo', 'A demo request', 'Visitor', null, true, '/demo', 'en', ''
    );
    if v_result ->> 'code' <> 'contact_email_required' then
      raise exception 'submit_feedback accepted a demo request without an email: %', v_result;
    end if;

    v_result := public.submit_feedback(
      'demo', 'A demo request', 'Visitor', 'visitor@example.test', false, '/demo', 'en', ''
    );
    if v_result ->> 'code' <> 'consent_required' then
      raise exception 'submit_feedback accepted a demo request without consent: %', v_result;
    end if;
  end if;
end $$;

-- 5. Owner check, after the migration is applied ------------------------------------------------
--
-- The number of events the landing page can show:
--
--   select jsonb_array_length(public.public_showcase_events());
--
-- The event names with their completed mark:
--
--   select e ->> 'name' as event,
--          (e ->> 'finished')::boolean as finished
--     from jsonb_array_elements(public.public_showcase_events()) e
--    order by (e ->> 'finished')::boolean, e ->> 'name';
--
-- The home page feature:
--
--   select name, landing_featured from public.tournaments order by play_date desc limit 5;
--
-- The organizer turns the feature on in Setup, "TeeLine home page".
