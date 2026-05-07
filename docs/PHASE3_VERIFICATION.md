# Phase 3 — Verification pass

This is a flow-by-flow audit against the **live RLS state** after Step 1 of
`PHASE3_APPLY_PLAN.md` (helpers + indexes applied). For each flow we mark:

- **Status today** — what works against the current live policies
- **After Step 2** — what changes once `0002_phase3_strict_policies.sql` is
  applied
- **First line of failure** — the call site to inspect first if it breaks
- **Frontend trust still in play** — what the UI still believes for now

Codes:
- ✅ safe — no RLS dependency or already covered
- ⚠️ likely safe, manual smoke-test recommended
- ❌ likely broken / regression risk

---

## 1. Auth / login / signup

- **Today:** ✅ — `auth.signInWithPassword` / `signUp` go through Supabase
  auth and don't depend on `public.*` RLS. The `handle_new_user` trigger
  inserts a `profiles` row server-side (`SECURITY DEFINER`).
- **After Step 2:** ✅ — unchanged.
- **First line of failure:** `auth.service.js#signIn` / `signUp`.

## 2. Profile loading (`/[:username]`)

- **Today:** `getProfileByUsername` returns every profile because
  `profiles` SELECT is `qual=true`. Even private profiles leak their
  `bio`, `header_*`, `playlist_url`, etc. to non-followers.
- **After Step 2:** ⚠️ — `profiles_select` enforces public/follower/owner +
  block-aware. Private profiles return `null` from `getProfileByUsername()`,
  and the page must show "this profile is private" instead of crashing on
  null. **Action:** verify that `profile.page.js` renders a graceful empty
  state when `data` is `null`.
- **First line of failure:** `services/profiles.service.js:20` →
  `getProfileByUsername`.
- **Frontend trust still in play:** the page hides bio/playlist/etc. via
  client-side `data?.profile_privacy` checks — that becomes redundant once
  RLS hides the columns.

## 3. Feed loading (`/`)

- **Today:** `loadFeedPosts(currentUserId)` selects `posts.*` for
  `user_id IN (self, ...followed)`. RLS policy `posts_select_visibility` is
  already strict and block-aware, so the feed only returns rows the viewer
  is allowed to see. The `getVisiblePostIds` filter is now a no-op (good).
- **After Step 2:** ✅ — unchanged.
- **First line of failure:** `services/posts.service.js:83` →
  `loadFeedPosts`.

## 4. Post creation (composer)

- **Today:** ✅ — `posts_insert` policy is `auth.uid() = user_id`. The
  composer in `feed.page.js` calls `insertPost()` with `user_id = currentUser.id`.
- **After Step 2:** ✅ — unchanged.

## 5. Likes

- **Today:** like INSERT works (owner check). Like SELECT is `qual=true`
  so counts include likes on private posts — minor info leak.
- **After Step 2:** ⚠️ — `likes_select` and `likes_insert` both join back
  to `posts` via `can_view_post`. Liking a post the viewer cannot see
  becomes impossible (correct), and like counts now only include likes on
  visible posts.
- **First line of failure:** `services/interactions.service.js:29` →
  `toggleLike` and `services/posts.service.js:111` → `loadPostInteractions`.

## 6. Comments

- **Today:** comments INSERT works (owner check). Comments SELECT is
  `qual=true`. Three duplicate SELECT policies all set to `true` /
  `auth.role() = 'authenticated'`.
- **After Step 2:** ⚠️ — `comments_select` joins back to `posts`, so a
  viewer only sees comments on visible posts. Posting a comment to a post
  you cannot see becomes impossible.
- **First line of failure:** `services/interactions.service.js:123` →
  `loadComments`.

## 7. Reposts

- **Today:** repost INSERT works. Repost SELECT is `qual=true` — the
  `addRepost` flow inserts both into `reposts` and `board_posts`, then
  notifies. Profile reposts grid (`getProfileReposts` if it exists) reads
  reposts globally.
- **After Step 2:** ⚠️ — `reposts_select` and `_insert` join to `posts`
  via `can_view_post`. Reposting a post you cannot see fails. Reposts of
  posts whose owner has since gone private disappear from the grid for
  non-followers.
- **Atomicity gap remains:** `reposts` and `board_posts` are still two
  separate inserts (Phase 7).
- **First line of failure:** `services/interactions.service.js:73` →
  `addRepost`.

## 8. Boards

- **Today:** `boards.Boards lesen` is already visibility-aware. Reading a
  board's title/cover already respects public/followers/owner. But the
  `board_posts.Board Posts lesen` is `qual=true`, so a non-follower can
  enumerate the posts in a private/follower-only board if they know the
  board id.
- **After Step 2:** ⚠️ — `board_posts_select` joins to both `boards` and
  `posts` so the viewer must see both. INSERT requires actor is board
  owner AND can see the post.
- **First line of failure:** `services/boards.service.js` → board content
  load that joins `board_posts → posts`.

## 9. Stories

- **Today:** `stories_select_visibility` is already strict. Stories list
  works correctly for followers / public profiles.
  Story-views: ❌ today — `Story Views lesen` is `qual=true`, meaning the
  **viewer list of any story is public**. This is a real privacy bug.
- **After Step 2:** ⚠️ — `story_views_select` becomes owner-only,
  `story_views_insert` requires the viewer to be able to SELECT the story.
