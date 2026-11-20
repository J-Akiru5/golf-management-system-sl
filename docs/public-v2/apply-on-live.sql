-- TeeLine public pages: concerns, the desk alert and the event archive, as a paste-ready script for
-- the Supabase SQL editor.
-- Generated from supabase/migrations/20261122000000_concerns_and_event_archive.sql and
-- 20261122000100_concern_chat_rate.sql (both verbatim, in that order).
-- Do not edit by hand.
--
-- What it does (additive: no table is created or dropped, no existing row is changed):
--   1. public_feedback.details holds the structured part of a player concern: the ticked concerns,
--      the hole number for a score, the tee colour for a tee-off problem, a line for Others, and the
--      player's own name, handicap and schedule. The category check gains "concern"; every existing
--      category stays valid.
--   2. submit_feedback gains p_details as its last argument. A concern note may leave the message
--      empty (the details are the message); every other category still requires one.
--   3. A concern note queues one email per club owner and organizer in the existing email outbox,
--      with the new kind feedback_alert. A queued row is a draft, not a delivery claim: it is sent
--      when a staff account sends that event's outbox from the email desk screen. There is no cron.
--   4. public_event_archive() lists every public event, in state open or closed, with no time limit,
--      newest first, with finished, featured and hasRules. It backs /events and /events/<id>.
--   5. chat_rate_check() is the Teeo chat's per-visitor rate limit (a small private table).
--
-- Run it once on the live project. It is wrapped in one transaction, so a failure changes nothing.
-- The pages work before you run it: /events falls back to public_showcase_events() and then to
-- public_events(), and the tick-box form still reaches the current submit_feedback (the details
-- argument is only sent when it exists) - but a concern note needs this migration to store its
-- details and to queue the alert.
--
-- The self-check at the end of the migration runs inside the transaction. It writes no feedback row
-- and no email; the probe events it inserts for the archive check are deleted before it finishes.

begin;

-- Player concerns, the desk alert and the public event archive
--
-- Three additions, in one file because the tick-box form needs all three:
--
--   * `public.public_feedback.details` holds the structured part of a concern: which boxes the
--     player ticked, the hole number for a score, the tee colour for a tee-off problem, a line for
--     Others, and the player's own name, handicap and schedule. The shape is the one
--     `src/lib/data/concerns.ts` defines, so a note the form accepts is a note this function accepts.
--   * `public.submit_feedback` gains one last argument, `p_details jsonb`. The message stays
--     required for improvement, bug, content and demo; for a concern it is optional, and the
--     readable summary ("Score (hole 7), Tee off (White)") is stored as the message when the player
--     typed nothing, because the table has always required a message and the inbox reads one.
--   * A concern note queues one email per club owner and organizer in the existing
--     `public.email_outbox`, with the new kind `feedback_alert`. A queued row is a draft: the send
--     route still records the provider answer, so the alert is sent when a staff screen sends the
--     outbox for the note's event. Nothing here adds a cron, a trigger or a queue worker.
--
-- `public_event_archive()` is the portfolio read: every event the public site may show, in state
-- open or closed, with no time limit, newest first, plus `finished`, `featured` and `hasRules`. It
-- is the same allow-listed payload as `public_showcase_events()`, which keeps its one-year window.
--
-- Everything is additive except the two replacements the brief requires: the feedback category
-- check (widened) and the outbox kind check (widened). No existing category, kind, policy, public
-- read or row is removed. The one function dropped is the previous 9-argument `submit_feedback`, so
-- a caller cannot reach the earlier validation path.

-- 1. The concern on a feedback note ---------------------------------------------------------------

alter table public.public_feedback
  add column if not exists details jsonb;

comment on column public.public_feedback.details is
  'The structured part of a player concern: ticked concerns, hole number, tee colour, other text, player name, handicap, schedule, source and a chat transcript. The shape is the one src/lib/data/concerns.ts defines. Null for every other category.';

-- A concern is the only category the app sends details for today. The check keeps the column an
-- object, so the desk never has to read a stray string or array as a concern.
alter table public.public_feedback
  drop constraint if exists public_feedback_details_concern_only;
alter table public.public_feedback
  drop constraint if exists public_feedback_details_object;
alter table public.public_feedback
  add constraint public_feedback_details_object
  check (details is null or jsonb_typeof(details) = 'object');

alter table public.public_feedback
  drop constraint if exists public_feedback_category_check;
alter table public.public_feedback
  add constraint public_feedback_category_check
  check (category in ('improvement', 'bug', 'content', 'demo', 'concern'));

