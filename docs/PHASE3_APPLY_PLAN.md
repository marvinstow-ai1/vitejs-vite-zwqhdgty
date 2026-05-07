# Phase 3 — Apply Plan, Verification, Rollback

Companion to `docs/PHASE3_RLS_AUDIT.md` and
`supabase/migrations/0001_phase3_rls.sql`.

This document describes **how** to roll out the Phase 3 migration safely. It
does not apply anything — applying RLS without correct policies blocks live
queries instantly. Treat every step here as gated on human review.

---

## 0. Pre-apply checks

Before touching the live database, confirm each of these in the Supabase
dashboard (Database → Tables / Authentication → Policies):

### 0.1 Schema assumptions the migration relies on

| Assumption                                         | How to confirm                                                   |
|----------------------------------------------------|-------------------------------------------------------------------|
| `profiles.profile_privacy` column exists           | Table editor → profiles                                           |
| `posts.visibility` column exists                   | Table editor → posts                                              |
| `boards.visibility` column exists                  | Table editor → boards                                             |
| `reposts.show_on_profile` column exists            | Table editor → reposts                                            |
| `notifications.from_user_id` column exists         | Table editor → notifications                                      |
| `board_posts.user_id` column exists                | Table editor → board_posts                                        |
| Auth trigger inserts profile on signup             | Database → Functions → search for `handle_new_user`               |
| No duplicate usernames differing only in case      | `select lower(username), count(*) from profiles group by 1 having count(*) > 1;` |

If `handle_new_user` does **not** exist, leave `profiles_insert` policy enabled
(it is enabled in v2). If it **does** exist, the policy is harmless (the
trigger runs as `security definer` and bypasses RLS).

### 0.2 Existing RLS state

Run in SQL Editor:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','posts','boards','board_posts','reposts','likes',
    'comments','stories','story_views','friendships','blocks','notifications'
  )
order by tablename;
```

For any table where `rowsecurity = true` already, list its policies so you
don't accidentally end up with double / conflicting policies:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

### 0.3 Data audit (for the `not valid` constraints)

```sql
-- privacy / visibility values that fail the new CHECKs
select 'profiles.profile_privacy' as col, profile_privacy as value, count(*)
  from public.profiles
  where profile_privacy is null
     or profile_privacy not in ('public','followers','private')
  group by 1, 2
union all
select 'posts.visibility', visibility, count(*)
  from public.posts
  where visibility is null
     or visibility not in ('public','followers','private')
  group by 1, 2
union all
select 'boards.visibility', visibility, count(*)
  from public.boards
  where visibility is null
     or visibility not in ('public','followers','private')
  group by 1, 2
union all
select 'friendships.status', status, count(*)
  from public.friendships
  where status is null
     or status not in ('accepted','pending')
  group by 1, 2
union all
select 'notifications.type', type, count(*)
  from public.notifications
  where type is null
     or type not in ('like','comment','repost','follow')
  group by 1, 2;