- **First line of failure:** wherever `getStoryViewers` lives in
  `services/stories.service.js`.

## 10. Notifications

- **Today:** notifications SELECT/UPDATE/DELETE are owner-only. INSERT is
  `auth.uid() = from_user_id OR auth.uid() = user_id` — the second branch
  is the forge surface. A user can insert a notification into their own
  inbox with any `from_user_id`. Cosmetic but exploitable for spoofing.
- **After Step 2:** ⚠️ — INSERT requires `from_user_id = auth.uid()` AND
  a justifying row in `likes`/`comments`/`reposts`/`friendships`. The
  `notifyAction()` flows already insert the action row first, so this is
  safe in normal use.
  - **Risk:** if a notify call ever runs before its action row commits,
    the insert will fail. Today every call site does action-then-notify
    in sequence — verify after Step 2 with a real like/comment/repost.
- **First line of failure:** `services/notify.action.js:35` →
  `supabase.from('notifications').insert(...)`.

## 11. Blocks

- **Today:** ✅ — `blocks_*_own` policies are correct (read both sides,
  insert/delete only as blocker).
- **After Step 2:** ✅ — unchanged.
- **Side effect of Step 2:** profile / posts / boards / stories visibility
  becomes fully block-aware at the DB level (today only `posts` and
  `stories` are block-aware in the policy; `profiles` and `boards` rely
  on the frontend to skip them).

## 12. Uploads / storage access

- **Today:** the four buckets (`images`, `videos`, `headers`, `stories`)
  exist and are public-readable. Uploads go through `media.service.js`
  with paths `${userId}/...`. Existing storage policies allow authenticated
  uploads but it is unclear (without inspecting each policy's USING/CHECK)
  whether the path-prefix check is enforced.
- **After Step 2:** unchanged on the storage side.
- **Action item (Step 3 in apply plan):** in the dashboard, audit each
  bucket's INSERT policy to confirm
  `(storage.foldername(name))[1] = auth.uid()::text` is present. The
  app already produces compatible paths, so this is a tightening with no
  client-side change required.
- **Bucket vs. RLS:** since the buckets are public, anyone with a URL can
  download the media. Visibility is enforced at the **post / story row**
  level (you can't get the URL unless you can see the row). This matches
  Instagram / Twitter and is the intended model.

## 13. Public vs followers vs private visibility

- **Today:** correct for posts and stories. Incorrect for profiles, board
  contents, reposts, likes, comments, and story viewer lists (all
  `qual=true`).
- **After Step 2:** correct everywhere.
- **Edge case:** **follower counts on someone else's profile are broken
  today and remain broken after Step 2** because the friendships SELECT
  policy only allows you to see rows where you are a participant. The
  `getFollowCounts(profileId)` call in `profiles.service.js` returns 0/0
  for any profile that isn't yours.
  - Fix would be a follow-up: either add a `friendships_public_count`
    SECURITY DEFINER function that bypasses RLS to return counts, or
    relax the SELECT policy to also allow rows with `status='accepted'`
    when the row's user_id corresponds to a public profile. Document this
    rather than fix in Phase 3.

---

## Summary — most likely places to break first

In rough order of probability after Step 2 ships:

1. **Profile page on a private profile** — needs a graceful "private profile"
   state when `getProfileByUsername()` returns null.
2. **Follower / following counts** on someone else's profile — already broken
   today, not made worse but should be addressed in a follow-up.
3. **Reposting / liking a post that just went `private`** — will start
   returning RLS errors. Frontend should treat any insert error as a
   "no longer available" state.
4. **Notifications insert race** if an action's commit somehow lags. Today
   each call is sequential within a single tab, so this should not happen.

## Still depending on frontend assumptions after Step 2

- `getVisiblePostIds()` in `posts.service.js` — redundant once Step 2 is
  live; safe to remove in Phase 8.
- Profile-page UI hiding `bio` / `playlist_url` / etc. for private profiles
  — redundant once Step 2 hides those columns at the row level. Safe to
  keep for now.
- `getRelationshipStatus` block check — duplicates the DB block check; UX
  hint only.
- `notifyAction()` — still client-trusted in terms of *what* type it asserts.
  The DB now requires a justifying row, so the worst-case is a notification
  with the wrong `type` if the actor performed multiple actions. Real fix
  is the Phase 7 Edge Function.

## Schema / RLS / storage changes still pending

- Step 2 (`0002_phase3_strict_policies.sql`) — paste-ready, NOT applied.
- Storage bucket policy audit (Step 3 in apply plan) — manual dashboard
  review.
- Friendships SELECT policy relaxation for public-profile follower counts —
  follow-up, not blocking Phase 3.
- `posts.visibility` `NOT NULL` — currently nullable, default is `'public'`.
  Backfill any rows where it's NULL, then `ALTER COLUMN ... SET NOT NULL`.
  Same for `boards.visibility`, `profile_privacy`.

## What should later move to Edge Functions (Phase 7)

- `notifyAction()` body → `supabase.functions.invoke('notify', ...)` with
  service-role insert. Once that ships, drop `notifications_insert` policy.
- `addRepost` → atomic Edge Function (`reposts` + `board_posts` +
  `notifications` in one transaction).
- Story expiry cleanup → pg_cron (`delete from stories where expires_at < now()`)
  or scheduled Edge Function.