-- 2. The public submission, now with the concern details ------------------------------------------
-- The old signature is dropped first. Leaving it in place would let a caller reach the previous
-- validation path, which knows nothing about p_details. Every old argument keeps its position, so a
-- named-argument caller still works.

drop function if exists public.submit_feedback(
  text, text, text, text, boolean, text, text, text, uuid
);

create or replace function public.submit_feedback(
  p_category text,
  p_message text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_consent boolean default false,
  p_page_path text default null,
  p_locale text default 'en',
  p_honeypot text default null,
  p_tournament uuid default null,
  p_details jsonb default null
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
  v_details jsonb;
  v_concerns jsonb;
  v_kind text;
  v_hole numeric;
  v_tee text;
  v_text text;
  v_source text;
  v_turn jsonb;
  v_turns jsonb := '[]'::jsonb;
  v_turn_count integer;
  v_summary text;
  v_feedback_id uuid;
  v_subject text;
  v_body text;
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
  if v_category not in ('improvement', 'bug', 'content', 'demo', 'concern') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_category',
      'message', 'Choose what the note is about.'
    );
  end if;

  v_message := btrim(coalesce(p_message, ''));
  v_details := null;

  if v_category = 'concern' then
    -- The same checks, in the same order, as normaliseConcern() in src/lib/data/concerns.ts. The
    -- stored object is rebuilt from known keys only, so anything else a caller sends is dropped
    -- instead of being kept and shown in the desk.
    if jsonb_typeof(p_details) is distinct from 'object' then
      return jsonb_build_object(
        'ok', false,
        'code', 'no_concern',
        'message', 'Tick at least one concern.'
      );
    end if;

    v_concerns := p_details -> 'concerns';
    if jsonb_typeof(v_concerns) is distinct from 'array' then
      return jsonb_build_object(
        'ok', false,
        'code', 'no_concern',
        'message', 'Tick at least one concern.'
      );
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_concerns) e where jsonb_typeof(e) is distinct from 'string'
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'unknown_concern',
        'message', 'One of the ticked concerns is not on the list. Reload the page and try again.'
      );
    end if;

    v_concerns := '[]'::jsonb;
    for v_kind in select jsonb_array_elements_text(p_details -> 'concerns') loop
      if v_kind not in (
        'inquiry', 'name_typo', 'schedule', 'handicap', 'score', 'tee_off', 'other'
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'unknown_concern',
          'message', 'One of the ticked concerns is not on the list. Reload the page and try again.'
        );
      end if;
      if not (v_concerns ? v_kind) then
        v_concerns := v_concerns || to_jsonb(v_kind);
      end if;
    end loop;

    if jsonb_array_length(v_concerns) = 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'no_concern',
        'message', 'Tick at least one concern.'
      );
    end if;

    v_source := p_details ->> 'source';
    if v_source is null or v_source not in ('form', 'chat') then
      return jsonb_build_object(
        'ok', false,
        'code', 'bad_source',
        'message', 'The note did not say where it came from. Reload the page and try again.'
      );
    end if;

    v_details := jsonb_build_object('concerns', v_concerns, 'source', v_source);

    if v_concerns ? 'score' then
      -- A blank, missing or null hole is a missing answer; anything that is not a whole number from
      -- 1 to 18 is out of range. A string that reads as a number is accepted, as the form sends one.
      if not (p_details ? 'holeNo')
         or jsonb_typeof(p_details -> 'holeNo') = 'null'
         or (jsonb_typeof(p_details -> 'holeNo') = 'string'
             and btrim(p_details ->> 'holeNo') = '') then
        return jsonb_build_object(
          'ok', false,
          'code', 'hole_required',
          'message', 'Enter the hole number.'
        );
      end if;

      if jsonb_typeof(p_details -> 'holeNo') = 'number' then
        v_hole := (p_details ->> 'holeNo')::numeric;
      elsif jsonb_typeof(p_details -> 'holeNo') = 'string'
            and btrim(p_details ->> 'holeNo') ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then
        v_hole := btrim(p_details ->> 'holeNo')::numeric;
      else
        return jsonb_build_object(
          'ok', false,
          'code', 'hole_out_of_range',
          'message', 'Enter a hole number from 1 to 18.'
        );
      end if;

      if v_hole is null or v_hole <> trunc(v_hole) or v_hole < 1 or v_hole > 18 then
        return jsonb_build_object(
          'ok', false,
          'code', 'hole_out_of_range',
          'message', 'Enter a hole number from 1 to 18.'
        );
      end if;
      v_details := v_details || jsonb_build_object('holeNo', trunc(v_hole)::integer);
    end if;

    if v_concerns ? 'tee_off' then
      v_tee := lower(btrim(coalesce(p_details ->> 'teeColour', '')));
      if v_tee = '' then
        return jsonb_build_object(
          'ok', false,
          'code', 'tee_required',
          'message', 'Choose the tee colour.'
        );
      end if;
      if v_tee not in ('blue', 'silver', 'white', 'red') then
        return jsonb_build_object(
          'ok', false,
          'code', 'tee_unknown',
          'message', 'Choose Blue, Silver, White or Red.'
        );
      end if;
      v_details := v_details || jsonb_build_object('teeColour', v_tee);
    end if;

    if v_concerns ? 'other' then
      v_text := nullif(btrim(regexp_replace(coalesce(p_details ->> 'otherText', ''), '\s+', ' ', 'g')), '');
      if v_text is null then
        return jsonb_build_object(
          'ok', false,
          'code', 'other_required',
          'message', 'Write what the other concern is.'
        );
      end if;
      if char_length(v_text) > 200 then
        return jsonb_build_object(
          'ok', false,
          'code', 'too_long',
          'message', 'Keep each answer to 200 characters or fewer.'
        );
      end if;
      v_details := v_details || jsonb_build_object('otherText', v_text);
    end if;

    -- The player's own words about who they are and when they play. A non-string is ignored, as
    -- cleanText() in concerns.ts ignores it, rather than being turned into text here.
    foreach v_kind in array array['playerName', 'handicap', 'schedule'] loop
      if jsonb_typeof(p_details -> v_kind) = 'string' then
        v_text := nullif(btrim(regexp_replace(p_details ->> v_kind, '\s+', ' ', 'g')), '');
        if v_text is not null then
          if char_length(v_text) > 200 then
            return jsonb_build_object(
              'ok', false,
              'code', 'too_long',
              'message', 'Keep each answer to 200 characters or fewer.'
            );
          end if;
          v_details := v_details || jsonb_build_object(v_kind, v_text);
        end if;
      end if;
    end loop;

    -- A transcript belongs to a chat note only, capped at the last 40 turns of 2000 characters.
    if p_details ? 'transcript' then
      if v_source <> 'chat' or jsonb_typeof(p_details -> 'transcript') is distinct from 'array' then
        return jsonb_build_object(
          'ok', false,
          'code', 'bad_transcript',
          'message', 'The conversation could not be read. Send the note from the page again.'
        );
      end if;

      for v_turn in select * from jsonb_array_elements(p_details -> 'transcript') loop
        if jsonb_typeof(v_turn) is distinct from 'object'
           or jsonb_typeof(v_turn -> 'content') is distinct from 'string'
           or (v_turn ->> 'role') not in ('user', 'assistant') then
          return jsonb_build_object(
            'ok', false,
            'code', 'bad_transcript',
            'message', 'The conversation could not be read. Send the note from the page again.'
          );
        end if;
        v_turns := v_turns || jsonb_build_array(
          jsonb_build_object(
            'role', v_turn ->> 'role',
            'content', left(v_turn ->> 'content', 2000)
          )
        );
      end loop;

      v_turn_count := jsonb_array_length(v_turns);
      if v_turn_count > 40 then
        select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
          into v_turns
          from jsonb_array_elements(v_turns) with ordinality as t(value, ord)
         where ord > v_turn_count - 40;
      end if;

      v_details := v_details || jsonb_build_object('transcript', v_turns);
    end if;

    -- The one readable line the inbox and the alert lead with, built exactly as concernSummary()
    -- does. The details are the message when the player typed nothing, so the table's own
    -- "message is 3 to 2000 characters" rule still holds and the inbox has something to show.
    select string_agg(
      case c
        when 'score' then 'Score (hole ' || (v_details ->> 'holeNo') || ')'
        when 'tee_off' then 'Tee off (' || initcap(v_details ->> 'teeColour') || ')'
        when 'other' then 'Others: ' || (v_details ->> 'otherText')
        when 'name_typo' then 'Name typo'
        when 'inquiry' then 'Inquiry'
        when 'schedule' then 'Schedule'
        when 'handicap' then 'Handicap'
        else 'Others'
      end, ', ' order by ord)
      into v_summary
      from jsonb_array_elements_text(v_concerns) with ordinality as s(c, ord);

    v_message := coalesce(nullif(v_message, ''), v_summary);
  end if;

  -- Every other category still needs a message. A concern never reaches here empty: its summary
  -- above is the message when the player typed nothing.
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
    club_id, tournament_id, category, message, details, contact_name, contact_email,
    contact_consent, page_path, locale, rate_key
  )
  values (
    v_club, v_tournament, v_category, v_message, v_details, v_contact_name, v_contact_email,
    v_consent, v_page_path, v_locale, v_rate_key
  )
  returning id into v_feedback_id;

  -- A concern is urgent enough to leave the inbox: one queued alert per club owner and organizer.
  -- The outbox needs a tournament id, so a note with no public event (which only happens when the
  -- club has none) queues nothing and waits in the inbox instead. A queued row is a draft; the send
  -- route claims it and records the provider answer, so this never sends mail from a web request.
  if v_category = 'concern' and v_tournament is not null then
    v_subject := left('New player concern: ' || v_summary, 200);

    v_body :=
      'Concern: ' || v_summary || E'\n'
      || 'Player: ' || coalesce(v_details ->> 'playerName', 'not given') || E'\n'
      || 'Handicap: ' || coalesce(v_details ->> 'handicap', 'not given') || E'\n'
      || 'Schedule: ' || coalesce(v_details ->> 'schedule', 'not given') || E'\n'
      || 'Message: ' || coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'not given') || E'\n'
      || E'\n'
      || 'Open the desk inbox: /feedback-inbox?event=' || v_tournament::text || E'\n'
      || 'This is a queued alert from the public feedback page, not a delivery claim.';

    insert into public.email_outbox (
      club_id, tournament_id, registration_id, recipient_email, recipient_name, kind,
      subject, body, status, dedupe_key
    )
    select
      v_club,
      v_tournament,
      null,
      lower(btrim(u.email)),
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        lower(btrim(u.email))
      ),
      'feedback_alert',
      v_subject,
      v_body,
      'queued',
      'feedback_alert:' || v_feedback_id::text || ':' || m.user_id::text
    from public.club_members m
    join auth.users u on u.id = m.user_id
    where m.club_id = v_club
      and m.role in ('owner', 'organizer')
      and nullif(btrim(u.email), '') is not null
    on conflict (club_id, dedupe_key) do nothing;
  end if;

  -- Only the small result leaves the function. No id, no row, no count.
  return jsonb_build_object(
    'ok', true,
    'code', 'accepted',
    'message', 'Thank you. The organizer will read your note.'
  );
