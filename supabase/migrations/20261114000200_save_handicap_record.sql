-- Manual handicap record corrections (issue 204).
--
-- NOT APPLIED. Review before `supabase db push`.
--
-- The owner must approve applying it by name. It adds one function and changes nothing that exists:
-- no table, column, constraint, trigger, policy or existing function is touched, so it is additive.
--
-- Why it exists. The only write path for public.handicap_records was the NGAP import. The player
-- page's Handicap history card is read-only, and the registration desk's Edit index control changes
-- only the event's frozen index, not the player's history. That left no way to add a missing index
-- or correct a wrong one without importing a file, and no way at all once the event was closed.
--
-- What it does, in one transaction:
--   1. Finds the player's club and locks that player row, so two saves for the same date cannot both
--      insert.
--   2. Requires the caller to be an owner or organizer of that club. A desk account is refused in
--      the database, not merely by a hidden button.
--   3. Validates the index (-10 to 54) and the reason (at least 3 characters after trimming). The
--      effective date is required. Nothing is guessed or defaulted.
--   4. Upserts on (player_id, effective_date): an existing date is corrected, a new date is added.
--      The row's source becomes 'manual'. There is no delete.
--   5. Writes one audit_log row. `entity` is 'handicap_records', `entity_id` is the record id,
--      `action` is 'insert' or 'update', and `detail` carries oldIndex, newIndex, effectiveDate and
--      reason. `actor_id` and `created_at` are filled by the table's own columns.
--
-- No audit trigger is added to the table: that would change the behaviour of the NGAP import too.
-- This function's own row is the record of a manual correction.

create or replace function public.save_handicap_record(
  p_player uuid,
  p_index numeric,
  p_effective date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_record_id uuid;
  v_old_index numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_action text;
begin
  if p_effective is null then
    raise exception 'Choose the date this index took effect.' using errcode = '22023';
  end if;

  if p_index is null or p_index < -10 or p_index > 54 then
    raise exception 'The handicap index must be between -10 and 54.' using errcode = '22023';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Enter a reason of at least 3 characters.' using errcode = '22023';
  end if;

  -- The player decides the club. Locking the row serialises two saves for one player, so the
  -- select below cannot miss a record another save is inserting at the same moment.
  select club_id into v_club
    from public.players
   where id = p_player
   for update;

  if v_club is null then
    raise exception 'That player was not found.' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change a player''s handicap record.'
      using errcode = '42501';
  end if;

  select id, handicap_index into v_record_id, v_old_index
    from public.handicap_records
   where player_id = p_player
     and club_id = v_club
     and effective_date = p_effective;

  if v_record_id is null then
    insert into public.handicap_records
      (club_id, player_id, handicap_index, effective_date, source)
    values
      (v_club, p_player, p_index, p_effective, 'manual')
    returning id into v_record_id;
    v_action := 'insert';
  else
    update public.handicap_records
       set handicap_index = p_index,
           source = 'manual'
     where id = v_record_id
       and club_id = v_club;
    v_action := 'update';
  end if;

  insert into public.audit_log
    (club_id, actor_id, action, entity, entity_id, changed_columns, detail)
  values (
    v_club,
    (select auth.uid()),
    v_action,
    'handicap_records',
    v_record_id::text,
    case
      when v_action = 'insert' then array['handicap_index', 'effective_date', 'source']
      else array['handicap_index', 'source']
    end,
    jsonb_build_object(
      'oldIndex', v_old_index,
      'newIndex', p_index,
      'effectiveDate', p_effective,
      'reason', v_reason
    )
  );

  return v_record_id;
end;
$$;

comment on function public.save_handicap_record(uuid, numeric, date, text) is
  'Adds or corrects one handicap record for a player. Owner or organizer only. One record per player and effective date; writes one audit row with the old and new index, the date and the reason.';

revoke all on function public.save_handicap_record(uuid, numeric, date, text) from public;
revoke all on function public.save_handicap_record(uuid, numeric, date, text) from anon;
grant execute on function public.save_handicap_record(uuid, numeric, date, text) to authenticated;
