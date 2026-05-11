-- Fix posts_media_type_check: add gif, youtube, instagram
-- Previously the constraint only allowed 'image', 'video', 'link', 'text',
-- but the app also sends 'gif', 'youtube', 'instagram' from detectMediaType().
ALTER TABLE public.posts DROP CONSTRAINT posts_media_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_media_type_check
  CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text, 'youtube'::text, 'instagram'::text, 'link'::text, 'text'::text]));
