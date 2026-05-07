-- =============================================================================
-- Phase 3 — RLS / Schema / Permissions (DRAFT)
-- =============================================================================
--
-- THIS MIGRATION IS A PROPOSAL. Do NOT apply blindly.
-- Review every block against the live schema in the Supabase dashboard before
-- running. Several statements assume the live tables already exist with the
-- columns the frontend uses; the migration only ADDS constraints, indexes,
-- defaults and policies — it does not create the base tables.
--
-- Safe to apply in stages:
--   1. constraints + defaults + indexes (block 1) — non-breaking
--   2. enable RLS (block 2) — REQUIRES policies in place to avoid lockout
--   3. policies per table (block 3) — apply table-by-table
--
-- See docs/PHASE3_RLS_AUDIT.md for the rationale behind every policy.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1 — Schema hardening (constraints, defaults, indexes)
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles -------------------------------------------------------------------
alter table public.profiles
  alter column profile_privacy set default 'public';

alter table public.profiles
  add constraint profiles_privacy_check
  check (profile_privacy in ('public','followers','private')) not valid;

-- run after backfill / verification:
-- alter table public.profiles validate constraint profiles_privacy_check;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));


-- posts ----------------------------------------------------------------------
alter table public.posts
  alter column visibility set default 'public';

alter table public.posts
  add constraint posts_visibility_check
  check (visibility in ('public','followers','private')) not valid;

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc);

create index if not exists posts_user_visibility_idx
  on public.posts (user_id, visibility);


-- boards ---------------------------------------------------------------------
alter table public.boards
  alter column visibility set default 'public';

alter table public.boards
  add constraint boards_visibility_check
  check (visibility in ('public','followers','private')) not valid;

create index if not exists boards_user_position_idx
  on public.boards (user_id, position);


-- board_posts ----------------------------------------------------------------
create unique index if not exists board_posts_unique_idx
  on public.board_posts (board_id, post_id);

create index if not exists board_posts_board_position_idx
  on public.board_posts (board_id, position);


-- reposts --------------------------------------------------------------------
alter table public.reposts
  alter column show_on_profile set default true;

-- only run once you are sure no NULLs remain:
-- update public.reposts set show_on_profile = true where show_on_profile is null;
-- alter table public.reposts alter column show_on_profile set not null;

create unique index if not exists reposts_unique_idx
  on public.reposts (post_id, user_id);

create index if not exists reposts_user_profile_idx
  on public.reposts (user_id, show_on_profile, created_at desc);


-- likes ----------------------------------------------------------------------
create unique index if not exists likes_unique_idx
  on public.likes (post_id, user_id);

create index if not exists likes_post_idx
  on public.likes (post_id);


-- comments -------------------------------------------------------------------
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at);


-- stories --------------------------------------------------------------------
alter table public.stories
  alter column expires_at set default now() + interval '24 hours';

create index if not exists stories_user_expires_idx
  on public.stories (user_id, expires_at);


-- story_views ----------------------------------------------------------------
create unique index if not exists story_views_unique_idx
  on public.story_views (story_id, user_id);

create index if not exists story_views_story_idx
  on public.story_views (story_id);


-- friendships ----------------------------------------------------------------
-- Phase-6 decision: social graph is "follows + follow requests for private
-- profiles". `status='accepted'` = active follow, `status='pending'` =
-- outstanding request that must be accepted by the owner of a private profile.
-- The default below stays 'accepted' so public/followers profiles auto-follow;
-- the *server-side rule* that forces `status='pending'` for inserts targeting
-- private profiles is INTENTIONALLY NOT IN THIS MIGRATION — it belongs in a
-- BEFORE INSERT trigger or Edge Function (see docs/PHASE3_RLS_AUDIT.md §E.2
-- and the Phase-6 follow-ups in docs/ROADMAP.md). Until that rule lands,
-- "private profile + follow request" is enforced only by frontend UX.
alter table public.friendships
  alter column status set default 'accepted';

alter table public.friendships
  add constraint friendships_status_check
  check (status in ('accepted','pending')) not valid;

create unique index if not exists friendships_unique_idx
  on public.friendships (user_id, friend_id);

create index if not exists friendships_user_status_idx
  on public.friendships (user_id, friend_id, status);

create index if not exists friendships_friend_status_idx
  on public.friendships (friend_id, user_id, status);


