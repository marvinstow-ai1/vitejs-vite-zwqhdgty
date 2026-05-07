# Phase 3 — RLS / Schema / Permissions Audit

Status: **draft, code-informed audit only**.
No schema changes have been applied to the live Supabase project from this pass.
The accompanying SQL migration in `supabase/migrations/0001_phase3_rls.sql` is a
**proposal**, not an applied migration.

This document captures, per table:
- what the frontend currently reads/writes
- ownership and visibility assumptions encoded in code
- the trust gap if RLS is missing or permissive
- what the RLS policy should look like (intent, not final SQL)
- columns that need defaults, constraints, or indexes

Schema is inferred from code only — there are no SQL files in the repo. Anywhere
this audit guesses, it is marked **assumption**.

---

## Tables in use

Inferred from grep of `supabase.from(...)` across `src/js`:

| Table          | Read | Insert | Update | Delete |
|----------------|------|--------|--------|--------|
| profiles       | ✓    | (auth trigger?) | ✓ | — |
| posts          | ✓    | ✓ | — | — |
| boards         | ✓    | ✓ | ✓ | ✓ |
| board_posts    | ✓    | ✓ | — | ✓ |
| reposts        | ✓    | ✓ | — | ✓ |
| stories        | ✓    | ✓ | — | ✓ |
| story_views    | ✓    | ✓ | — | — |
| friendships    | ✓    | ✓ (upsert) | — | ✓ |
| blocks         | ✓    | ✓ | — | ✓ |
| likes          | ✓    | ✓ | — | ✓ |
| comments       | ✓    | ✓ | — | — |
| notifications  | ✓    | ✓ | ✓ (read) | — |

Storage buckets in use: `images`, `videos`, `headers`, `stories`.

---

## A. Trust boundary audit

### A1. Frontend-only visibility (NOT a security boundary)

`getVisiblePostIds(posts, currentUserId)` in `src/js/services/posts.service.js`
filters returned posts by `visibility ∈ {public, followers, private}` *after*
they have already been returned by the database. This is **purely cosmetic**:
- a malicious client can call `supabase.from('posts').select('*')` directly
- with no RLS, every private and followers-only post is readable
- with overly permissive RLS, the same hole exists server-side