```

Backfill any non-conforming rows before running `validate constraint`.

---

## 1. Snapshot / backup

1. **Create a Supabase database branch** (Project → Branches → New Branch).
   Apply and test the migration on the branch first.
2. If branching is not available, take a manual `pg_dump`:
   ```bash
   pg_dump --no-owner --schema=public -d "$DATABASE_URL" > pre_phase3.sql
   ```
3. Note the timestamp; PITR (Point-in-Time Recovery) windows on Supabase Pro
   are 7 days, so the apply must finish well within that window if you intend
   to rely on PITR as a fallback.

---

## 2. Recommended apply order

Apply the migration in **5 stages**, validating after each. Do **NOT** run the
whole file at once on a live project — `enable row level security` on a table
with no matching policies will lock it.

### Stage 1 — Schema hardening (BLOCK 1)
Non-breaking. Adds defaults, idempotent indexes, and `not valid` CHECKs.

```sql
-- BLOCK 1 only, lines from "BLOCK 1" header through the end of the
-- "notifications" subsection.
```

After: re-run the data audit in §0.3. If clean, optionally validate
constraints:

```sql
alter table public.profiles      validate constraint profiles_privacy_check;
alter table public.posts         validate constraint posts_visibility_check;
alter table public.boards        validate constraint boards_visibility_check;
alter table public.friendships   validate constraint friendships_status_check;
alter table public.notifications validate constraint notifications_type_check;
```

### Stage 2 — Helpers (BLOCK 2)
Non-breaking. Just three SQL functions. Verify with:

```sql
select public.is_following(auth.uid());
select public.is_blocked_either_way(auth.uid());
```

### Stage 3 — RLS enable + policies (BLOCK 3), table-by-table
This is the dangerous step. Apply in this order so cross-table joins always
have policies in place when they need them:

1. `profiles`              ← others reference it
2. `friendships`, `blocks` ← visibility helpers depend on these
3. `posts`
4. `boards`, `board_posts`
5. `likes`, `comments`, `reposts`
6. `stories`, `story_views`
7. `notifications`

After **each table**, run the verification checklist in §3 for the flows
involving that table. If any flow regresses, run the rollback in §5 for that
single table before moving on.

### Stage 4 — Storage policies (BLOCK 4)
Idempotent loop creates per-bucket policies for `images`, `videos`, `headers`,
`stories`. Run after BLOCK 3 (so `can_view_post` exists if you ever switch to
row-aware reads).

### Stage 5 — Validate constraints
Once everything is green and stable for at least a day, run the
`validate constraint` statements from Stage 1.

---

## 3. Post-apply verification checklist

Run these against the live app. **Web client only** — the SQL Editor uses the
service role key, which bypasses RLS, so SQL Editor success is **not** proof
of correctness.

Do the test pass once as **logged-out**, once as **user A** (public profile),
once as **user B** (followers-only profile, follows A), and once as **user C**
(private profile, blocks A).

### 3.1 Auth
- [ ] Signup as new user creates a profile row (check `select count(*) from
      profiles where id = auth.uid()` returns 1)
- [ ] Sign-in works
- [ ] Sign-out returns to anonymous browsing

### 3.2 Profiles
- [ ] Public profile loads (username + avatar visible to anonymous)
- [ ] Private profile shows username + avatar but no posts/stories/boards to
      a non-follower
- [ ] Blocked viewer cannot read the blocker's profile row
- [ ] Self-profile loads with all own data

### 3.3 Feed
- [ ] `loadFeedPosts` returns own + followed users' posts
- [ ] Followers-only post by user A is visible to followers, not to strangers
- [ ] Private post by user A is visible only to A
- [ ] Posts by blocked users do not appear

### 3.4 Posting
- [ ] Insert post (public, followers, private) — all three succeed for the
      author
- [ ] Cannot insert a post with `user_id != auth.uid()`
- [ ] Author can update their own post visibility
- [ ] Author can delete their own post

### 3.5 Likes
- [ ] Like a public post → row created, count updates
- [ ] Like a followers-only post when following → succeeds
- [ ] Like a private post you don't own → blocked
- [ ] Unlike removes the row
- [ ] `getLikeCount` realtime still updates

### 3.6 Comments
- [ ] Comment on a visible post → succeeds
- [ ] Comment on a private post you don't own → blocked
- [ ] Comments list shows commenter usernames (profile join works)

### 3.7 Reposts
- [ ] Repost a public post → row in `reposts` and in default `Reposts`
      `board_posts`
- [ ] Repost into another own board → both inserts succeed
- [ ] Repost a private post you don't own → blocked
- [ ] Profile reposts grid still shows reposts where `show_on_profile = true`

### 3.8 Boards
- [ ] Public board readable by anyone
- [ ] Private board readable only by owner
- [ ] Followers-only board readable only by followers
- [ ] Adding a private post you don't own to a board → blocked
- [ ] Deleting board cascades to `board_posts` (FK behavior — already in DB)

### 3.9 Stories
- [ ] Story by public user visible to all logged-in viewers
- [ ] Story by private user visible only to followers + self
- [ ] Expired stories not returned
- [ ] Story upload writes file under `stories/<auth.uid()>/...`

### 3.10 Story views
- [ ] Marking a viewable story as viewed → succeeds
- [ ] Cannot insert a `story_views` row for a story you can't see
- [ ] `getStoryViewers` returns rows only when viewer is the story owner
- [ ] Non-owner of a story sees an empty list (or the call errors gracefully)

### 3.11 Notifications
- [ ] `notifyAction(...)` after a like/comment/repost/follow inserts a row
- [ ] You cannot insert a notification with `from_user_id != auth.uid()`
- [ ] You cannot insert a notification of type `like` without an existing
      like row
- [ ] Realtime subscription to your own notifications still fires
- [ ] `markAllRead` flips `read = true` on your rows; cannot update other
      users' rows
- [ ] Cannot change `read = true` back to `false` (WITH CHECK enforces
      `read = true`)

### 3.12 Blocks
- [ ] You can list only your own blocks
- [ ] After A blocks B: A cannot see B's profile/posts/stories and vice versa
- [ ] After unblocking, normal visibility resumes

### 3.13 Storage / uploads
- [ ] Image upload from composer succeeds; file appears under
      `images/<auth.uid()>/<file>`
- [ ] Cannot upload to `images/<other-uid>/...`
- [ ] Public URL of an uploaded image opens in an incognito tab
- [ ] Header image upload works and overwrites
- [ ] Story file upload works
- [ ] Anonymous read of a public-bucket URL works (because URLs are embedded
      in posts/stories visible per RLS)

### 3.14 Visibility behavior matrix

| Viewer state                | Public post | Followers post | Private post (own) | Private post (other) |
|-----------------------------|-------------|----------------|--------------------|----------------------|
| Anonymous                   | ✓           | ✗              | n/a                | ✗                    |
| Logged-in non-follower      | ✓           | ✗              | n/a                | ✗                    |
| Logged-in follower          | ✓           | ✓              | n/a                | ✗                    |
| Owner                       | ✓           | ✓              | ✓                  | n/a                  |
| Blocked by post owner       | ✗           | ✗              | n/a                | ✗                    |

Apply the same matrix to `boards`, `stories`.

---

## 4. Likely breakpoints (watch these first)

In rough order of likelihood:

1. **`getProfileByUsername` / `loadUsernameMap` returning empty** if you used
   the old `profiles_select` policy that hid private profile rows. v2 keeps
   profile rows readable; if you swap back to a stricter policy, expect
   notification senders, repost authors, and comment authors to lose their
   usernames in the UI.

2. **Anonymous landing route** — if `/` shows public posts, anonymous users
   need to be able to SELECT public posts and the profile rows they reference.
   v2 allows both. Confirm with an incognito window.

3. **Notifications insert blocked** — if `notifyAction` fires before the
   underlying like/comment/repost row commits (or if the actor's auth session
   has a different `auth.uid()`), the WITH CHECK fails. This is a known
   short-term limitation; Phase 7 moves notification creation to an Edge
   Function with the service role key.

4. **`mark all read` failing** — v2 tightens `notifications_update` to
   `WITH CHECK (read = true)`. If any code path tries to write `read = false`
   it will now fail. Search for that.

5. **Repost flow partial-failure** — the two-table write in `addRepost` is
   not atomic. If the `reposts` insert succeeds but `board_posts` does not
   (e.g., RLS rejects the post on the followers/private branch), state is
   inconsistent. Phase 7 fixes this with an Edge Function.

6. **Story viewer list empty for non-owners** — expected. UI must not crash
   when `getStoryViewers` returns `[]` for non-owners.

7. **Storage uploads failing** — verify that the path in
   `media.service.js` always begins with `${userId}/`. It does today
   (`uploadPostMedia`, `uploadHeaderImage`, `uploadStoryMedia` all use
   `${userId}/...`). Any future code that bypasses these helpers will fail.

8. **Slow feed query** — if the new `posts (user_id, visibility)` index isn't
   picked up, RLS scans become full sequential scans. `EXPLAIN` the feed
   query and confirm index usage.

---

## 5. Rollback

The migration ships a kill switch in BLOCK 5 of the SQL file. Apply the
relevant `disable row level security` line for any table that misbehaves —
this stops enforcement instantly while leaving the policies and constraints
in place for a future re-enable.

Order of escalation:

1. **Single-table RLS off** — first response. Affects only the broken table.
2. **All-table RLS off** — apply the full `disable` block. App returns to
   pre-migration trust model (frontend filters only).
3. **Drop constraints** — only if a `not valid` CHECK got `validated` and is
   now blocking writes. The migration explicitly does not validate
   automatically; you should only ever hit this if you ran `validate
   constraint` manually.
4. **Database branch** — discard the branch and start over.
5. **PITR** — last resort, recover the project to before the migration ran.

After rolling back, re-run the data audit in §0.3 to understand what state
production landed in.

---

## 6. Storage policy notes

Buckets in use (grepped from code):

- `images`   — feed composer photos / GIFs                  — `media.service.js#uploadPostMedia`
- `videos`   — feed composer videos                          — `media.service.js#uploadPostMedia`
- `headers`  — profile header images                         — `media.service.js#uploadHeaderImage`
- `stories`  — 24h story media                               — `media.service.js#uploadStoryMedia`, `stories.service.js`

All upload paths are `${userId}/<filename>`. The storage policies in BLOCK 4
enforce that.

**Read model:** public read by `bucket_id`. The actual visibility gate is the
post / story row's RLS, which is what controls whether the URL is ever
returned to a viewer in the first place. This is the same model Twitter and
Instagram use for media URLs and is the correct trade-off here — switching to
signed URLs would need every read path to go through an Edge Function.

If a bucket does **not** yet exist in the project (e.g. `videos` was never
created), creating the policy on `storage.objects` is harmless but the upload
itself will fail with a 404. Create the buckets in the dashboard first, then
re-run BLOCK 4.

---

## 7. Open questions blocking final apply

These are unchanged from the audit and from `docs/ROADMAP.md` Phase 6:

1. `/` landing route — affects whether anonymous reads are part of the
   product surface. The current migration permits anonymous SELECT on public
   posts/profiles, which is consistent with **either** "clean landing" or
   "home feed for logged-in, public landing for anonymous".
2. Social graph model (follows vs follows + requests) — schema already
   supports both via `friendships.status`. No migration change needed.
3. Messages — out of scope for Phase 3.

The migration does not need these answered to apply, but the *post-apply
product behavior* depends on (1).
