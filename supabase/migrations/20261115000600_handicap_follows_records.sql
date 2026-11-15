-- Remove handicap freezing (owner's decision, 15 Nov 2026): a handicap record now drives everything.
--
-- Renumbered 000600 (was 000400, which collided with the cap migration). Same SQL as already run.
--
-- Before: saving a record on the player page changed only the history. The registration kept its
-- old frozen index until someone pressed "Re-freeze", so snapshots, results and public pages stayed
-- on the old number.
--
-- Now: an AFTER INSERT/UPDATE trigger on public.handicap_records
--   1. takes the player's latest record (highest effective date) as the index,
--   2. writes it to every registration of that player whose tournament still has an unfinished
--      round (or no rounds yet): frozen_index, frozen_record_id, frozen_effective_date, frozen_at,
--      so the "Re-freeze needed" banner goes away,
--   3. recomputes the round handicap snapshot of each active entry in a non-final round with the
--      existing public.reset_handicap_from_desk (same arithmetic, same bypass, recalculates the
--      player's results), so the board and the public profile follow at once.
-- Final rounds are never touched. A step that cannot run (no tee, bad setting) is skipped with a
-- notice; it never blocks saving the record. The column names stay; only the manual step is gone.

create or replace function public.handicap_record_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.handicap_records%rowtype;
  v_reg record;
  v_entry record;
begin
  select * into v_latest
  from public.handicap_records
  where player_id = new.player_id and club_id = new.club_id
  order by effective_date desc
  limit 1;

  if v_latest.id is null then
    return new;
  end if;

  for v_reg in
    select reg.id
    from public.registrations reg
    where reg.player_id = new.player_id
      and reg.club_id = new.club_id
      and (
        not exists (select 1 from public.competition_rounds r where r.tournament_id = reg.tournament_id)
        or exists (
          select 1 from public.competition_rounds r
          where r.tournament_id = reg.tournament_id and r.status <> 'final'
        )
      )
  loop
    begin
      update public.registrations
      set frozen_index = v_latest.handicap_index,
          frozen_record_id = v_latest.id,
          frozen_effective_date = v_latest.effective_date,
          frozen_at = now()
      where id = v_reg.id;
    exception when others then
      raise notice 'handicap follow: registration % not updated: %', v_reg.id, sqlerrm;
      continue;
    end;

    for v_entry in
      select re.id
      from public.round_entries re
      join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
      where re.registration_id = v_reg.id
        and re.status = 'active'
        and r.status <> 'final'
    loop
      begin
        perform public.reset_handicap_from_desk(v_entry.id, 'Handicap record saved');
      exception when others then
        raise notice 'handicap follow: round entry % not recomputed: %', v_entry.id, sqlerrm;
      end;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.handicap_record_follow() from public, anon, authenticated;

drop trigger if exists handicap_records_follow on public.handicap_records;

create trigger handicap_records_follow
  after insert or update of handicap_index, effective_date on public.handicap_records
  for each row execute function public.handicap_record_follow();

-- One-time catch-up: re-run the follow for every player whose registration disagrees with the
-- latest record (this is what the "Re-freeze needed" banner flags). Safe to repeat.
update public.handicap_records hr
   set handicap_index = hr.handicap_index
 where hr.id in (
   select distinct on (player_id) id
   from public.handicap_records
   order by player_id, effective_date desc
 );
