-- Run once in the Supabase SQL editor (live project). Not a migration: it is data.
--
-- Why: a round cannot be opened without a confirmed tie-break policy, and the organizer's written
-- rule has not been recorded. This adds a clearly labelled PLACEHOLDER so Day 1 scoring can start.
-- It does not invent a rule. Replace the procedure and the source with the real rule before any
-- round is finalised (update this same row, do not add a second one).

insert into public.tie_break_policies
  (club_id, name, version, procedure, written_source, confirmed_by, confirmed_at)
select
  m.club_id,
  'Provisional (set before finalising)',
  '1',
  'PLACEHOLDER so scoring could start on 12 Nov 2026. The organizer''s written tie-break rule has not been recorded. Replace this text with that rule before any round is finalised.',
  'Owner instruction in session, 12 Nov 2026: open the round now; the rule is still to be supplied',
  m.user_id,
  now()
from public.club_members m
where m.role = 'owner'
order by m.created_at
limit 1;

-- Then on the desk /scores page, Round setup:
--   Required cards per player: 1
--   Final approval authority: Organizer (owner and organizer can both finalise)
--   Tie-break policy: Provisional (set before finalising)
-- and press "Open the round".
--
-- Later, to put the real rule in:
--   update public.tie_break_policies
--      set procedure = '<the rule>', written_source = '<where it is written>'
--    where name = 'Provisional (set before finalising)';
