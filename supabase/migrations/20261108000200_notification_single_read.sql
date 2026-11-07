-- Mark one alert as read by the caller.
--
-- "Mark all as read" clears every outstanding alert for an event at once. The desk also needs to
-- dismiss a single alert, and doing that through the plural function would clear alerts the member
-- has not seen yet. This adds one function beside the plural one; the tables, the policies and
-- `mark_notifications_read` are unchanged.

create or replace function public.mark_notification_read(p_notification uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  n int;
begin
  select club_id into v_club from public.notifications where id = p_notification;
  if v_club is null then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;

  if not public.is_club_member(v_club) then
    raise exception 'Not a member of this club' using errcode = '42501';
  end if;

  insert into public.notification_reads (club_id, notification_id, user_id)
  values (v_club, p_notification, (select auth.uid()))
  on conflict (notification_id, user_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