end;
$$;

revoke all on function public.submit_feedback(
  text, text, text, text, boolean, text, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_feedback(
  text, text, text, text, boolean, text, text, text, uuid, jsonb
) to anon, authenticated;

-- 3. The alert kind ---------------------------------------------------------------------------------
-- Additive: every previous kind stays valid.

alter table public.email_outbox
  drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('confirmation', 'reminder', 'custom', 'feedback_digest', 'feedback_alert'));

-- 4. The public event archive ------------------------------------------------------------------------
-- The same payload as public_showcase_events(), with no time window and newest first, so the
-- portfolio can list every event the club has run. `hasRules` says whether the organizer's rules of
-- play are stored for that event, which is what the /rules redirect needs.

create or replace function public.public_event_archive()
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
        'hasRules', nullif(btrim(coalesce(t.rules_of_play, '')), '') is not null,
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
      order by first_date desc, name desc),
    '[]'::jsonb
  )
  from listed;
$$;

comment on function public.public_event_archive() is
  'Every event the public site may show, in state open or closed, with no time limit and newest first, each with finished, featured and hasRules flags. Same fields as public_showcase_events(): no contact details, no player data.';

revoke all on function public.public_event_archive() from public;
grant execute on function public.public_event_archive() to anon, authenticated;

-- 5. Self-check ---------------------------------------------------------------------------------------
-- Prove the column, both checks, the new signature, the grants and the archive, in this transaction.
-- The probes below either refuse before any insert or are deleted explicitly: the SQL editor runs a
-- script statement by statement, so an inserted row can outlive the block that raised.

