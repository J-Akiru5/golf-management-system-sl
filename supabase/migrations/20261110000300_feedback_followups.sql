-- Feedback follow-ups: event association, resolution note and the optional digest (issue 210).
--
-- ADDITIVE. New nullable columns and constraints on public.public_feedback, a replacement of the
-- status trigger, a replacement of the public submission function, one extra column grant, and one
-- widened email_outbox kind check. No existing policy, public read or feedback row is deleted.
--
-- Two rules stay exactly as they were:
--
--   * A visitor still reaches the table only through public.submit_feedback. An anon caller has no
--     select, insert, update or delete privilege and never sees the stored row.
--   * Staff may read their club's notes; only an owner or organizer may triage. The column grant
--     stays narrow: status and resolution_note, nothing else.
--
-- What changed, and why:
--
--   * tournament_id is nullable. Feedback can be about the site in general, and a general note must
--     still be accepted. When the public form or page names an event, the function checks the event
--     belongs to the resolved club and is a public-visible event (published, state open or closed).
--     A caller cannot send feedback under another club's event.
--   * resolution_note is the organizer's private answer to the team. It is never shown publicly and
--     it is stamped separately from the status, so the two audit trails do not overwrite each other.
--   * email_outbox gains 'feedback_digest'. The digest row is a queued draft, not a delivery claim.

-- 1. Columns, keys and index ---------------------------------------------------------------------

alter table public.public_feedback
  add column if not exists tournament_id uuid,
  add column if not exists resolution_note text,
  add column if not exists resolution_note_updated_at timestamptz,
  add column if not exists resolution_note_updated_by uuid references auth.users (id) on delete set null;

comment on column public.public_feedback.tournament_id is
  'The public event the note is about, or null for general site feedback. Never trusted from a caller without a club and visibility check.';
comment on column public.public_feedback.resolution_note is
  'The organizer''s private resolution note. Readable by club staff only; never public.';
comment on column public.public_feedback.resolution_note_updated_at is
  'When the resolution note last changed. Separate from the status audit columns.';
comment on column public.public_feedback.resolution_note_updated_by is
  'Who last changed the resolution note. Separate from the status audit columns.';

-- The composite key proves the event belongs to the same club as the note. Deleting an event keeps
-- the note and only removes the event link; club_id is not nullable, so the column list is explicit.
alter table public.public_feedback
  drop constraint if exists public_feedback_tournament_club_fkey;
alter table public.public_feedback
  add constraint public_feedback_tournament_club_fkey
  foreign key (tournament_id, club_id)
  references public.tournaments (id, club_id)
  on delete set null (tournament_id);

alter table public.public_feedback
  drop constraint if exists public_feedback_resolution_note_length;
alter table public.public_feedback
  add constraint public_feedback_resolution_note_length
  check (
    resolution_note is null
    or char_length(btrim(resolution_note)) between 1 and 2000
  );

create index if not exists public_feedback_club_tournament_created_idx
  on public.public_feedback (club_id, tournament_id, created_at desc);

-- 2. The status trigger now also stamps the resolution note ---------------------------------------
-- The client may change exactly two columns: status and resolution_note. Everything else stays
-- immutable, including the event link, the message and the contact details. A change to one column
-- must not rewrite the other column's audit trail.

