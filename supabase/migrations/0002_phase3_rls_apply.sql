-- =============================================================================
-- Phase 3 — RLS apply (built against live moodboard schema, 2026-05-08)
-- =============================================================================
-- Voraussetzung: 0001_phase3_rls.sql wird NICHT angewendet wie sie ist.
-- Dieses File macht das, was wirklich zählt:
--   1. nur die fehlenden DDL-Stücke (notifications.type CHECK, indexe, friendships default)
--   2. helper-funktionen (is_following / is_blocked_either_way / can_view_post)
--   3. ALTE permissive policies droppen + neue strenge anlegen
-- =============================================================================


-- ── Block 1 (nur das was wirklich fehlt) ────────────────────────────────────

-- notifications.type CHECK fehlt aktuell, alle 6 Bestandszeilen passen.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add  constraint notifications_type_check
  check (type in ('like','comment','repost','follow'));

-- friendships: Default war bisher NICHT gesetzt. Bewusste Verhaltensänderung.
alter table public.friendships
  alter column status set default 'accepted';

-- Indexe (alle if not exists, daten haben keine duplikate – geprüft).
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create        index if not exists posts_user_created_idx       on public.posts (user_id, created_at desc);
create        index if not exists posts_user_visibility_idx    on public.posts (user_id, visibility);
create        index if not exists boards_user_position_idx     on public.boards (user_id, position);
create unique index if not exists board_posts_unique_idx       on public.board_posts (board_id, post_id);
create        index if not exists board_posts_board_position_idx on public.board_posts (board_id, position);
create unique index if not exists reposts_unique_idx           on public.reposts (post_id, user_id);
create        index if not exists reposts_user_profile_idx     on public.reposts (user_id, show_on_profile, created_at desc);
create unique index if not exists likes_unique_idx             on public.likes (post_id, user_id);
create        index if not exists likes_post_idx               on public.likes (post_id);
create        index if not exists comments_post_created_idx    on public.comments (post_id, created_at);
create        index if not exists stories_user_expires_idx     on public.stories (user_id, expires_at);
create unique index if not exists story_views_unique_idx       on public.story_views (story_id, user_id);
create        index if not exists story_views_story_idx        on public.story_views (story_id);
create unique index if not exists friendships_unique_idx       on public.friendships (user_id, friend_id);
create        index if not exists friendships_user_status_idx  on public.friendships (user_id, friend_id, status);
create        index if not exists friendships_friend_status_idx on public.friendships (friend_id, user_id, status);
create unique index if not exists blocks_unique_idx            on public.blocks (blocker_id, blocked_id);
create        index if not exists blocks_blocker_idx           on public.blocks (blocker_id);
create        index if not exists blocks_blocked_idx           on public.blocks (blocked_id);
create        index if not exists notifications_user_idx       on public.notifications (user_id, read, created_at desc);


-- ── Block 2: helper-funktionen (idempotent, übernommen aus 0001) ────────────
create or replace function public.is_following(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_id = target_user and status = 'accepted'
  );
$$;

