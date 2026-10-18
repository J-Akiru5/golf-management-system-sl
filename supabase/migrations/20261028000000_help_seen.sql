-- Help centre seen-state: one row per person per panel they have dismissed.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. It is safe to run twice: the table is `if not exists` and
-- the policy is dropped and recreated before it is created again.
--
-- What it is for: the first-run welcome, so a person is greeted once and only once.
--
-- It is per *user*, not per club member. A player signing in at /my has an account and no club
-- member row (players are not club members by design), and neither audience should be greeted
-- twice, so `auth.users` is the right anchor for both.
--
--   user_id    whoever dismissed it; `auth.uid()` by default, so the client never sends an id
--   guide_id   'welcome.desk' or 'welcome.player' today; a later "don't show this again" fits here
--   seen_at    when, for the record
--
-- RLS is the whole protection: a person reads and writes only their own rows, and no function is
-- needed, which is why this is smaller than the notifications migration. The app writes with
-- `insert ... on conflict do update`, so the default fills `user_id` and no service role is used.
--
-- Until this is applied, the app keeps the same state in the browser's localStorage and the welcome
-- still shows once per device: applying this makes it once per person across devices.

create table if not exists public.help_seen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  guide_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);

alter table public.help_seen enable row level security;

drop policy if exists help_seen_own on public.help_seen;
create policy help_seen_own on public.help_seen
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.help_seen is
  'Per-user help dismissal state (first-run welcome). Interface state, not club data.';
