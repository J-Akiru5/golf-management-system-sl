-- Run once in the Supabase SQL editor (live project). Data entry, not a migration.
--
-- Submits Alan Celino's Day 3 card (83 strokes: OUT 43, IN 40) through the normal submit_scorecard
-- function, acting as the club owner so the audit row names the owner. Nothing is skipped: the
-- function still checks the round, the hole values and the marker.
--
-- Marker: MALAGA, ARNEL, his partner on the sheet. Celino has no assigned marker, so any player is
-- accepted. If someone else signed his card, change the uuid on the marker line.
--
-- After it runs, approve the card on /scores (his row, "Approve"). Approval needs the canonical hole
-- scores that the screen computes, so it is not done here.

begin;

-- The marker must also be active in the Day 3 round (error 23503 otherwise). Malaga, Arnel was
-- added after the round opened, like Celino, so give him the same Day 3 entry. Safe to repeat.
insert into public.round_entries (club_id, round_id, registration_id, flight_id)
select r.club_id, cr.id, r.id, r.flight_id
  from public.registrations r
  join public.competition_rounds cr
    on cr.tournament_id = r.tournament_id and cr.day_number = 3
 where r.id = '4a6719c5-07c4-4d69-9773-bf72fff73452'
on conflict (round_id, registration_id) do nothing;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id from public.club_members where role = 'owner' order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.submit_scorecard(
  (select re.id
     from public.round_entries re
     join public.competition_rounds cr on cr.id = re.round_id and cr.day_number = 3
    where re.registration_id = 'ac15defb-cd3b-40ed-b3f6-e32e404816c3'),
  '0d76071a-35a4-4439-b7e1-2c890062c90a',          -- marker: MALAGA, ARNEL
  'manual',
  'celino-alan-day3-paper-card-1',
  (select jsonb_agg(
            jsonb_build_object('hole', t.h, 'strokes', t.s, 'confidence', 1, 'manually_confirmed', true)
            order by t.h)
     from unnest(array[5,5,5,5,4,4,5,5,5, 4,4,4,3,6,6,4,4,5]) with ordinality as t(s, h)),
  83::smallint
);

commit;

-- Expect one uuid back (the card id). Re-running is safe: the same capture key returns the same card.