do $$
declare
  v_club uuid;
  v_course uuid;
  v_rows jsonb;
  v_names text[];
  v_flag boolean;
  v_keys text[];
  v_result jsonb;
  v_clubs integer;
  v_text text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'public_feedback'
       and column_name = 'details'
  ) then
    raise exception 'public_feedback.details was not added';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'public_feedback_category_check'
       and pg_get_constraintdef(oid) like '%concern%'
  ) then
    raise exception 'public_feedback does not accept the concern category';
  end if;

  if exists (
    select 1 from pg_constraint
     where conname = 'public_feedback_category_check'
       and pg_get_constraintdef(oid) not like '%demo%'
  ) then
    raise exception 'public_feedback lost the demo category';
  end if;

  if to_regprocedure(
    'public.submit_feedback(text,text,text,text,boolean,text,text,text,uuid)'
  ) is not null then
    raise exception 'the old 9-argument submit_feedback still exists';
  end if;

  if to_regprocedure(
    'public.submit_feedback(text,text,text,text,boolean,text,text,text,uuid,jsonb)'
  ) is null then
    raise exception 'the 10-argument submit_feedback was not created';
  end if;

  if not has_function_privilege(
    'anon',
    'public.submit_feedback(text,text,text,text,boolean,text,text,text,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute the new submit_feedback';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'email_outbox_kind_check'
       and pg_get_constraintdef(oid) like '%feedback_alert%'
  ) then
    raise exception 'email_outbox does not accept the feedback_alert kind';
  end if;

  if exists (
    select 1 from pg_constraint
     where conname = 'email_outbox_kind_check'
       and pg_get_constraintdef(oid) not like '%feedback_digest%'
  ) then
    raise exception 'email_outbox lost the feedback_digest kind';
  end if;

  if not has_function_privilege('anon', 'public.public_event_archive()', 'EXECUTE') then
    raise exception 'anon cannot execute public.public_event_archive';
  end if;

  -- The refusal paths write nothing, so they run on any project, including an empty one.
  v_result := public.submit_feedback('concern', '', null, null, false, '/feedback', 'en', '', null, null);
  if v_result ->> 'code' <> 'no_concern' then
    raise exception 'submit_feedback accepted a concern with no details: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": [], "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'no_concern' then
    raise exception 'submit_feedback accepted an empty concern list: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["weather"], "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'unknown_concern' then
    raise exception 'submit_feedback accepted an unknown concern: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["score"], "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'hole_required' then
    raise exception 'submit_feedback accepted a score concern with no hole: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["score"], "holeNo": 19, "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'hole_out_of_range' then
    raise exception 'submit_feedback accepted hole 19: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["tee_off"], "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'tee_required' then
    raise exception 'submit_feedback accepted a tee-off concern with no colour: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["tee_off"], "teeColour": "green", "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'tee_unknown' then
    raise exception 'submit_feedback accepted an unknown tee colour: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["other"], "source": "form"}'::jsonb
  );
  if v_result ->> 'code' <> 'other_required' then
    raise exception 'submit_feedback accepted an empty Others line: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    jsonb_build_object('concerns', jsonb_build_array('inquiry'), 'source', 'form',
                       'playerName', repeat('x', 201))
  );
  if v_result ->> 'code' <> 'too_long' then
    raise exception 'submit_feedback accepted a 201-character name: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["inquiry"], "source": "email"}'::jsonb
  );
  if v_result ->> 'code' <> 'bad_source' then
    raise exception 'submit_feedback accepted an unknown source: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'concern', '', null, null, false, '/feedback', 'en', '', null,
    '{"concerns": ["inquiry"], "source": "form", "transcript": [{"role": "user", "content": "hi"}]}'::jsonb
  );
  if v_result ->> 'code' <> 'bad_transcript' then
    raise exception 'submit_feedback accepted a transcript on a form note: %', v_result;
  end if;

  -- The archive. Probe events are inserted and deleted explicitly; a draft event must not appear,
  -- an old event must, and the newest must come first.
  select club_id, course_id into v_club, v_course from public.tournaments limit 1;
  if v_club is null then
    raise notice 'No event exists to derive a club and course from; skipping the archive self-check.';
  else
    insert into public.tournaments
      (club_id, course_id, name, play_date, cutoff_date, start_format, first_tee_time, state, dates,
       rules_of_play)
    values
      (v_club, v_course, 'zz-archive-new', current_date + 20, current_date + 10, 'shotgun',
       '23:45', 'open', array[current_date + 20], 'Local rules for the probe.'),
      (v_club, v_course, 'zz-archive-old', current_date - 900, current_date - 910, 'shotgun',
       '23:45', 'closed', array[current_date - 900], null),
      (v_club, v_course, 'zz-archive-draft', current_date + 21, current_date + 10, 'shotgun',
       '23:45', 'draft', array[current_date + 21], null);

    v_rows := public.public_event_archive();

    select array_agg(e ->> 'name') into v_names from jsonb_array_elements(v_rows) e;
    if not ('zz-archive-new' = any (v_names)) then
      raise exception 'The archive did not list a new event: %', v_names;
    end if;
    if not ('zz-archive-old' = any (v_names)) then
      raise exception 'The archive dropped an old event: %', v_names;
    end if;
    if 'zz-archive-draft' = any (v_names) then
      raise exception 'The archive listed a draft event: %', v_names;
    end if;

    select e ->> 'name' into v_text from jsonb_array_elements(v_rows) e limit 1;
    if v_text is distinct from 'zz-archive-new' then
      raise exception 'The archive is not newest first: % came first', v_text;
    end if;

    select (e ->> 'hasRules')::boolean into v_flag
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-archive-new';
    if v_flag is not true then
      raise exception 'An event with rules of play did not report hasRules: %', v_flag;
    end if;

    select (e ->> 'hasRules')::boolean into v_flag
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-archive-old';
    if v_flag is not false then
      raise exception 'An event without rules of play reported hasRules: %', v_flag;
    end if;

    select (e ->> 'finished')::boolean into v_flag
    from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-archive-old';
    if v_flag is not true then
      raise exception 'An old event did not report finished: %', v_flag;
    end if;

    select array_agg(k) into v_keys
    from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k
    where k not in ('tournamentId', 'name', 'dates', 'startFormat', 'firstTeeTime', 'cutOffDate',
                    'entriesOpen', 'entered', 'finished', 'featured', 'hasRules');
    if v_keys is not null then
      raise exception 'The archive payload carries unexpected fields: %', v_keys;
    end if;

    delete from public.tournaments where name like 'zz-archive-%';
  end if;

  -- The alert rule is catalog-only here: a real concern note would queue email, and the self-check
  -- must not leave mail in the outbox. The refusal paths above prove the validation; the kind check
  -- above proves the outbox accepts the alert.
  select count(*) into v_clubs from public.clubs;
  if v_clubs = 1 then
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'email_outbox'
         and column_name = 'kind'
    ) then
      raise exception 'email_outbox has no kind column';
    end if;
  end if;
