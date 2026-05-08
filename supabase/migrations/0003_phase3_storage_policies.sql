-- =============================================================================
-- Phase 3 — Storage Bucket RLS Policies
-- =============================================================================
--
-- PRECONDITIONS:
--   0002_phase3_strict_policies.sql applied.
--   The following buckets must exist in Supabase Storage before running:
--     images, videos, headers, stories
--   Verify in Dashboard → Storage → Buckets before applying.
--
-- DESIGN RATIONALE:
--   Read is public for all buckets. The *post/story row* visibility (RLS in
--   0002) controls who gets to see the URL in the first place. This matches
--   the Instagram / Twitter model: the media URL is world-readable, but you
--   can only obtain it through a row your RLS allows you to SELECT.
--
--   Write is restricted to authenticated users whose upload path starts with
--   their own auth.uid(). This prevents one user from writing into another
--   user's folder.
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor and run.
--
-- ROLLBACK:
--   DROP POLICY "<name>" ON storage.objects;
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- images bucket
-- ─────────────────────────────────────────────────────────────────────────────

create policy "images public read" on storage.objects
  for select using (bucket_id = 'images');

create policy "images upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "images delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- videos bucket
-- ─────────────────────────────────────────────────────────────────────────────

create policy "videos public read" on storage.objects
  for select using (bucket_id = 'videos');

create policy "videos upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "videos delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- headers bucket
-- ─────────────────────────────────────────────────────────────────────────────

create policy "headers public read" on storage.objects
  for select using (bucket_id = 'headers');

create policy "headers upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'headers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "headers delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'headers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- stories bucket
-- ─────────────────────────────────────────────────────────────────────────────

create policy "stories public read" on storage.objects
  for select using (bucket_id = 'stories');

create policy "stories upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "stories delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: moodboard bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- If a legacy "moodboard" bucket exists with overly permissive policies,
-- review and drop them:
--
--   select policyname from pg_policies
--   where tablename = 'objects' and schemaname = 'storage';
--
-- Then: DROP POLICY "<permissive policy name>" ON storage.objects;
