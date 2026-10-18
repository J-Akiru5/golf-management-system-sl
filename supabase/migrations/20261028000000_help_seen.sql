-- Help centre seen-state, one row per person per guide they have dismissed.
--
-- What this is for: the first-run welcome. It is per **user**, not per club member, because a player
-- signing in at /my has an account and no club member row (players are not club members by design),
-- and both audiences should not be greeted twice.
--
-- Shape, deliberately small:
--   user_id   whoever dismissed it; `auth.uid()` by default so the client never sends an id
--   guide_id  'welcome.desk' or 'welcome.player' today; a future "don't show this tip again" fits here
--   seen_at   when, for the record
--
-- RLS is the whole protection: a person reads and writes only their own rows. No function is needed,
-- which is why this is smaller than the notifications migration.
--
-- NOT YET APPLIED to the live project (owner decides when). Until it is applied, the app keeps the
-- same state in this browser's localStorage and the welcome still shows once per device.

create table if not exists public.help_seen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  guide_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);

alter table public.help_seen enable row level security;

create policy help_seen_own on public.help_seen
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.help_seen is
  'Per-user help dismissal state (first-run welcome). Interface state, not club data.';