end $$;

-- 6. Owner check, after the migration is applied ------------------------------------------------
--
-- The events the portfolio lists, newest first:
--
--   select e ->> 'name' as event,
--          (e ->> 'finished')::boolean as finished,
--          (e ->> 'hasRules')::boolean as has_rules,
--          (e ->> 'featured')::boolean as featured
--     from jsonb_array_elements(public.public_event_archive()) e;
--
-- The concern notes in the inbox:
--
--   select created_at, category, message, details
--     from public.public_feedback
--    where category = 'concern'
--    order by created_at desc
--    limit 20;
--
-- The queued alerts:
--
--   select created_at, recipient_email, subject, status
--     from public.email_outbox
--    where kind = 'feedback_alert'
--    order by created_at desc
--    limit 20;
--
-- A queued alert is a draft. It is sent when a staff account sends that event's outbox from the
-- email desk screen (POST /api/email/send with the event id); there is no cron and no automatic send.



-- ---- supabase/migrations/20261122000100_concern_chat_rate.sql (verbatim) ----

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

commit;

-- Check queries, to run after the transaction commits ------------------------------------------

-- 1. The new column, the widened category check and the alert kind:
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'public_feedback'
--    order by ordinal_position;
--
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname in ('public_feedback_category_check', 'email_outbox_kind_check');
--
-- 2. The function signature the app calls:
--
--   select p.oid::regprocedure as signature
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'submit_feedback';
--
-- 3. Every event the portfolio lists, newest first:
--
--   select e ->> 'name' as event,
--          (e ->> 'finished')::boolean as finished,
--          (e ->> 'hasRules')::boolean as has_rules,
--          (e ->> 'featured')::boolean as featured,
--          (e ->> 'entered')::integer as entered
--     from jsonb_array_elements(public.public_event_archive()) e;
--
-- 4. The concern notes and their details:
--
--   select created_at, category, message, details
--     from public.public_feedback
--    where category = 'concern'
--    order by created_at desc
--    limit 20;
--
-- 5. The queued alerts (a queued row is waiting, not sent):
--
--   select created_at, recipient_email, subject, status
--     from public.email_outbox
--    where kind = 'feedback_alert'
--    order by created_at desc
--    limit 20;
--
-- 6. Send the queued alerts for one event from the desk, or with the existing route:
--
--   POST /api/email/send  { "tournamentId": "<event id>" }