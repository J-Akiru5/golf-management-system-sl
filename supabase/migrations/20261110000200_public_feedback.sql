-- Public feedback and the organizer inbox (issue 208 / T-0012).
--
-- ADDITIVE. One new table, one new SECURITY DEFINER function, two RLS policies and one trigger.
-- No existing table, policy, grant or public function is changed.
--
-- The visitor never touches the table. `submit_feedback` is the only write path, it validates the
-- input itself, and it returns a small result rather than the stored row. An anonymous visitor has
-- no SELECT, INSERT, UPDATE or DELETE privilege on public.public_feedback.
--
-- Privacy choices, recorded here because they are easy to lose later:
--
--   * No raw IP address and no user agent is stored. The rate-limit key is a 64-bit
--     `hashtextextended` value over the client address and the club. It is pseudonymous, not a
--     cryptographic commitment: it groups submissions from one connection and cannot be read back
--     as an address.
--   * The address is read from the proxy headers PostgREST exposes (`x-forwarded-for`, then
--     `x-real-ip`), and only then from `inet_client_addr()`. When none is available the key falls
--     back to the literal `no-address`. That is the smallest safe fallback: every no-address request
--     shares one bucket, so the limiter can only over-refuse, never silently allow a flood, and no
--     visitor data is stored to make the key.
--   * A filled honeypot writes nothing and returns the same accepted reply as a real note. A bot
--     therefore cannot tell that it was caught. The hidden field is off-screen and removed from the
--     tab order, so a person never reaches it.
--   * Contact details are optional. They are stored only when the visitor ticked the contact
--     consent box. A note with a name or email but no consent is refused.
--   * Nothing in this table is exposed to an anonymous caller. Only club staff may select; only an
--     owner or organizer may move a note through its statuses.

-- 1. The table ------------------------------------------------------------------------------------

