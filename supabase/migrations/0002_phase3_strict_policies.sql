-- =============================================================================
-- Phase 3 — RLS Strict Policies
-- =============================================================================
--
-- PRECONDITIONS:
--   0001_phase3_rls.sql must have been applied (SECURITY DEFINER helpers +
--   schema constraints + 8 performance indexes).
--
-- WHAT THIS FILE DOES:
--   1. Adds two new SECURITY DEFINER helpers (follow counts + profile stub)
--   2. Enables RLS on every app table
--   3. Creates one SELECT / INSERT / UPDATE / DELETE policy per table
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor and run.
--   Test auth, profile loads, feed, interactions before considering done.
--
-- ROLLBACK:
--   For each table: ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;
--   Then DROP POLICY <name> ON public.<t>; (one per policy defined below)
--   The helper functions are safe to leave in place.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- NEW HELPERS (supplement 0001 helpers)
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns follower + following counts for any user, bypassing RLS.
-- Needed because the friendships_select policy is owner-scoped, so a viewer
-- cannot count friendship rows that don't involve them.
create or replace function public.get_follow_counts(target_user uuid)
returns table(follower_count bigint, following_count bigint)
language sql stable security definer
set search_path = public
as $$
  select
    count(*) filter (where friend_id = target_user and status = 'accepted') as follower_count,
    count(*) filter (where user_id  = target_user and status = 'accepted') as following_count
  from public.friendships
  where user_id = target_user or friend_id = target_user;
$$;

-- Returns the minimum public profile info regardless of privacy settings.
-- Used by the frontend to distinguish "profile is private" (stub returned,
-- profile_privacy = 'private' or 'followers') from "profile not found"
-- (null returned). Never exposes bio, links, or other sensitive columns.
create or replace function public.get_profile_public_stub(p_username text)
returns table(id uuid, username text, display_name text, profile_privacy text)
language sql stable security definer
set search_path = public
as $$
  select id, username, display_name, profile_privacy
  from public.profiles
  where lower(username) = lower(p_username);
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Public profiles are visible to everyone (including anonymous).
-- Private / followers-only profiles are visible only to the owner or eligible
-- followers. Block-aware.
create policy profiles_select on public.profiles
for select using (
  not public.is_blocked_either_way(id)
  and (
    profile_privacy = 'public'
    or id = auth.uid()
    or (profile_privacy = 'followers' and public.is_following(id))
  )
);

create policy profiles_update on public.profiles
for update using (id = auth.uid())
         with check (id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- posts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.posts enable row level security;

create policy posts_select on public.posts
for select using (
  public.can_view_post(user_id, visibility)
);

create policy posts_insert on public.posts
for insert with check (user_id = auth.uid());

create policy posts_update on public.posts
for update using (user_id = auth.uid())
         with check (user_id = auth.uid());

create policy posts_delete on public.posts
for delete using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- boards
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.boards enable row level security;

create policy boards_select on public.boards
for select using (
  public.can_view_post(user_id, visibility)
);

create policy boards_modify on public.boards
for all using (user_id = auth.uid())
     with check (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- board_posts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.board_posts enable row level security;

-- Readable only if both the board and the post are visible to the viewer.
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

-- Writer must own the board and be able to see the post.
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


-- ─────────────────────────────────────────────────────────────────────────────
-- reposts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.reposts enable row level security;

create policy reposts_select on public.reposts
for select using (
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


-- ─────────────────────────────────────────────────────────────────────────────
-- likes
-- ─────────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────────
-- comments
-- ─────────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────────
-- stories
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.stories enable row level security;

-- Visible: own stories, OR (follower of owner AND not blocked AND not expired),
-- OR public-profile owner (anyone can see stories of public profiles).
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


-- ─────────────────────────────────────────────────────────────────────────────
-- story_views
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.story_views enable row level security;

-- Only the story owner can read the viewer list.
create policy story_views_select on public.story_views
for select using (
  exists (
    select 1 from public.stories s
    where s.id = story_views.story_id
      and s.user_id = auth.uid()
  )
);

-- Viewer must be the auth user and must be able to see the story.
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
        or exists (
          select 1 from public.profiles pr
          where pr.id = s.user_id
            and pr.profile_privacy = 'public'
        )
      )
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- friendships
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.friendships enable row level security;

-- Each user can only see friendship rows they are a party to.
-- Counts for other profiles go through get_follow_counts() (SECURITY DEFINER).
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


-- ─────────────────────────────────────────────────────────────────────────────
-- blocks
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.blocks enable row level security;

create policy blocks_select on public.blocks
for select using (blocker_id = auth.uid());

create policy blocks_insert on public.blocks
for insert with check (blocker_id = auth.uid());

create policy blocks_delete on public.blocks
for delete using (blocker_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
for select using (user_id = auth.uid());

create policy notifications_update on public.notifications
for update using (user_id = auth.uid())
         with check (user_id = auth.uid());

-- Short-term INSERT policy: actor must be from_user_id and a justifying row
-- must exist. Replace with Edge Function call once Phase 7 lands.
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
