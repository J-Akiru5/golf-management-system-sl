-- Public player photos: an unguessable per-player object name instead of the player id.
--
-- STATUS: not applied. The owner runs it in the SQL editor.
--
-- REVISED 14 Nov 2026: the first version deleted rows from storage.objects in SQL. Supabase now
-- refuses that ("Direct deletion from storage tables is not allowed", storage.protect_delete), so
-- the run failed and rolled back. This version never touches storage.objects. Files are removed
-- through the Storage API only: the app already does that on every withdrawal and replacement
-- (src/lib/data/supabase/adapters.ts), and an old file left behind is unreachable once its path is
-- cleared, because the public pages only build URLs from the stored path.
--
-- THE BYPASS
-- 20261039000000 made `player-photos-public` a public bucket and named the object
-- `{club_id}/{player_id}.jpg`. The public roster and the pairings snapshot publish player ids, so
-- anyone holding one (or reading the roster) could build the public URL and fetch that player's
-- photo, whether or not `photo_public_consent_at` was set. The blanket anon SELECT policy on the
-- bucket did not help: a public bucket is served without consulting RLS. Withdrawing consent
-- removed the row's path but only the app deleted the object, so a withdrawal made any other way
-- left the file readable.
--
-- THE FIX
-- Each player row gets a random `photo_public_token`. The public object is named
-- `{club_id}/{photo_public_token}.jpg`, and a CHECK constraint ties the stored path to that token.
-- The token is only ever returned by `public_player_photos` and the pairings functions after the
-- public consent and the event's `photos` release are both on, so the object name is not derivable
-- from public data. The bucket stays public so the public pages keep their plain URLs; the private
-- original and its path are untouched.
--
-- A trigger clears the stored public path whenever public consent is withdrawn or the player is
-- retired, so no public page can point at the file even when the caller forgets to clear it. The
-- file itself is removed by the app through the Storage API.
--
-- EXISTING OBJECTS
-- The migration cannot copy or delete bytes: the storage API, not SQL, owns the file. Existing
-- public objects are the old, guessable `{club_id}/{player_id}.jpg` files, so their stored paths
-- are cleared here. Remove the old files in the Storage screen (bucket `player-photos-public`)
-- or with the Storage API; on 14 Nov 2026 there was one, and no player pointed at it. The private
-- originals stay in `player-photos`. Staff must re-publish
-- each consented public photo from the player page (toggle public display off and on, or save the
-- photo again); the new object is written under the new token. Until then the public page simply
-- shows the initials fallback, which is the same behaviour as a player with no public photo.

-- 1. The token -----------------------------------------------------------------------------------

alter table public.players
  add column if not exists photo_public_token uuid not null default gen_random_uuid();

comment on column public.players.photo_public_token is
  'Random public object name. The public bucket path is {club_id}/{token}.jpg. Never the player id.';

create unique index if not exists players_public_photo_token
  on public.players (photo_public_token);

-- 2. Stop the blanket anon read on the bucket ----------------------------------------------------
-- A public bucket is served without RLS, so this policy never protected anything. It would grant
-- anon read of the whole bucket if the bucket were flipped private later. Staff writes stay.

drop policy if exists player_photos_public_read on storage.objects;

-- 3. Clear the old guessable paths -----------------------------------------------------------------
-- A path that already matches the token shape is kept, so a re-run is safe. The old files are not
-- deleted here (see EXISTING OBJECTS above).

update public.players
   set photo_public_path = null
 where photo_public_path is not null
   and (
     photo_public_consent_at is null
     or photo_public_path <> club_id::text || '/' || photo_public_token::text || '.jpg'
   );

-- 4. The path is the token, and it cannot exist without public consent ----------------------------

alter table public.players
  drop constraint if exists players_public_photo_path_scope;

alter table public.players
  add constraint players_public_photo_path_scope
  check (
    photo_public_path is null
    or (
      photo_public_consent_at is not null
      and photo_public_path = club_id::text || '/' || photo_public_token::text || '.jpg'
    )
  );

-- 5. Withdrawal and retirement clear the public path ----------------------------------------------
-- Anything that ends public display clears the path, even when the caller only cleared the consent
-- timestamp and left the path behind. The app removes the file through the Storage API.

create or replace function public.clear_public_photo_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null or new.photo_public_consent_at is null then
    new.photo_public_path := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_public_photo_path() from public;

drop trigger if exists players_public_photo_path on public.players;
create trigger players_public_photo_path
  before update of photo_public_path, photo_public_consent_at, deleted_at
  on public.players
  for each row execute function public.clear_public_photo_path();

-- 6. Self-check -----------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players'
       and column_name = 'photo_public_token'
  ) then
    raise exception 'players.photo_public_token was not added';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'players_public_photo_path_scope'
       and conrelid = 'public.players'::regclass
  ) then
    raise exception 'players_public_photo_path_scope was not recreated';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and policyname = 'player_photos_public_read'
  ) then
    raise exception 'the blanket anon read policy on player-photos-public still exists';
  end if;

  if to_regprocedure('public.clear_public_photo_path()') is null then
    raise exception 'clear_public_photo_path was not created';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'players_public_photo_path') then
    raise exception 'the public photo trigger was not created';
  end if;

  -- No stored public path may still be derived from a player id.
  if exists (
    select 1 from public.players p
     where p.photo_public_path is not null
       and p.photo_public_path <> p.club_id::text || '/' || p.photo_public_token::text || '.jpg'
  ) then
    raise exception 'a public photo path still uses a value other than the player token';
  end if;
end $$;
