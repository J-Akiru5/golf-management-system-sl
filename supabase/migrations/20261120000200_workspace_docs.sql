-- TeeLine Workspace, part 2 of 4: shared documents.
-- ADDITIVE: new tables only.
--
--   ws_docs           one row per document (title, archived flag)
--   ws_doc_states     the live Yjs state of each document, saved by the editor (debounced)
--   ws_doc_snapshots  named versions for history and restore; immutable once written
--
-- Document text is edited live through Yjs over a private Realtime channel (see part 4). The state
-- is stored as base64 text, which is the format @supabase-labs/y-supabase writes with its
-- persistence option (table, room column and state column are configurable, so the editor points it
-- at ws_doc_states / doc_id / state).
--
-- Who may do what (all rows need an ACTIVE workspace member):
--   read, create, edit, rename, archive : any member
--   delete a document or a snapshot     : owner or partner only
-- A member can never change who created a row.

-- 1. Documents ----------------------------------------------------------------------------------

create table public.ws_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ws_docs_listing on public.ws_docs (archived, updated_at desc);

create trigger ws_docs_touch
  before update on public.ws_docs
  for each row execute function public.ws_touch_updated_at();

create trigger ws_docs_lock_creator
  before update on public.ws_docs
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 2. Live state ---------------------------------------------------------------------------------

create table public.ws_doc_states (
  doc_id uuid primary key references public.ws_docs (id) on delete cascade,
  -- Base64 of the full Yjs update. 14 million characters is about 10 MB of binary state.
  state text not null check (char_length(state) <= 14000000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create function public.ws_doc_state_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- Keeps the document list ordered by last edit without the editor writing two tables.
create function public.ws_doc_touch_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ws_docs set updated_at = now() where id = new.doc_id;
  return null;
end;
$$;

revoke all on function public.ws_doc_state_saved() from public, anon;
revoke all on function public.ws_doc_touch_parent() from public, anon;

create trigger ws_doc_states_stamp
  before update on public.ws_doc_states
  for each row execute function public.ws_doc_state_saved();

create trigger ws_doc_states_touch_parent
  after insert or update on public.ws_doc_states
  for each row execute function public.ws_doc_touch_parent();

-- 3. Snapshots ----------------------------------------------------------------------------------
-- `state` is the full Yjs state at that moment. `content` is the same document as editor JSON, which
-- is what a restore applies (as a new edit, so the history keeps both sides) and what the history
-- list previews. `pre_restore` snapshots are written automatically just before a restore.

create table public.ws_doc_snapshots (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.ws_docs (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null default 'manual' check (kind in ('manual', 'auto', 'pre_restore')),
  state text not null check (char_length(state) <= 14000000),
  content jsonb not null check (octet_length(content::text) <= 10000000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ws_doc_snapshots_by_doc on public.ws_doc_snapshots (doc_id, created_at desc);

-- 4. Row level security -------------------------------------------------------------------------

alter table public.ws_docs enable row level security;
alter table public.ws_doc_states enable row level security;
alter table public.ws_doc_snapshots enable row level security;

revoke all on table public.ws_docs from public, anon;
revoke all on table public.ws_doc_states from public, anon;
revoke all on table public.ws_doc_snapshots from public, anon;

grant select, insert, update, delete on table public.ws_docs to authenticated;
grant select, insert, update on table public.ws_doc_states to authenticated;
grant select, insert, delete on table public.ws_doc_snapshots to authenticated;

create policy ws_docs_read on public.ws_docs
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_docs_create on public.ws_docs
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_docs_edit on public.ws_docs
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_docs_delete on public.ws_docs
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_doc_states_read on public.ws_doc_states
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_doc_states_create on public.ws_doc_states
  for insert to authenticated with check ((select public.ws_is_member()));

create policy ws_doc_states_edit on public.ws_doc_states
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_doc_snapshots_read on public.ws_doc_snapshots
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_doc_snapshots_create on public.ws_doc_snapshots
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_doc_snapshots_delete on public.ws_doc_snapshots
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));