create or replace function public.stamp_public_feedback_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_note text;
begin
  if new.club_id is distinct from old.club_id
     or new.category is distinct from old.category
     or new.message is distinct from old.message
     or new.contact_name is distinct from old.contact_name
     or new.contact_email is distinct from old.contact_email
     or new.contact_consent is distinct from old.contact_consent
     or new.page_path is distinct from old.page_path
     or new.locale is distinct from old.locale
     or new.rate_key is distinct from old.rate_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the status and the resolution note of a feedback note can be changed.'
      using errcode = '42501';
  end if;

  -- The event link can be cleared by the foreign key when an event is deleted, but a caller cannot
  -- set or move the link. Only an old link becoming null is accepted.
  if new.tournament_id is distinct from old.tournament_id
     and not (old.tournament_id is not null and new.tournament_id is null) then
    raise exception 'The event of a feedback note cannot be changed.'
      using errcode = '42501';
  end if;

  v_note := nullif(btrim(coalesce(new.resolution_note, '')), '');
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Keep the resolution note to 2000 characters or fewer.'
      using errcode = '22001';
  end if;
  new.resolution_note := v_note;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := (select auth.uid());
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
  end if;

  if new.resolution_note is distinct from old.resolution_note then
    new.resolution_note_updated_at := now();
    new.resolution_note_updated_by := (select auth.uid());
  else
    new.resolution_note_updated_at := old.resolution_note_updated_at;
    new.resolution_note_updated_by := old.resolution_note_updated_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_feedback_stamp_status on public.public_feedback;

create trigger public_feedback_stamp_status
  before update on public.public_feedback
  for each row execute function public.stamp_public_feedback_status();

-- 3. Keep the column grant narrow ----------------------------------------------------------------

revoke update (status) on table public.public_feedback from authenticated;
grant update (status, resolution_note) on table public.public_feedback to authenticated;

-- 4. The public submission, now with an optional event -------------------------------------------
-- The old 8-argument function is dropped first. Leaving it in place would let a caller reach the
-- previous validation path and skip the event check. The new function keeps every old argument at
-- the same position and appends p_tournament, so a named-argument caller still works.

drop function if exists public.submit_feedback(
  text, text, text, text, boolean, text, text, text
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
  if v_category not in ('improvement', 'bug', 'content') then
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

-- 5. The digest kind -------------------------------------------------------------------------------
-- Additive: every previous kind stays valid. The digest row is a queued draft; the send route is
-- still the only place a provider answer is recorded.

alter table public.email_outbox
  drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('confirmation', 'reminder', 'custom', 'feedback_digest'));

-- 6. Self-check -----------------------------------------------------------------------------------
-- Call the refusal path only when the project has exactly one club, so the migration also runs on an
-- empty development database. The probe writes nothing: an unknown event is refused before insert.

do $$
declare
  v_clubs integer;
  v_result jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'public_feedback'
       and column_name = 'tournament_id'
  ) then
    raise exception 'public_feedback.tournament_id was not added';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'public_feedback'
       and column_name = 'resolution_note'
  ) then
    raise exception 'public_feedback.resolution_note was not added';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'public_feedback_tournament_club_fkey'
       and contype = 'f'
  ) then
    raise exception 'the composite tournament foreign key was not created';
  end if;

  if to_regclass('public.public_feedback_club_tournament_created_idx') is null then
    raise exception 'the event index was not created';
  end if;

  if to_regprocedure(
    'public.submit_feedback(text,text,text,text,boolean,text,text,text)'
  ) is not null then
    raise exception 'the old 8-argument submit_feedback still exists';
  end if;

  if to_regprocedure(
    'public.submit_feedback(text,text,text,text,boolean,text,text,text,uuid)'
  ) is null then
    raise exception 'the 9-argument submit_feedback was not created';
  end if;

  if not has_column_privilege(
    'authenticated', 'public.public_feedback', 'resolution_note', 'UPDATE'
  ) then
    raise exception 'authenticated cannot update the resolution note';
  end if;

  if has_column_privilege('authenticated', 'public.public_feedback', 'message', 'UPDATE') then
    raise exception 'authenticated can still update the feedback message';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'email_outbox_kind_check'
       and pg_get_constraintdef(oid) like '%feedback_digest%'
  ) then
    raise exception 'email_outbox does not accept the feedback_digest kind';
  end if;

  select count(*) into v_clubs from public.clubs;
  if v_clubs = 1 then
    v_result := public.submit_feedback(
      'bug', 'A test note', null, null, false, '/feedback', 'en', '', gen_random_uuid()
    );
    if v_result ->> 'code' <> 'invalid_event' then
      raise exception 'submit_feedback accepted an unknown event: %', v_result;
    end if;
  end if;
end $$;