This must move behind RLS. The frontend filter should remain only as a UX hint
(e.g. to drop posts the API returned that the user shouldn't render), not as
the security boundary.

### A2. Feed query

`loadFeedPosts()` selects `posts.*` for `user_id IN (self, ...followed)`. With
RLS in place, this query becomes safe regardless of `visibility`, because RLS
will already filter rows the viewer is not allowed to see.

Without RLS, the query still returns *every* post by every followed user
including their `private` ones — because the visibility check happens only on
the client.

### A3. Likes / comments / reposts inserts

`toggleLike`, `insertComment`, `addRepost`, `addPostToBoard` all insert without
checking that the source post is visible to the actor. RLS must enforce:
"INSERT into likes/comments/reposts/board_posts is allowed only if the actor
can SELECT the underlying post."

This is the canonical "WITH CHECK that joins back to posts" pattern.

### A4. Notifications are client-trusted

`createNotification(toUserId, fromUserId, type, postId)` is a direct
`supabase.from('notifications').insert(...)` from the client. A malicious user
can:
- forge "@victim hat deinen Post geliked" notifications
- spam any user with arbitrary notifications
- impersonate any `from_user_id`

Mitigation path:
- short-term: add an INSERT RLS policy that requires
  `from_user_id = auth.uid()` and that there is a corresponding
  like/comment/repost/follow row that justifies the notification.
- long-term: move notification creation into Edge Functions or DB triggers,
  remove direct client INSERT entirely.

The codebase isolates this in `src/js/services/notify.action.js` so the future
move is a single-file change.

### A5. Repost / board redundancy

`addRepost()` writes to **two** tables: `reposts` and `board_posts` (always
into the auto-`Reposts` board, plus optionally another board). These are not
in a transaction — partial failure leaves one table consistent and the other
not.

Long-term this should be one Edge Function or one Postgres function
(`SECURITY DEFINER`) that does all writes atomically.

### A6. Story views

`markStoryViewed(storyId, userId)` inserts directly. A malicious user can
record views for stories they cannot see, and can mark themselves as viewer
for stories that block them. RLS must check viewer can SELECT the story.

Story-viewer list (`getStoryViewers`) is sensitive — only the story owner
should be able to read `story_views` for a given `story_id`. RLS must enforce
that.

### A7. Story expiry

Stories filter `expires_at > now()` on every read. Expired stories are still
in the table and still readable by anyone with direct API access (modulo RLS).
Long-term: a server-side cleanup (Edge Function on schedule, or pg_cron) should
delete or archive expired stories rather than relying on client-side filters.

### A8. Profiles by username

`getProfileByUsername()` reads the entire `profiles` row. There is no
column-level filtering for `private` profiles — a viewer of a private profile
still gets `bio`, `playlist_url`, `header_*` etc., even though the page hides
them. RLS at the row level can lock this down to: "SELECT a profile iff
viewer is owner / public / follower-and-followers-mode".

### A9. Boards visibility

`getBoardsByUser()` returns ALL boards for a profile, including
`visibility = 'private'`. `loadBoardContent` joins through `board_posts ->
posts`. Without RLS, a non-follower can read every private board's posts.

### A10. Follow / friendships

`friendships(user_id, friend_id, status)` is currently used as a **one-directional
follow** with `status = 'accepted'` on insert. There is **no follow-request flow**
(everything is auto-accepted). The model is effectively "follows".

Open product question (Phase 6): does this stay pure follows, or do private
profiles get follow-requests? The schema can support both with the existing
`status` column. **No migration needed today** — but the audit recommends:

- enforce `CHECK (status IN ('accepted', 'pending'))` at DB level
- if pure-follows is the final answer, consider renaming the table to `follows`
  in a later migration

### A11. Blocks

`blocks(blocker_id, blocked_id)` — ownership of a block row is `blocker_id`.
RLS gaps:
- a viewer can today read the entire `blocks` table (audit assumption)
- with RLS, a blocked user must NOT see posts/profile/board/stories of the
  blocker. This is best implemented inside each table's RLS policy as
  `NOT EXISTS (SELECT 1 FROM blocks WHERE ...)`.

---

## B. Schema readiness

### B1. Constraints / defaults likely needed

| Column                          | Issue                                  | Proposed |
|---------------------------------|----------------------------------------|----------|
| `posts.visibility`              | free text in code                      | `CHECK IN ('public','followers','private')` + default `'public'` + `NOT NULL` |
| `boards.visibility`             | same as posts                          | same constraint |
| `profiles.profile_privacy`      | same as posts                          | same constraint |
| `reposts.show_on_profile`       | inserted as boolean                    | `NOT NULL DEFAULT true` |
| `friendships.status`            | currently always `'accepted'`          | `CHECK IN ('accepted','pending')` + default `'accepted'` |
| `notifications.read`            | inserted as `false`                    | `NOT NULL DEFAULT false` |
| `notifications.type`            | free text                              | `CHECK IN ('like','comment','repost','follow')` |
| `stories.expires_at`            | computed in client                     | `DEFAULT now() + interval '24 hours'` |

### B2. Foreign keys + cascade

Best-guess current state vs recommendation. **Assumption**: most FKs already
exist but cascade behavior is inconsistent.

| FK                                  | Recommendation         |
|-------------------------------------|------------------------|
| `posts.user_id -> profiles.id`      | ON DELETE CASCADE      |
| `board_posts.board_id -> boards.id` | ON DELETE CASCADE      |
| `board_posts.post_id -> posts.id`   | ON DELETE CASCADE      |
| `board_posts.user_id -> profiles.id`| ON DELETE CASCADE      |
| `reposts.post_id -> posts.id`       | ON DELETE CASCADE      |
| `reposts.user_id -> profiles.id`    | ON DELETE CASCADE      |
| `likes.post_id -> posts.id`         | ON DELETE CASCADE      |
| `likes.user_id -> profiles.id`      | ON DELETE CASCADE      |
| `comments.post_id -> posts.id`      | ON DELETE CASCADE      |
| `comments.user_id -> profiles.id`   | ON DELETE CASCADE      |
| `stories.user_id -> profiles.id`    | ON DELETE CASCADE      |
| `story_views.story_id -> stories.id`| ON DELETE CASCADE      |
| `story_views.user_id -> profiles.id`| ON DELETE CASCADE      |
| `friendships.user_id`/`friend_id`   | ON DELETE CASCADE      |
| `blocks.blocker_id`/`blocked_id`    | ON DELETE CASCADE      |
| `notifications.user_id`/`from_user_id` | ON DELETE CASCADE   |

### B3. Uniqueness

| Table        | Unique key                          |
|--------------|-------------------------------------|
| profiles     | `username` (lowercase)              |
| likes        | `(post_id, user_id)`                |
| reposts      | `(post_id, user_id)`                |
| board_posts  | `(board_id, post_id)`               |
| story_views  | `(story_id, user_id)`               |
| friendships  | `(user_id, friend_id)`              |
| blocks       | `(blocker_id, blocked_id)`          |

The repost/board_posts code already relies on `error.code === '23505'`
(unique violation) being thrown, so these uniques exist in the live DB
already.

### B4. Indexes for RLS performance

Any column referenced in an RLS policy `USING` clause should be indexed,
otherwise every SELECT becomes a full scan.

| Index                                                    | Why |
|----------------------------------------------------------|-----|
| `posts (user_id, created_at DESC)`                       | feed |
| `posts (user_id, visibility)`                            | RLS visibility check |
| `friendships (user_id, friend_id, status)`               | follow check (forward) |
| `friendships (friend_id, user_id, status)`               | follow check (reverse, follower count) |
| `blocks (blocker_id, blocked_id)`                        | block check |
| `blocks (blocked_id, blocker_id)`                        | reverse block check |
| `likes (post_id)`                                        | counts + RLS |
| `comments (post_id, created_at)`                         | listing |
| `reposts (user_id, show_on_profile, created_at DESC)`    | profile reposts grid |
| `board_posts (board_id, position)`                       | board ordering |
| `story_views (story_id)`                                 | viewer list |
| `notifications (user_id, read, created_at DESC)`         | unread badge + listing |
| `stories (user_id, expires_at)`                          | active stories |

---

## C. Implemented in this pass (frontend only — no DB changes)

1. **Trusted-action seam for notifications**
   - New file: `src/js/services/notify.action.js` containing `notifyAction()`.
   - All call sites (`feed.page.js`, `profile.page.js`, `interactions.service.js`)
     route through this seam.
   - `interactions.service.js#createNotification` is now a thin wrapper that
     calls `notifyAction()`. Marked `@deprecated`.
   - When the Edge Function lands, only `notify.action.js` changes.

2. **Media upload service**
   - New file: `src/js/services/media.service.js` with:
     - `uploadPostMedia(file, userId)` (replaces inline composer logic)
     - `uploadHeaderImage(file, userId)`
     - `uploadStoryFile(file, userId)` (re-export of existing function)
   - Composer in `feed.page.js` and header upload in `profile.page.js` updated
     to use the service.
   - Storage permissions still rely on bucket-level Storage RLS — see Section D.

3. **Centralized visibility hint**
   - `getVisiblePostIds()` keeps its name but is documented as a UX-only filter,
     not a security boundary. Header comment links to this doc.
   - New `getBlockedSets()` helper in `profiles.service.js` consolidates the
     two-query pattern in `profile.page.js`.

4. **Direct Supabase calls in pages reduced**
   - `feed.page.js`: composer post-insert no longer bypasses `posts.service`.
   - `board.page.js`: `_handleBoardRepost` board fetch moved to
     `boards.service.getBoardsByUser`.
   - `settings.page.js`: blocks listing moved to `getMyBlocks` in
     `profiles.service.js`.

These changes are all behind existing function signatures or are pure
extractions. None alter user-visible behavior. None change the database.

---

## D. Not changed in this pass — explicit list

The following items were audited and are documented but **not** modified by
this pass, because they require either (a) a database migration that should
be reviewed and applied through the Supabase dashboard, or (b) Edge Functions:

1. RLS policies — see `supabase/migrations/0001_phase3_rls.sql` (draft).
2. CHECK constraints / NOT NULL / defaults — same draft.
3. Indexes for RLS — same draft.
4. Edge Function for notifications — Phase 7.
5. Atomic repost via DB function or Edge Function — Phase 7.
6. Story expiry cleanup via pg_cron or Edge Function — Phase 7.
7. Storage bucket RLS for `images`, `videos`, `headers`, `stories` — needs
   to be configured in the Supabase dashboard. Recommended pattern:
   - upload requires authenticated user, path must start with their `auth.uid()/`
   - read is public for `images`, `videos`, `headers`, `stories` since URLs
     are stored in posts/stories rows; visibility is enforced at the row level
     (not the storage level), which matches Instagram/Twitter-style sharing
     where the media URL is technically world-readable.

---

## E. Phase-6 product decisions (resolved) and their RLS impact

The Phase-6 product questions have been answered. Summary of how they affect
the migration draft:

1. **`/` landing behavior — Home Feed for logged-in users, login gate for guests.**
   The app today does not render public content for anonymous visitors
   (`init()` calls `showLogin` when there is no session). The migration's
   SELECT policies therefore stay tied to `auth.uid()` — there is **no
   anonymous read path**. If an anonymous public-post landing is added later,
   the `posts` SELECT policy must be widened with an `OR (auth.uid() IS NULL
   AND visibility = 'public' AND NOT EXISTS …blocks…)` branch. **No change
   needed in the current draft.**

2. **Social graph — Follows + Follow-Requests for private profiles.**
   The schema already supports both states via `friendships.status` and the
   draft's `CHECK (status IN ('accepted','pending'))`. Visibility predicates
   (`is_following`, follower-only posts/boards/stories) already filter on
   `status = 'accepted'`, so a pending request grants no read access — exactly
   what we want. **Open follow-up the migration draft does NOT yet enforce:**
   - on INSERT into `friendships`, the row's `status` must depend on the
     target profile's `profile_privacy`:
     - target is `public` or `followers` → `status = 'accepted'` (auto-follow)
     - target is `private` → `status = 'pending'` (request, owner must accept)
   - the cleanest place for this is a `BEFORE INSERT` trigger on
     `friendships` (or a `SECURITY DEFINER` Edge Function). This is **not**
     in `0001_phase3_rls.sql` yet — see Phase 6/7 follow-ups in the roadmap.
   - the existing `friendships_insert` policy currently allows any value of
     `status`. Once the trigger is in place, we should additionally lock the
     RLS WITH CHECK to forbid the actor from inserting `status='accepted'`
     toward a private profile, e.g.
     `(NOT (status = 'accepted' AND target_profile_privacy = 'private'))`.
   - `loadFeedPosts` already calls `getFollowedIds()` filtering on
     `status = 'accepted'` (verify in service); pending requests must NOT
     leak follower-only content into the feed.

3. **Messages — placeholder route only.** No new tables, no new policies in
   this migration. `/messages` is wired to a static placeholder page; the
   eventual `conversations` / `messages` schema and its RLS will be a separate
   migration when DMs are actually built.

---

## F. Summary: what depends on frontend trust today

| Path                                | Frontend trust today | RLS replaces? |
|-------------------------------------|----------------------|---------------|
| `getVisiblePostIds` post filter     | yes                  | yes           |
| Block-aware visibility on profile   | yes                  | yes           |
| `loadFeedPosts` allowed user_ids    | partial              | yes           |
| `getProfileByUsername` private bio  | yes                  | yes           |
| `getBoardsByUser` private boards    | yes                  | yes           |
| `getProfileReposts` repost privacy  | yes                  | yes           |
| `markStoryViewed` story access      | yes                  | yes           |
| `getStoryViewers` owner-only        | yes                  | yes           |
| `createNotification` actor identity | yes                  | partial → Edge|
| Repost atomicity                    | n/a                  | Edge          |
| Story expiry                        | yes                  | pg_cron/Edge  |

Everything else (`signIn`, `signUp`, `setUsername`, profile updates) already
runs against `auth.uid()` and is RLS-safe with simple owner policies.
