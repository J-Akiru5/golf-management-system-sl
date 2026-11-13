-- Per-tee hole rows.
--
-- `holes` is keyed by course, so it can hold only one HANDICAP row for every tee. The printed
-- IGCC cards carry a separate par and stroke-index row per tee (Blue, White, Ladies). This table
-- is the place for those rows. A tee with no row here keeps the course row, so existing events
-- and courses are unchanged until a row is loaded.
--
-- The scoring functions will read `coalesce(tee_holes.par, holes.par)` and
-- `coalesce(tee_holes.stroke_index, holes.stroke_index)` in a later change. This migration only
-- creates the table; it does not change scoring by itself.

create table if not exists public.tee_holes (
  club_id uuid not null,
  tee_id uuid not null,
  number smallint not null check (number > 0),
  par smallint not null check (par between 3 and 6),
  stroke_index smallint not null check (stroke_index > 0),
  primary key (tee_id, number),
  unique (tee_id, stroke_index),
  foreign key (tee_id, club_id) references public.tees (id, club_id) on delete cascade
);

comment on table public.tee_holes is
  'Par and stroke index per tee. A missing row falls back to public.holes for the course.';

alter table public.tee_holes enable row level security;

create policy tee_holes_member_read on public.tee_holes
  for select to authenticated using (public.is_club_member(club_id));

create policy tee_holes_manager_write on public.tee_holes
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

grant select on public.tee_holes to authenticated;
grant insert, update, delete on public.tee_holes to authenticated;

-- Example shape, not executed. Load the printed row for one tee at a time:
--
-- insert into public.tee_holes (club_id, tee_id, number, par, stroke_index)
-- select '<club uuid>', '<tee uuid>', v.number, v.par, v.stroke_index
-- from (values
--   (1, 4, 5), (2, 4, 3), (3, 4, 7)
--   -- ... one row per hole
-- ) as v(number, par, stroke_index);
