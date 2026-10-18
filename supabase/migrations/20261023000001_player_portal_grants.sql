-- Least privilege for the player portal functions.
--
-- Supabase grants EXECUTE on new functions in `public` to `anon` and `authenticated` by default, so
-- the `revoke ... from public` in the portal migration is not enough on its own. The functions are
-- already safe for a caller with no session (they answer null or "signed_out"), but an account-less
-- request should not reach them at all.
--
-- ADDITIVE: three revokes, no schema change.

revoke execute on function public.current_player_id() from anon;
revoke execute on function public.claim_player_record(text, text) from anon;
revoke execute on function public.player_portal_entries() from anon;
