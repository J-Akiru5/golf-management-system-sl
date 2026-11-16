-- Run once in the Supabase SQL editor (live project). Data fix, not a migration.
-- Owner instruction in session, 15 Nov 2026.
--
-- 1. ALCARAZ, VIC is removed entirely. Checked read-only first: his player row has one registration,
--    one registration day, and nothing else (no round entry, pair, handicap record, scorecard,
--    result or membership). Nothing of his is deleted that anyone scored.
-- 2. ALCARAZ, FERDINAND gets handicap index 19.2 (his record said 0.0). His registration is already
--    on the White tee. The record is dated today so it is the latest one. Needs migration
--    20261115000600/000700 (applied): the trigger then copies 19.2 to his registration and
--    recalculates his round handicaps and results, so the scorecard and public pages follow.

begin;

-- 1. Vic Alcaraz, whole
delete from public.registration_days
 where registration_id = 'c3035b46-3c0d-4eac-b0a7-dd0d3158e81b';
delete from public.registrations
 where id = 'c3035b46-3c0d-4eac-b0a7-dd0d3158e81b'
   and player_id = '70996ca7-1e75-4181-a43b-b632f37e708d';
delete from public.players
 where id = '70996ca7-1e75-4181-a43b-b632f37e708d';

-- 2. Ferdinand Alcaraz 19.2
insert into public.handicap_records (club_id, player_id, handicap_index, effective_date, source)
values ('6fa99409-3515-4253-88a1-5dad321ef573', '6f472374-4347-4f8c-b6cf-e9dc3c430e4a',
        19.2, date '2026-11-15', 'manual')
on conflict (player_id, effective_date)
do update set handicap_index = 19.2, source = 'manual';

insert into public.audit_log (club_id, action, entity, entity_id, changed_columns, detail)
select '6fa99409-3515-4253-88a1-5dad321ef573', 'update', 'handicap_records', hr.id::text,
       array['handicap_index'],
       jsonb_build_object('oldIndex', 0, 'newIndex', 19.2, 'effectiveDate', '2026-11-15',
                          'reason', 'Owner correction in session, 15 Nov 2026')
from public.handicap_records hr
where hr.player_id = '6f472374-4347-4f8c-b6cf-e9dc3c430e4a' and hr.effective_date = date '2026-11-15';

commit;

-- Verify (expect 0 rows, then 19.2 / White):
select count(*) as vic_left from public.players where id = '70996ca7-1e75-4181-a43b-b632f37e708d';
select r.frozen_index, t.name as tee
  from public.registrations r left join public.tees t on t.id = r.tee_id
 where r.player_id = '6f472374-4347-4f8c-b6cf-e9dc3c430e4a';