-- blocks ---------------------------------------------------------------------
create unique index if not exists blocks_unique_idx
  on public.blocks (blocker_id, blocked_id);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);


-- notifications --------------------------------------------------------------
alter table public.notifications
  alter column read set default false;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('like','comment','repost','follow')) not valid;

create index if not exists notifications_user_idx
  on public.notifications (user_id, read, created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 2 — Helper functions for visibility predicates
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Inlining the same predicate into every policy is hard to read and harder to
-- change. These SECURITY DEFINER functions centralize the logic.

-- Is the current auth user following `target_user`? --------------------------
create or replace function public.is_following(target_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid()
      and friend_id = target_user
      and status = 'accepted'
  );
$$;

-- Is there a block in either direction between auth user and `other`? --------
create or replace function public.is_blocked_either_way(other uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other        and blocked_id = auth.uid())
  );
$$;

-- Can the current auth user see this post? -----------------------------------
-- Implements: public OR own OR (followers AND following) AND not blocked.
create or replace function public.can_view_post(post_owner uuid, post_visibility text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    not public.is_blocked_either_way(post_owner)
    and (
      post_visibility = 'public'
      or post_owner = auth.uid()
      or (post_visibility = 'followers' and public.is_following(post_owner))
    );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 3 — Enable RLS + policies
-- ─────────────────────────────────────────────────────────────────────────────
--
-- IMPORTANT: enabling RLS without policies blocks all access. Apply the
-- enable + policies for one table at a time.

-- profiles -------------------------------------------------------------------
alter table public.profiles enable row level security;

-- read: public profiles always; private/followers profiles only if eligible.
-- Block-aware. Anonymous can only see public profiles.
create policy profiles_select on public.profiles
for select using (
  not public.is_blocked_either_way(id)
  and (
    profile_privacy = 'public'
    or id = auth.uid()
    or (profile_privacy = 'followers' and public.is_following(id))
  )
);

-- update: only your own row.
create policy profiles_update on public.profiles
for update using (id = auth.uid())
         with check (id = auth.uid());

-- insert is normally handled by the auth trigger; if not, restrict it:
-- create policy profiles_insert on public.profiles
-- for insert with check (id = auth.uid());


-- posts ----------------------------------------------------------------------
alter table public.posts enable row level security;

create policy posts_select on public.posts
for select using (
  public.can_view_post(user_id, visibility)
);

create policy posts_insert on public.posts
for insert with check (user_id = auth.uid());

create policy posts_update on public.posts
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy posts_delete on public.posts
for delete using (user_id = auth.uid());


-- boards ---------------------------------------------------------------------
alter table public.boards enable row level security;

-- read: same visibility rules as posts, applied to the owner.
create policy boards_select on public.boards
for select using (
  public.can_view_post(user_id, visibility)
);

create policy boards_modify on public.boards
for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- board_posts ----------------------------------------------------------------
alter table public.board_posts enable row level security;

-- read: only if the board is visible AND the post is visible.
create policy board_posts_select on public.board_posts
for select using (
  exists (
    select 1 from public.boards b
    where b.id = board_posts.board_id
      and public.can_view_post(b.user_id, b.visibility)
  )
  and exists (
    select 1 from public.posts p
    where p.id = board_posts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

-- write: only the board owner, and only with a post they can see.
create policy board_posts_insert on public.board_posts
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.boards b
    where b.id = board_posts.board_id and b.user_id = auth.uid()
  )
  and exists (
    select 1 from public.posts p
    where p.id = board_posts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy board_posts_delete on public.board_posts
for delete using (user_id = auth.uid());


-- reposts --------------------------------------------------------------------
alter table public.reposts enable row level security;

create policy reposts_select on public.reposts
for select using (
  -- anyone who can see the post can see that it's been reposted
  exists (
    select 1 from public.posts p
    where p.id = reposts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy reposts_insert on public.reposts
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = reposts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy reposts_delete on public.reposts
for delete using (user_id = auth.uid());


-- likes ----------------------------------------------------------------------
alter table public.likes enable row level security;

create policy likes_select on public.likes
for select using (
  exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy likes_insert on public.likes
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy likes_delete on public.likes
for delete using (user_id = auth.uid());


-- comments -------------------------------------------------------------------
alter table public.comments enable row level security;

create policy comments_select on public.comments
for select using (
  exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy comments_insert on public.comments
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

create policy comments_delete on public.comments
for delete using (user_id = auth.uid());


-- stories --------------------------------------------------------------------
alter table public.stories enable row level security;

-- read: own stories OR (follower of owner) AND not blocked AND not expired.
-- Stories follow the profile's privacy because they are inherently "feed"
-- content, not a per-post visibility column.
create policy stories_select on public.stories
for select using (
  not public.is_blocked_either_way(user_id)
  and expires_at > now()
  and (
    user_id = auth.uid()
    or public.is_following(user_id)
    or exists (
      select 1 from public.profiles pr
      where pr.id = stories.user_id
        and pr.profile_privacy = 'public'
    )
  )
);

create policy stories_insert on public.stories
for insert with check (user_id = auth.uid());

create policy stories_delete on public.stories
for delete using (user_id = auth.uid());


-- story_views ----------------------------------------------------------------
alter table public.story_views enable row level security;

-- read: only the story owner sees the viewer list.
create policy story_views_select on public.story_views
for select using (
  exists (
    select 1 from public.stories s
    where s.id = story_views.story_id
      and s.user_id = auth.uid()
  )
);

-- insert: viewer must be auth user AND must be able to see the story.
create policy story_views_insert on public.story_views
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.stories s
    where s.id = story_views.story_id
      and s.expires_at > now()
      and not public.is_blocked_either_way(s.user_id)
      and (
        s.user_id = auth.uid()
        or public.is_following(s.user_id)
        or exists (select 1 from public.profiles pr where pr.id = s.user_id and pr.profile_privacy = 'public')
      )
  )
);


-- friendships ----------------------------------------------------------------
alter table public.friendships enable row level security;

-- read: either side may see the row (so follower/following counts work).
create policy friendships_select on public.friendships
for select using (
  user_id = auth.uid() or friend_id = auth.uid()
);

create policy friendships_insert on public.friendships
for insert with check (
  user_id = auth.uid()
  and not public.is_blocked_either_way(friend_id)
);

create policy friendships_delete on public.friendships
for delete using (user_id = auth.uid());


-- blocks ---------------------------------------------------------------------
alter table public.blocks enable row level security;

-- read: only your own block list (no one else needs to know who blocks whom).
create policy blocks_select on public.blocks
for select using (blocker_id = auth.uid());

create policy blocks_insert on public.blocks
for insert with check (blocker_id = auth.uid());

create policy blocks_delete on public.blocks
for delete using (blocker_id = auth.uid());


-- notifications --------------------------------------------------------------
alter table public.notifications enable row level security;

-- read: only your own.
create policy notifications_select on public.notifications
for select using (user_id = auth.uid());

-- mark-read: only your own.
create policy notifications_update on public.notifications
for update using (user_id = auth.uid())
         with check (user_id = auth.uid());

-- INSERT: short-term policy. from_user_id must be the actor, and a justifying
-- row must exist. This narrows the forge surface but does not eliminate it.
-- Long-term: drop this policy and create notifications only via Edge Function
-- using the service role key.
create policy notifications_insert on public.notifications
for insert with check (
  from_user_id = auth.uid()
  and (
    (type = 'follow' and exists (
      select 1 from public.friendships f
      where f.user_id = auth.uid() and f.friend_id = notifications.user_id
    ))
    or (type = 'like' and exists (
      select 1 from public.likes l
      where l.user_id = auth.uid() and l.post_id = notifications.post_id
    ))
    or (type = 'comment' and exists (
      select 1 from public.comments c
      where c.user_id = auth.uid() and c.post_id = notifications.post_id
    ))
    or (type = 'repost' and exists (
      select 1 from public.reposts r
      where r.user_id = auth.uid() and r.post_id = notifications.post_id
    ))
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 4 — Storage bucket policies (configure in dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- These cannot be expressed as a normal migration in this file because they
-- live in the `storage.objects` table and depend on bucket configuration.
-- Recommended pattern for each of: images, videos, headers, stories
--
--   -- write: authenticated user, path must start with their uid
--   create policy "<bucket> upload own folder" on storage.objects
--     for insert to authenticated
--     with check (
--       bucket_id = '<bucket>' and
--       (storage.foldername(name))[1] = auth.uid()::text
--     );
--
--   -- read: public (URLs are referenced from posts/stories rows).
--   create policy "<bucket> public read" on storage.objects
--     for select using (bucket_id = '<bucket>');
--
-- Visibility of the *post or story row* (RLS above) controls who sees the URL.
