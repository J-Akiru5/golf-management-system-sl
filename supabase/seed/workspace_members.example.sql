-- TeeLine Workspace: first members. NOT a migration and never run automatically.
--
-- The project owner runs this in the Supabase SQL editor after the four workspace migrations are
-- applied. The SQL editor has no JWT, so the member guard lets the first owner be created here.
-- After that, the owner adds and re-roles people from the workspace Settings page.
--
-- 1. Each person needs an account first (Authentication > Users). Use their own work email.
-- 2. Replace every <...> below with that account's email. Delete the rows you do not want yet.
-- 3. Run once. A row whose email matches no account inserts nothing, so check the count it prints.
--
-- Owner roster agreed on 20 Nov 2026: Jeff owner; Ma'am Mary Ann and Sir Zeno partners;
-- Karl and Lou members.

insert into public.workspace_members (user_id, role, display_name)
select u.id, v.role, v.display_name
from (values
  ('<jeff email>',       'owner',   'Jeff Martinez'),
  ('<mary ann email>',   'partner', 'Mary Ann'),
  ('<zeno email>',       'partner', 'Zeno'),
  ('<karl email>',       'member',  'Karl Fundal Calimotan'),
  ('<lou email>',        'member',  'Lou Vincent J. Baroro')
) as v (email, role, display_name)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (user_id) do nothing;

select role, display_name, status from public.workspace_members order by created_at;
