-- =============================================================================
-- Phase 3 — storage bucket INSERT policies (PASTE-READY, NOT YET APPLIED)
-- =============================================================================
--
-- Live audit (May 2026) showed the existing INSERT policies for `images`,
-- `videos`, `headers`, `stories` only require `auth.uid() IS NOT NULL` or
-- `auth.role() = 'authenticated'`. They do NOT enforce that the upload path
-- starts with the uploader's own user id. A malicious authenticated user can
-- therefore overwrite another user's media (e.g. headers/{victim}/header.png).
--
-- The DELETE policies already enforce the path-prefix check.
-- The app's `media.service.js` already produces paths shaped `${userId}/...`,
-- so tightening the INSERT policies is purely a server-side change with no
-- client work required.
--
-- This file is paste-ready and idempotent.
-- =============================================================================

-- images ---------------------------------------------------------------------
drop policy if exists "Eingeloggte User können Images hochladen" on storage.objects;
drop policy if exists images_upload_own_folder on storage.objects;

create policy images_upload_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- videos ---------------------------------------------------------------------
drop policy if exists "Eingeloggte User können Videos hochladen" on storage.objects;
drop policy if exists videos_upload_own_folder on storage.objects;

create policy videos_upload_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- headers --------------------------------------------------------------------
drop policy if exists headers_upload on storage.objects;
drop policy if exists headers_upload_own_folder on storage.objects;

create policy headers_upload_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'headers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- stories --------------------------------------------------------------------
drop policy if exists "Stories hochladen" on storage.objects;
drop policy if exists stories_upload_own_folder on storage.objects;

create policy stories_upload_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Optional cleanup -----------------------------------------------------------
-- The `moodboard` and `covers` buckets are leftovers from before this app's
-- refactor. If `media.service.js` does not reference them (it doesn't as of
-- this commit), the anon-permissive policies on `moodboard` should be
-- dropped to avoid drive-by uploads from random visitors.
--
--   drop policy if exists "anon upload moodboard"  on storage.objects;
--   drop policy if exists "public insert moodboard" on storage.objects;
--   drop policy if exists "anon delete moodboard"  on storage.objects;
--   drop policy if exists "public delete moodboard" on storage.objects;
--   drop policy if exists "public update moodboard" on storage.objects;
--
-- Verify that nothing else (e.g. another deployed app sharing this Supabase
-- project) writes to `moodboard` before dropping these.
