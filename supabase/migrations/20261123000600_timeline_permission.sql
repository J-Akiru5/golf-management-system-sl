-- The Timeline page (#351) in the workspace permission matrix.
--
-- 20261123000200_workspace_permissions.sql is already applied on the live project and seeded eight
-- pages. The Timeline page came after it, so its role defaults are added here rather than by editing
-- an applied migration: owner and partner edit, member view, matching ROLE_DEFAULTS in
-- apps/ops/src/lib/access/pages.ts. Additive and idempotent: an existing row is left as the owner set it.

insert into public.ws_role_permissions (role, page, level) values
  ('owner', 'timeline', 'edit'),
  ('partner', 'timeline', 'edit'),
  ('member', 'timeline', 'view')
on conflict (role, page) do nothing;

do $$
begin
  if (select count(*) from public.ws_role_permissions where page = 'timeline') <> 3 then
    raise exception 'the timeline page is missing from the role matrix';
  end if;
  if (select level from public.ws_role_permissions where role = 'owner' and page = 'timeline') <> 'edit' then
    raise exception 'the owner must have edit on the timeline page';
  end if;
end $$;
