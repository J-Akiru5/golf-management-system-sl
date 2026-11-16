-- Run once in the Supabase SQL editor (live project). Data fix, not a migration.
--
-- Why: "Open the round" stops at the first registration that has a handicap index but no tee
-- (open_round_incomplete_registration). Eleven Day 1 players added from the organizer's sheet are in
-- that state: Jan Jason Diaz, Querubin Toti, Rod Kenneth Delfin, Ernesto Bautista, Jessie Jamelo,
-- Kim In Sil, Min Hyanggee, Tobes Jerome, Palic Chrysler Anne, Dacles Janiree, Arriane Camot.
--
-- What it does: gives them the Blue tee, which is the tee on 276 of the 277 other registrations.
-- That is the event default, not a check of each player. If any of them play another tee (the
-- Red tee for ladies, for example), change it on the Registration desk afterwards. Blue is
-- applied only where the tee is still empty.
--
-- Note: Arriane Camot, Ernesto Bautista and Jessie Jamelo carry an index of 0, which is a
-- placeholder from the import, not a real scratch handicap. Fix their index on the desk before net
-- scores are read; gross scores are not affected.

update public.registrations r
   set tee_id = (select t.id from public.tees t where t.name = 'Blue' limit 1)
 where r.tee_id is null
   and r.frozen_index is not null
   and r.tournament_id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb';

-- Expect: UPDATE 11
