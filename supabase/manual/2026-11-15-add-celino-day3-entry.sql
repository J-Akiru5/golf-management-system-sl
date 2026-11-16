-- Run once in the Supabase SQL editor (live project). Data fix, not a migration.
--
-- Why: Alan Celino has a registration but no round entry on any day, so he is not in the Player list
-- on /scores and his Day 3 card cannot be typed in. The rounds were opened before he was added.
-- This gives him the entry on Day 3 only, the same row "Open the round" writes for everyone else.
--
-- Not done here: the handicap snapshot. The card in the other tool shows index 7.1 on the White
-- tee, but his registration says the Blue tee. Confirm the tee on the Registration desk first; the
-- gross score is unaffected and the card can be entered now.

insert into public.round_entries (club_id, round_id, registration_id, flight_id)
select r.club_id, cr.id, r.id, r.flight_id
  from public.registrations r
  join public.competition_rounds cr
    on cr.tournament_id = r.tournament_id and cr.day_number = 3
 where r.id = 'ac15defb-cd3b-40ed-b3f6-e32e404816c3'
on conflict (round_id, registration_id) do nothing;

-- Expect: INSERT 0 1
--
-- Then on /scores (Day 3), Enter a card:
--   Player: CELINO, ALAN     Marked by: the player who kept his card (MALAGA, ARNEL is his
--   team partner on the sheet; use whoever signed it)
--   Scores, holes 1 to 18: 5 5 5 5 4 4 5 5 5 | 4 4 4 3 6 6 4 4 5   (OUT 43, IN 40, total 83)