create or replace function public.is_blocked_either_way(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;

create or replace function public.can_view_post(post_owner uuid, post_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_blocked_either_way(post_owner)
    and (
      post_visibility = 'public'
      or post_owner = auth.uid()
      or (post_visibility = 'followers' and public.is_following(post_owner))
    );
$$;


-- ── Block 3: alte policies droppen + neue setzen ────────────────────────────
-- ACHTUNG: tabelle für tabelle ausführen, zwischendurch app testen.

-- profiles -------------------------------------------------------------------
drop policy if exists "Profile lesbar"                  on public.profiles;
drop policy if exists "profiles are viewable by everyone" on public.profiles;
drop policy if exists "Eigenes Profil bearbeiten"       on public.profiles;
drop policy if exists "Eigenes Profil einfügen"         on public.profiles;
drop policy if exists "users can delete own profile"    on public.profiles;
drop policy if exists "users can insert own profile"    on public.profiles;
drop policy if exists "users can update own profile"    on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_insert on public.profiles;

create policy profiles_select on public.profiles
for select using (
  not public.is_blocked_either_way(id)
  and (
    profile_privacy = 'public'
    or id = auth.uid()
    or (profile_privacy = 'followers' and public.is_following(id))
  )
);
create policy profiles_insert on public.profiles
for insert with check (id = auth.uid());
create policy profiles_update on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- posts ----------------------------------------------------------------------
drop policy if exists "Eigene Posts erstellen"       on public.posts;
drop policy if exists "Eigene Posts löschen"         on public.posts;
drop policy if exists "users can delete own posts"   on public.posts;
drop policy if exists "users can insert own posts"   on public.posts;
drop policy if exists "users can update own posts"   on public.posts;
drop policy if exists  posts_select_visibility       on public.posts;
drop policy if exists  posts_select on public.posts;
drop policy if exists  posts_insert on public.posts;
drop policy if exists  posts_update on public.posts;
drop policy if exists  posts_delete on public.posts;

create policy posts_select on public.posts for select using (public.can_view_post(user_id, visibility));
create policy posts_insert on public.posts for insert with check (user_id = auth.uid());
create policy posts_update on public.posts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy posts_delete on public.posts for delete using (user_id = auth.uid());

-- boards ---------------------------------------------------------------------
drop policy if exists "Boards erstellen" on public.boards;
drop policy if exists "Boards lesen"     on public.boards;
drop policy if exists "Boards löschen"   on public.boards;
drop policy if exists "Boards updaten"   on public.boards;
drop policy if exists  boards_select on public.boards;
drop policy if exists  boards_modify on public.boards;

create policy boards_select on public.boards for select using (public.can_view_post(user_id, visibility));
create policy boards_modify on public.boards for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- board_posts ----------------------------------------------------------------
drop policy if exists "Board Posts hinzufügen" on public.board_posts;
drop policy if exists "Board Posts lesen"      on public.board_posts;
drop policy if exists "Board Posts löschen"    on public.board_posts;
drop policy if exists  board_posts_select on public.board_posts;
drop policy if exists  board_posts_insert on public.board_posts;
drop policy if exists  board_posts_delete on public.board_posts;

create policy board_posts_select on public.board_posts for select using (
  exists (select 1 from public.boards b where b.id = board_posts.board_id and public.can_view_post(b.user_id, b.visibility))
  and exists (select 1 from public.posts p where p.id = board_posts.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy board_posts_insert on public.board_posts for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.boards b where b.id = board_posts.board_id and b.user_id = auth.uid())
  and exists (select 1 from public.posts  p where p.id = board_posts.post_id  and public.can_view_post(p.user_id, p.visibility))
);
create policy board_posts_delete on public.board_posts for delete using (user_id = auth.uid());

-- reposts --------------------------------------------------------------------
drop policy if exists "Eingeloggte User können reposten" on public.reposts;
drop policy if exists "Jeder kann Reposts lesen"        on public.reposts;
drop policy if exists "Nur eigene Reposts löschen"      on public.reposts;
drop policy if exists  reposts_select on public.reposts;
drop policy if exists  reposts_insert on public.reposts;
drop policy if exists  reposts_delete on public.reposts;

create policy reposts_select on public.reposts for select using (
  exists (select 1 from public.posts p where p.id = reposts.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy reposts_insert on public.reposts for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = reposts.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy reposts_delete on public.reposts for delete using (user_id = auth.uid());

-- likes ----------------------------------------------------------------------
drop policy if exists "Likes erstellen"               on public.likes;
drop policy if exists "Likes lesbar"                  on public.likes;
drop policy if exists "Likes löschen"                 on public.likes;
drop policy if exists "likes are viewable by everyone" on public.likes;
drop policy if exists "users can delete own likes"    on public.likes;
drop policy if exists "users can insert own likes"    on public.likes;
drop policy if exists  likes_select on public.likes;
drop policy if exists  likes_insert on public.likes;
drop policy if exists  likes_delete on public.likes;

create policy likes_select on public.likes for select using (
  exists (select 1 from public.posts p where p.id = likes.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy likes_insert on public.likes for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = likes.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy likes_delete on public.likes for delete using (user_id = auth.uid());

-- comments -------------------------------------------------------------------
drop policy if exists "Comments erstellen"             on public.comments;
drop policy if exists "Comments lesbar"                on public.comments;
drop policy if exists "Comments löschen"               on public.comments;
drop policy if exists "comments are viewable by everyone" on public.comments;
drop policy if exists  comments_delete on public.comments;
drop policy if exists  comments_insert on public.comments;
drop policy if exists  comments_select on public.comments;
drop policy if exists "users can delete own comments"  on public.comments;
drop policy if exists "users can insert own comments"  on public.comments;
drop policy if exists "users can update own comments"  on public.comments;

create policy comments_select on public.comments for select using (
  exists (select 1 from public.posts p where p.id = comments.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy comments_insert on public.comments for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = comments.post_id and public.can_view_post(p.user_id, p.visibility))
);
create policy comments_update on public.comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete on public.comments for delete using (user_id = auth.uid());

-- stories --------------------------------------------------------------------
drop policy if exists "Stories erstellen" on public.stories;
drop policy if exists "Stories löschen"   on public.stories;
drop policy if exists  stories_select_visibility on public.stories;
drop policy if exists  stories_select on public.stories;
drop policy if exists  stories_insert on public.stories;
drop policy if exists  stories_delete on public.stories;

create policy stories_select on public.stories for select using (
  not public.is_blocked_either_way(user_id)
  and expires_at > now()
  and (
    user_id = auth.uid()
    or public.is_following(user_id)
    or exists (select 1 from public.profiles pr where pr.id = stories.user_id and pr.profile_privacy = 'public')
  )
);
create policy stories_insert on public.stories for insert with check (user_id = auth.uid());
create policy stories_delete on public.stories for delete using (user_id = auth.uid());

-- story_views ----------------------------------------------------------------
drop policy if exists "Story Views einfügen" on public.story_views;
drop policy if exists "Story Views lesen"    on public.story_views;
drop policy if exists  story_views_select on public.story_views;
drop policy if exists  story_views_insert on public.story_views;

create policy story_views_select on public.story_views for select using (
  exists (select 1 from public.stories s where s.id = story_views.story_id and s.user_id = auth.uid())
);
create policy story_views_insert on public.story_views for insert with check (
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
drop policy if exists "users can create friendship requests involving themselves" on public.friendships;
drop policy if exists "users can delete own friendships" on public.friendships;
drop policy if exists "users can update own friendships" on public.friendships;
drop policy if exists "users can view own friendships"   on public.friendships;
drop policy if exists  friendships_select on public.friendships;
drop policy if exists  friendships_insert on public.friendships;
drop policy if exists  friendships_update on public.friendships;
drop policy if exists  friendships_delete on public.friendships;

create policy friendships_select on public.friendships for select using (
  user_id = auth.uid() or friend_id = auth.uid()
);
create policy friendships_insert on public.friendships for insert with check (
  user_id = auth.uid() and not public.is_blocked_either_way(friend_id)
);
-- update lassen wir auf beiden seiten zu (z.B. accept-flow)
create policy friendships_update on public.friendships for update
  using (user_id = auth.uid() or friend_id = auth.uid())
  with check (user_id = auth.uid() or friend_id = auth.uid());
create policy friendships_delete on public.friendships for delete using (
  user_id = auth.uid() or friend_id = auth.uid()
);

-- blocks ---------------------------------------------------------------------
drop policy if exists blocks_select_own on public.blocks;
drop policy if exists blocks_insert_own on public.blocks;
drop policy if exists blocks_delete_own on public.blocks;

create policy blocks_select on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

-- notifications --------------------------------------------------------------
drop policy if exists "users can delete own notifications"          on public.notifications;
drop policy if exists "users can insert notifications for valid actor" on public.notifications;
drop policy if exists "users can update own notifications"          on public.notifications;
drop policy if exists "users can view own notifications"            on public.notifications;
drop policy if exists  notifications_select on public.notifications;
drop policy if exists  notifications_update on public.notifications;
drop policy if exists  notifications_insert on public.notifications;
drop policy if exists  notifications_delete on public.notifications;

create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert with check (
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
