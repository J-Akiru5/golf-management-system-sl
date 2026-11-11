-- The 24th Bamboo Tee's public advisory ------------------------------------------------------------
--
-- Run AFTER 20261112000100_public_advisory.sql. Sets the notice shown at the top of /pairings,
-- /roster and /leaderboard until the end of 15 November 2026 (Asia/Manila).
--
-- This is data, not schema. It touches exactly one event row and no other column.

update public.tournaments
   set public_advisory = jsonb_build_object(
     'show', true,
     'title', 'Important advisory: 24th Bamboo Tee',
     'lines', jsonb_build_array(
       'The tee-off time on Saturday and Sunday, 14-15 November 2026, is moved earlier to 6:00 AM.',
       'This is to accommodate the expected high traffic and to maximise playing time, given the earlier sunset during the BER months.',
       'Please arrive early and be ready for the scheduled tee-off. Thank you for your understanding and cooperation.'
     ),
     'signature', 'Organizing Committee, 24th Bamboo Tee Golf Tournament',
     'until', '2026-11-15'
   )
 where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb';

-- Expected: one row, show = true, until = 2026-11-15, three lines.
select id, public_advisory -> 'show' as show, public_advisory ->> 'until' as until,
       jsonb_array_length(public_advisory -> 'lines') as lines
  from public.tournaments
 where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb';
