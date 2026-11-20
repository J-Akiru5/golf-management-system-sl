-- TeeLine Workspace: the eleven "Next steps" from the 17 Nov 2026 team meeting, unassigned.
-- NOT a migration and never run automatically.
--
-- Run in the Supabase SQL editor after the workspace migrations are applied AND the first owner exists
-- (see workspace_members.example.sql). The tasks are left unassigned on purpose: the owner assigns them
-- from the workspace Tasks page. They are attributed to the first active owner.
--
-- Safe to run twice: a task with the same title is not inserted again.

with owner_row as (
  select user_id
  from public.workspace_members
  where role = 'owner' and status = 'active'
  order by created_at
  limit 1
),
seed (title, description, priority) as (
  values
    ('Streamline scoring', 'Optimise the scoring mechanism for the December tournament.', 'high'),
    ('Develop registration', 'Create a registration page for event participants that collects all required information.', 'high'),
    ('Implement live updates', 'Integrate the live update code into the platform so handicap and scorecard changes appear in real time. The minutes name Karl Fundal Calimotan for this one.', 'high'),
    ('Review team roles', 'Download and review the technical team roles and job description documents.', 'normal'),
    ('Define roles', 'Establish specific titles, positions and scopes of responsibility for team development.', 'normal'),
    ('Create org chart', 'Draft an organisational chart for public use.', 'normal'),
    ('Assign event personnel', 'Designate one dedicated person to manage each event site.', 'normal'),
    ('Build landing page', 'Develop a landing page for tournament trade events.', 'normal'),
    ('Organise events', 'Add an events section to the system to keep tournament data separate.', 'normal'),
    ('Manage scoring privacy', 'Configure privacy settings for historical tournament scores.', 'normal'),
    ('Implement private links', 'Create private access links for tournament player cards.', 'normal')
)
insert into public.ws_tasks (title, description, priority, created_by, position)
select s.title, s.description, s.priority, o.user_id,
       row_number() over () * 1000
from seed s
cross join owner_row o
where not exists (select 1 from public.ws_tasks t where t.title = s.title);

select count(*) as tasks_in_workspace from public.ws_tasks;
