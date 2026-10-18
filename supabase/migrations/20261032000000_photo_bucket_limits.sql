-- Bound what the photo bucket will accept.
--
-- 20261017000000 created `player-photos` correctly: private (`public = false`) and reachable only by
-- a member of the club that owns the folder. What it did not set is any limit on what may be put in
-- it, so the bucket takes a file of any size and any type.
--
-- The app shrinks a photo to 900px JPEG on the client before it goes anywhere, so in practice a
-- stored photo is a few hundred kilobytes. Nothing enforces that at the bucket, which is the layer
-- that has to hold when a client is wrong, hostile or simply old.
--
-- Verified against the live project before this: `public = false`, anon cannot list the bucket, read
-- an object path or use the public route. The app has no upload path yet, so nothing is exposed
-- today; this closes the gap before something starts writing to it.
--
-- 5 MiB rather than the few hundred kilobytes the client produces, because the limit should catch a
-- mistake, not a legitimate photo from a phone the desk did not shrink.
--
-- Safe to re-run: it sets two fields to fixed values.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'player-photos';

-- Prove it, in this transaction.
do $$
declare
  lim bigint;
  mimes text[];
begin
  select file_size_limit, allowed_mime_types into lim, mimes
  from storage.buckets where id = 'player-photos';

  if lim is null then
    raise exception 'player-photos still has no file size limit';
  end if;
  if mimes is null or array_length(mimes, 1) is null then
    raise exception 'player-photos still accepts any mime type';
  end if;

  raise notice 'Verified: player-photos caps uploads at % bytes, types %', lim, mimes;
end $$;
