-- A class is cut over the whole field, so the per-category range guard no longer matches the model.
--
-- `flights_category_id_numrange_excl` refused two rows whose ranges touched inside one category.
-- Classes are now one field-wide set that the desk saves in a single pass, and the guard fired on
-- the intermediate states of a correct save: the new class rows were inserted before the old
-- per-category rows were removed, so the insert collided with a row it was about to replace. The
-- save failed with 23P01 on `flights_category_id_numrange_excl`.
--
-- Dropping it changes no row. The single set is checked in the app before it is saved: Settings
-- reports overlapping classes and any handicap band no class covers, and the router sends a player
-- with an ambiguous or missing band to review instead of guessing.
--
-- The cleaner shape (a tournament-level class row with its own tournament-scoped range guard) needs
-- the flights table to carry a tournament id and the saved rows to be one set; that is a separate
-- change, not something to smuggle into this one.

alter table public.flights
  drop constraint if exists flights_category_id_numrange_excl;
