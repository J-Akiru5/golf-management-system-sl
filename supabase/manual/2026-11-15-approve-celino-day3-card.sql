-- Run once in the Supabase SQL editor (live project), AFTER the submit script has run.
--
-- Approves Alan Celino's Day 3 card through the normal approve_scorecard function, acting as the club
-- owner (you), on your instruction in session on 15 Nov 2026. The function still checks that the
-- card is submitted, that all 18 holes are filled and that the written total (83) matches. The audit
-- row names the owner and carries the reason below.
--
-- Verification is 'provisional', not 'verified': Day 3 has no required-cards setting, and the
-- database only accepts provisional holes for a round like that (error 23514 "Hole 1 does not meet
-- the verification requirement" otherwise). The app approves Day 2 and Day 3 cards the same way.
--
-- After it runs, his card shows on the public profile and in the results.

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id from public.club_members where role = 'owner' order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.approve_scorecard(
  (select s.id
     from public.scorecards s
     join public.competition_rounds cr on cr.id = s.round_id and cr.day_number = 3
    where s.player_id = 'c0f6b202-9ea5-4759-af76-d4bcda6af833'
      and s.status = 'submitted'
    order by s.revision desc
    limit 1),
  (select jsonb_agg(
            jsonb_build_object(
              'hole', t.h, 'strokes', t.s, 'verification', 'provisional', 'provenance', 'single_card')
            order by t.h)
     from unnest(array[5,5,5,5,4,4,5,5,5, 4,4,4,3,6,6,4,4,5]) with ordinality as t(s, h)),
  'Owner approved from the paper card in session, 15 Nov 2026'
);

commit;

-- Expect: one empty row (the function returns void). Re-running after success errors with
-- "Only a submitted card can be approved", which is harmless.
