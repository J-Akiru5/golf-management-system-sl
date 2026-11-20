-- TeeLine Workspace, part 4 of 4: Realtime authorization.
-- ADDITIVE: new policies on realtime.messages, and new trigger functions on the workspace tables.
--
-- PREREQUISITE (a project setting, not SQL): Realtime Authorization must be available on the
-- Supabase project (Project Settings > Realtime). Apply this part to a non-production project or
-- branch first and run the two-account check in docs/workspace/SPEC.md before the production apply.
-- Recommended after that: switch "Allow public access" off so only private channels can be joined.
-- The live tournament app uses no Realtime channels, so that switch does not affect it.
--
-- Channels (all PRIVATE; a client must open them with config.private = true):
--   ws:doc:<doc id>  Yjs sync and cursors for one document. Members read and send, and only if
--                    the document exists and is visible to them.
--   ws:board         row changes on ws_pipeline_cards, sent by the database. Members read only.
--   ws:tasks         row changes on ws_tasks and ws_task_comments, sent by the database. Members read only.
-- Clients never send on ws:board or ws:tasks, so a member cannot forge a "change" event.

-- 1. Who may receive and send -------------------------------------------------------------------

create policy ws_members_receive on realtime.messages
  for select to authenticated
  using (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (
      (select realtime.topic()) in ('ws:board', 'ws:tasks')
      or (
        (select realtime.topic()) like 'ws:doc:%'
        and exists (
          select 1
          from public.ws_docs d
          where d.id::text = substr((select realtime.topic()), 8)
        )
      )
    )
  );

create policy ws_members_send on realtime.messages
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) like 'ws:doc:%'
    and exists (
      select 1
      from public.ws_docs d
      where d.id::text = substr((select realtime.topic()), 8)
    )
  );

-- 2. Database to client change feed -------------------------------------------------------------
-- realtime.broadcast_changes writes one private message per changed row. A failure here must never
-- block a save, so it is caught and reported as a warning only.

create function public.ws_broadcast_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'ws:board', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  exception when others then
    raise warning 'ws_broadcast_board failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create function public.ws_broadcast_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'ws:tasks', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  exception when others then
    raise warning 'ws_broadcast_tasks failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.ws_broadcast_board() from public, anon;
revoke all on function public.ws_broadcast_tasks() from public, anon;

create trigger ws_pipeline_cards_broadcast
  after insert or update or delete on public.ws_pipeline_cards
  for each row execute function public.ws_broadcast_board();

create trigger ws_tasks_broadcast
  after insert or update or delete on public.ws_tasks
  for each row execute function public.ws_broadcast_tasks();

create trigger ws_task_comments_broadcast
  after insert or update or delete on public.ws_task_comments
  for each row execute function public.ws_broadcast_tasks();