create table if not exists public.public_feedback (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  category text not null
    check (category in ('improvement', 'bug', 'content')),
  message text not null
    check (char_length(btrim(message)) between 3 and 2000),
  contact_name text
    check (contact_name is null or char_length(btrim(contact_name)) between 1 and 120),
  contact_email text
    check (
      contact_email is null
      or (
        char_length(btrim(contact_email)) <= 254
        and position('@' in contact_email) > 1
      )
    ),
  contact_consent boolean not null default false,
  page_path text
    check (
      page_path is null
      or (left(page_path, 1) = '/' and char_length(page_path) between 1 and 300)
    ),
  locale text not null default 'en'
    check (locale in ('en', 'tl', 'hil')),
  status text not null default 'new'
    check (status in ('new', 'read', 'planned', 'done', 'dismissed')),
  -- The pseudonymous rate-limit bucket. Never an address or a user agent.
  rate_key text not null
    check (char_length(rate_key) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users (id) on delete set null,
  constraint public_feedback_contact_consent
    check ((contact_name is null and contact_email is null) or contact_consent)
);

comment on table public.public_feedback is
  'Notes sent from the public feedback page. Readable only by club staff; nothing here is public.';
comment on column public.public_feedback.rate_key is
  'A pseudonymous rate-limit bucket derived from the client address and the club. Never a raw address or user agent.';
comment on column public.public_feedback.status is
  'Triage state: new, read, planned, done or dismissed. Only an owner or organizer may change it.';

create index if not exists public_feedback_club_created_idx
  on public.public_feedback (club_id, created_at desc);

create index if not exists public_feedback_club_status_created_idx
  on public.public_feedback (club_id, status, created_at desc);

create index if not exists public_feedback_rate_idx
  on public.public_feedback (club_id, rate_key, created_at desc);

-- 2. Row-level security ---------------------------------------------------------------------------

alter table public.public_feedback enable row level security;

-- An explicit revoke, not just the absence of a policy: the table is closed to an anonymous caller
-- at the privilege layer as well. The RPC below is the only anonymous door.
revoke all on table public.public_feedback from public, anon, authenticated;

-- Staff may read their own club's notes. A player account is not a club member and gets no rows.
grant select on table public.public_feedback to authenticated;

-- A manager may update the status column only. Column privileges are the first guard; the trigger
-- below is the second, and the update policy is the third.
grant update (status) on table public.public_feedback to authenticated;

drop policy if exists public_feedback_staff_read on public.public_feedback;
create policy public_feedback_staff_read on public.public_feedback
  for select to authenticated
  using (public.is_club_member(club_id));

drop policy if exists public_feedback_manager_status on public.public_feedback;
create policy public_feedback_manager_status on public.public_feedback
  for update to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

-- 3. Status metadata ------------------------------------------------------------------------------
-- The client sends only `status`. The trigger stamps who changed it and when, keeps the rest of the
-- row immutable, and refuses an update that tries to rewrite the message or the contact details.

create or replace function public.stamp_public_feedback_status()
returns trigger
language plpgsql
set search_path = ''
as $$
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
    raise exception 'Only the status of a feedback note can be changed.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := (select auth.uid());
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_feedback_stamp_status on public.public_feedback;

create trigger public_feedback_stamp_status
  before update on public.public_feedback
  for each row execute function public.stamp_public_feedback_status();

-- 4. The public submission ------------------------------------------------------------------------
--
-- The only write an anonymous caller can make. It resolves the club server-side instead of trusting
-- a value from the browser. The first release has one club; when a public site serves more than one,
-- this function grows an explicit club parameter and a host-to-club check rather than guessing.
--
-- Errors are small, stable codes plus a short sentence. They never echo the submitted text and never
-- name a database object.

create or replace function public.submit_feedback(
  p_category text,
  p_message text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_consent boolean default false,
  p_page_path text default null,
  p_locale text default 'en',
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clubs integer;
  v_club uuid;
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
  -- browser's point of view: the same accepted reply, and no row. See the header for why.
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
    club_id, category, message, contact_name, contact_email, contact_consent,
    page_path, locale, rate_key
  )
  values (
    v_club, v_category, v_message, v_contact_name, v_contact_email, v_consent,
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
  text, text, text, text, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_feedback(
  text, text, text, text, boolean, text, text, text
) to anon, authenticated;

-- 5. Self-check -----------------------------------------------------------------------------------

do $$
declare
  v_before bigint;
  v_after bigint;
  v_result jsonb;
begin
  if to_regclass('public.public_feedback') is null then
    raise exception 'public.public_feedback was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.public_feedback'::regclass) then
    raise exception 'public.public_feedback does not have row-level security enabled';
  end if;

  if has_table_privilege('anon', 'public.public_feedback', 'SELECT')
     or has_table_privilege('anon', 'public.public_feedback', 'INSERT')
     or has_table_privilege('anon', 'public.public_feedback', 'UPDATE')
     or has_table_privilege('anon', 'public.public_feedback', 'DELETE') then
    raise exception 'anon still has a table privilege on public.public_feedback';
  end if;

  if not has_function_privilege(
    'anon',
    'public.submit_feedback(text,text,text,text,boolean,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute public.submit_feedback';
  end if;

  -- These calls exercise the refusal paths and write nothing.
  v_result := public.submit_feedback(
    'not-a-category', 'A test note', null, null, false, '/feedback', 'en', ''
  );
  if v_result ->> 'code' <> 'invalid_category' then
    raise exception 'submit_feedback accepted an invalid category: %', v_result;
  end if;

  v_result := public.submit_feedback('bug', '   ', null, null, false, '/feedback', 'en', '');
  if v_result ->> 'code' <> 'message_required' then
    raise exception 'submit_feedback accepted an empty message: %', v_result;
  end if;

  v_result := public.submit_feedback(
    'bug', 'A test note', 'Visitor', 'visitor@example.test', false, '/feedback', 'en', ''
  );
  if v_result ->> 'code' <> 'consent_required' then
    raise exception 'submit_feedback accepted contact details without consent: %', v_result;
  end if;

  -- A filled honeypot is a neutral success and must not add a row.
  select count(*) into v_before from public.public_feedback;
  v_result := public.submit_feedback(
    'bug', 'A test note', null, null, false, '/feedback', 'en', 'filled-by-a-bot'
  );
  select count(*) into v_after from public.public_feedback;
  if v_result ->> 'code' <> 'accepted' then
    raise exception 'the honeypot did not return the neutral success: %', v_result;
  end if;
  if v_after <> v_before then
    raise exception 'the honeypot stored a row';
  end if;
end $$;
