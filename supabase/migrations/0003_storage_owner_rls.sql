-- 0001's "authed rw app buckets" policy checked only bucket_id, so ANY
-- authenticated user could read and write every object in the private scans
-- and card-images buckets, defeating the isolation the schema promises.
-- Every object path already starts with the owner's user id
-- (userId/slug.jpg, userId/imports/slug.pdf, userId/cardId.jpg), so scope
-- storage access to the caller's own top-level folder.

drop policy if exists "authed rw app buckets" on storage.objects;

create policy "own folder in app buckets" on storage.objects
  for all to authenticated
  using (
    bucket_id in ('scans', 'card-images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('scans', 'card-images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
