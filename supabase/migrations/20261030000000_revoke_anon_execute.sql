-- Close the anon grants on the staff-only functions.
--
-- Every migration that creates one of these follows the same pattern:
--
--   revoke all on function public.save_draw(uuid, integer, jsonb, jsonb) from public;
--   grant execute on function public.save_draw(uuid, integer, jsonb, jsonb) to authenticated;
--
-- which reads as though it locks the function down. It does not. In Postgres, `public` is the PUBLIC
-- pseudo-role, so `revoke ... from public` removes the default grant that every role inherits. But
-- Supabase separately grants EXECUTE to the `anon` role by default, and that grant is made to the
-- role by name. Revoking from PUBLIC does not touch it. So `anon` kept the right to run all of them.
--
-- A comment in 20261019000000_staff_auth_audit.sql claims the same thing about these lines, and
-- docs/PLAN.md carries a follow-up saying they are worth re-checking. This is that check, and it
-- found them still open. Calling save_draw with the anon key and no session returns its own
-- "Tournament not found" from inside the body, which is proof the body ran as anon.
--
-- Nothing was exploitable: each function opens by resolving the event and then requires an owner or
-- organizer through has_club_role, and auth.uid() is null for anon, so every one of them refused.
-- But "refused inside the body" is a weaker posture than "cannot be called": every anonymous visitor
-- could make the database resolve an event and check a role, which is work an unauthenticated
-- request should not be able to ask for, and one mistake in one role test is a live hole.
--
-- What stays public is what is meant to be public: public_pairings, public_registration_form and
-- submit_registration are reachable by anon on purpose, because the pairings page and the entry form
-- work signed out. They are not touched here.
--
-- Safe to re-run: revoke is a no-op when the grant is already gone.
--
-- One thing this does not fix: Supabase's default privileges grant EXECUTE on new functions in
-- `public` to anon, so a future `create or replace function` re-opens it. Either repeat the revoke in
-- that migration or change the default privileges, which is the owner's call.

-- Staff writes. These are called only from the signed-in desk.
revoke all on function public.save_draw(uuid, integer, jsonb, jsonb) from public, anon;
revoke all on function public.publish_pairings(uuid, integer, jsonb, text, text) from public, anon;
revoke all on function public.unpublish_pairings(uuid) from public, anon;
revoke all on function public.save_event_setup(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.sync_notifications(uuid) from public, anon;
revoke all on function public.mark_notifications_read(uuid) from public, anon;

-- Helpers the policies and the screens use while signed in.
revoke all on function public.has_club_role(uuid, text[]) from public, anon;
revoke all on function public.is_club_member(uuid) from public, anon;

-- The player area: a player has to be signed in for any of it to mean anything.
revoke all on function public.current_player_id() from public, anon;
revoke all on function public.claim_player_record(text, text) from public, anon;
revoke all on function public.player_portal_entries() from public, anon;

-- And re-state the grants these roles are supposed to have, so the intent is readable in one place
-- rather than inferred from four earlier migrations.
grant execute on function public.save_draw(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.publish_pairings(uuid, integer, jsonb, text, text) to authenticated;
grant execute on function public.unpublish_pairings(uuid) to authenticated;
grant execute on function public.save_event_setup(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.sync_notifications(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.has_club_role(uuid, text[]) to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.current_player_id() to authenticated;
grant execute on function public.claim_player_record(text, text) to authenticated;
grant execute on function public.player_portal_entries() to authenticated;
