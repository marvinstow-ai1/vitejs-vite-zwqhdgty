-- =============================================================================
-- Phase 3 — strict SELECT/INSERT policies (PASTE-READY, NOT YET APPLIED)
-- =============================================================================
--
-- Status:
--   * 0001_phase3_rls.sql     — original audit-aligned proposal (historical).
--   * applied via MCP        — `phase3_visibility_helpers_and_indexes` migration
--                              (see supabase migrations history). It added the
--                              SECURITY DEFINER helpers + perf indexes only.
--   * THIS FILE (0002)       — the next step: tighten the wide-open SELECT
--                              policies on profiles, board_posts, reposts,
--                              likes, comments, story_views, and the
--                              comments / story_views INSERT policies.
--
-- Why split? The helpers + indexes are purely additive. The policy tightening
-- can break live sessions if anything is wrong, so it is reviewed and applied
-- by a human, table-by-table, with eyes on the app afterwards.
--
-- The migration is fully IDEMPOTENT (safe to run twice). Each block:
--   1. drops the legacy permissive policies that currently grant qual=true
--   2. drops the strict policy of the same name if a previous run created it
--   3. recreates the strict policy
--
-- Pre-requirements (already applied):
--   - public.is_following(uuid)
--   - public.is_blocked_either_way(uuid)
--   - public.can_view_post(uuid, text)
--
-- Rollback (per block):
--   drop policy <strict_name> on public.<table>;
--   create policy <legacy_name> on public.<table> for select using (true);
--
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Currently has TWO permissive `qual=true` SELECT policies. Drop both, then
-- create a single visibility-aware policy. Owner always sees own row. Public
-- profiles are visible to everyone (incl. anon). `followers` profiles only to
-- accepted followers. `private` profiles only to owner. Block-aware.
drop policy if exists "Profile lesbar"                  on public.profiles;
drop policy if exists "profiles are viewable by everyone" on public.profiles;
drop policy if exists profiles_select                   on public.profiles;

create policy profiles_select on public.profiles
for select using (
  not public.is_blocked_either_way(id)
  and (
    coalesce(profile_privacy, 'public') = 'public'
    or id = auth.uid()
    or (profile_privacy = 'followers' and public.is_following(id))
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- board_posts
-- ─────────────────────────────────────────────────────────────────────────────
-- Replace `qual=true` with: viewer must be able to see BOTH the board and
-- the post. INSERT requires actor is board owner AND can view the post.
drop policy if exists "Board Posts lesen"   on public.board_posts;
drop policy if exists board_posts_select    on public.board_posts;

create policy board_posts_select on public.board_posts
for select using (
  exists (
    select 1 from public.boards b
    where b.id = board_posts.board_id
      and (
        coalesce(b.visibility, 'public') = 'public'
        or b.user_id = auth.uid()
        or (b.visibility = 'followers' and public.is_following(b.user_id))
      )
      and not public.is_blocked_either_way(b.user_id)
  )
  and exists (
    select 1 from public.posts p
    where p.id = board_posts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

drop policy if exists "Board Posts hinzufügen" on public.board_posts;
drop policy if exists board_posts_insert       on public.board_posts;

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


-- ─────────────────────────────────────────────────────────────────────────────
-- reposts
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Jeder kann Reposts lesen"      on public.reposts;
drop policy if exists reposts_select                  on public.reposts;

create policy reposts_select on public.reposts
for select using (
  exists (
    select 1 from public.posts p
    where p.id = reposts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

drop policy if exists "Eingeloggte User können reposten" on public.reposts;
drop policy if exists reposts_insert                     on public.reposts;

create policy reposts_insert on public.reposts
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = reposts.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- likes
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Likes lesbar"               on public.likes;
drop policy if exists "likes are viewable by everyone" on public.likes;
drop policy if exists likes_select                 on public.likes;

create policy likes_select on public.likes
for select using (
  exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

drop policy if exists "Likes erstellen"            on public.likes;
drop policy if exists "users can insert own likes" on public.likes;
drop policy if exists likes_insert                 on public.likes;

create policy likes_insert on public.likes
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- comments
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Comments lesbar"                  on public.comments;
drop policy if exists "comments are viewable by everyone" on public.comments;
drop policy if exists comments_select                    on public.comments;

create policy comments_select on public.comments
for select using (
  exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);

drop policy if exists "Comments erstellen"             on public.comments;
drop policy if exists "users can insert own comments"  on public.comments;
drop policy if exists comments_insert                  on public.comments;

create policy comments_insert on public.comments
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and public.can_view_post(p.user_id, p.visibility)
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- story_views
-- ─────────────────────────────────────────────────────────────────────────────
-- The viewer list is sensitive — only the story OWNER may read it.
-- A viewer may insert a row only if they can SELECT the story.
drop policy if exists "Story Views lesen"   on public.story_views;
drop policy if exists story_views_select    on public.story_views;

create policy story_views_select on public.story_views
for select using (
  exists (
    select 1 from public.stories s
    where s.id = story_views.story_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Story Views einfügen" on public.story_views;
drop policy if exists story_views_insert     on public.story_views;

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
            and coalesce(pr.profile_privacy, 'public') = 'public'
        )
      )
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- notifications — tighten INSERT to match Phase 6 trust model
-- ─────────────────────────────────────────────────────────────────────────────
-- The current policy allows `from_user_id = auth.uid() OR user_id = auth.uid()`,
-- which lets a malicious actor send notifications to themselves with any
-- forged from_user_id. Tighten to `from_user_id = auth.uid()` AND require a
-- justifying row. (Long-term: this whole policy goes away once notifications
-- are created via Edge Function with the service role key — see Phase 7.)
drop policy if exists "users can insert notifications for valid actor"
  on public.notifications;
drop policy if exists notifications_insert on public.notifications;

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
-- comments — clean up duplicate UPDATE/DELETE/INSERT policies (cosmetic)
-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: collapses 3 INSERT and 3 DELETE policies into one each.
-- All have identical predicates; behavior is unchanged.
drop policy if exists "users can delete own comments" on public.comments;
drop policy if exists "Comments löschen"              on public.comments;
drop policy if exists comments_delete                 on public.comments;
create policy comments_delete on public.comments
for delete using (user_id = auth.uid());

drop policy if exists "users can update own comments" on public.comments;
drop policy if exists comments_update                 on public.comments;
create policy comments_update on public.comments
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
