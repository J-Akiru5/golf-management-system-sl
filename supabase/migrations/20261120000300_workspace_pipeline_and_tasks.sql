-- TeeLine Workspace, part 3 of 4: the tournament pipeline board and team tasks.
-- ADDITIVE: new tables only. The foreign keys to public.tournaments reference it but do not change
-- it. Adding a foreign key takes a very short lock on public.tournaments; apply this migration
-- outside scoring peaks (the table is small, so the lock is milliseconds).
--
--   ws_pipeline_cards  one card per prospective or running tournament deal, on a 7-stage board
--   ws_tasks           team tasks, optionally linked to a card and to an existing tournament
--   ws_task_comments   discussion on a task
--
-- A card is linked to an existing tournament by tournament_id when one exists. Tournament data is
-- never copied: the card keeps only what the sales pipeline needs (club name, dates, price).
--
-- Who may do what (all rows need an ACTIVE workspace member):
--   read, create, edit, move : any member
--   delete a card or a task  : owner or partner only
--   comments                 : any member writes; the author edits; the author or owner/partner deletes
-- A member can never change who created a row.

-- 1. Pipeline cards -----------------------------------------------------------------------------

create table public.ws_pipeline_cards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  club_name text not null check (char_length(btrim(club_name)) between 1 and 160),
  stage text not null default 'inquiry'
    check (stage in ('inquiry', 'proposal_sent', 'confirmed', 'prep', 'live', 'wrap_up', 'invoiced_closed')),
  -- Order inside a stage. Fractional: a move writes the midpoint of its new neighbours.
  position double precision not null default 0,
  start_date date,
  end_date date,
  expected_players integer check (expected_players is null or expected_players between 0 and 5000),
  pricing_model text check (pricing_model in ('per_player', 'annual', 'promo_discount')),
  quoted_amount numeric(12, 2) check (quoted_amount is null or quoted_amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  owner_id uuid references public.workspace_members (user_id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 20000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index ws_pipeline_cards_board on public.ws_pipeline_cards (stage, position);
create index ws_pipeline_cards_tournament on public.ws_pipeline_cards (tournament_id)
  where tournament_id is not null;
create index ws_pipeline_cards_owner on public.ws_pipeline_cards (owner_id);

create trigger ws_pipeline_cards_touch
  before update on public.ws_pipeline_cards
  for each row execute function public.ws_touch_updated_at();

create trigger ws_pipeline_cards_lock_creator
  before update on public.ws_pipeline_cards
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 2. Tasks --------------------------------------------------------------------------------------

create table public.ws_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 20000),
  assignee_id uuid references public.workspace_members (user_id) on delete set null,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  position double precision not null default 0,
  pipeline_card_id uuid references public.ws_pipeline_cards (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ws_tasks_board on public.ws_tasks (status, position);
create index ws_tasks_assignee on public.ws_tasks (assignee_id, status);
create index ws_tasks_due on public.ws_tasks (due_date) where status <> 'done';
create index ws_tasks_card on public.ws_tasks (pipeline_card_id) where pipeline_card_id is not null;

create function public.ws_task_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.ws_task_stamp() from public, anon;

create trigger ws_tasks_stamp
  before insert or update on public.ws_tasks
  for each row execute function public.ws_task_stamp();

create trigger ws_tasks_lock_creator
  before update on public.ws_tasks
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 3. Task comments ------------------------------------------------------------------------------

create table public.ws_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ws_tasks (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index ws_task_comments_by_task on public.ws_task_comments (task_id, created_at);

create trigger ws_task_comments_lock_author
  before update on public.ws_task_comments
  for each row execute function public.ws_lock_columns('author_id', 'task_id', 'created_at');

-- 4. Row level security -------------------------------------------------------------------------

alter table public.ws_pipeline_cards enable row level security;
alter table public.ws_tasks enable row level security;
alter table public.ws_task_comments enable row level security;

revoke all on table public.ws_pipeline_cards from public, anon;
revoke all on table public.ws_tasks from public, anon;
revoke all on table public.ws_task_comments from public, anon;

grant select, insert, update, delete on table public.ws_pipeline_cards to authenticated;
grant select, insert, update, delete on table public.ws_tasks to authenticated;
grant select, insert, update, delete on table public.ws_task_comments to authenticated;

create policy ws_pipeline_cards_read on public.ws_pipeline_cards
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_pipeline_cards_create on public.ws_pipeline_cards
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_pipeline_cards_edit on public.ws_pipeline_cards
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_pipeline_cards_delete on public.ws_pipeline_cards
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_tasks_read on public.ws_tasks
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_tasks_create on public.ws_tasks
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_tasks_edit on public.ws_tasks
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_tasks_delete on public.ws_tasks
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_task_comments_read on public.ws_task_comments
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_task_comments_create on public.ws_task_comments
  for insert to authenticated
  with check ((select public.ws_is_member()) and author_id = (select auth.uid()));

create policy ws_task_comments_edit on public.ws_task_comments
  for update to authenticated
  using ((select public.ws_is_member()) and author_id = (select auth.uid()))
  with check ((select public.ws_is_member()) and author_id = (select auth.uid()));

create policy ws_task_comments_delete on public.ws_task_comments
  for delete to authenticated
  using (
    (select public.ws_is_member())
    and (author_id = (select auth.uid()) or (select public.ws_has_role(array['owner', 'partner'])))
  );
