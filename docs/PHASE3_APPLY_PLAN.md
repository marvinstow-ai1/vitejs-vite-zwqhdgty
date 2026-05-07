# Phase 3 — Apply Plan

This document is the rollout sequence for the Phase 3 RLS / schema work.
It mirrors the live state of the Supabase project as of this session and
supersedes the earlier "draft only" state of the audit.

For the SQL itself, see:
- `supabase/migrations/0001_phase3_rls.sql` — original audit-aligned proposal.
  **Historical reference only**; parts are already redundant against the live DB.
- `supabase/migrations/0002_phase3_strict_policies.sql` — paste-ready follow-up
  that tightens the wide-open SELECT/INSERT policies.

For the per-flow verification, see `docs/PHASE3_VERIFICATION.md`.

---

## Live state at start of this pass

What the Supabase MCP tools showed about the moodboard project:

- All public tables already have **RLS enabled**.
- Strict-enough policies already exist for:
  - `posts.posts_select_visibility` (visibility + block-aware)
  - `stories.stories_select_visibility` (visibility + block-aware + expiry)
  - `boards.Boards lesen` (visibility-aware, no block check)
  - `friendships.users can view own friendships` (either side)
  - `friendships.users can create friendship requests involving themselves`
    (block-aware)
  - `blocks.blocks_*_own` (owner-only, both directions for SELECT)
  - `notifications.users can view own notifications` (owner-only)
  - `notifications.users can update own notifications` (owner-only)
- CHECK constraints already exist on:
  - `posts.visibility` ∈ (public, followers, private)
  - `boards.visibility` ∈ (public, followers, private)
  - `profiles.profile_privacy` ∈ (public, followers, private)
  - `friendships.status` ∈ (pending, accepted)
- Defaults already in place for:
  - `posts.visibility` → 'public'
  - `boards.visibility` → 'public'
  - `profiles.profile_privacy` → 'public'
  - `reposts.show_on_profile` → true
  - `stories.expires_at` → now() + 24h
  - `notifications.read` → false
- Unique indexes in place: likes, reposts, board_posts, friendships, blocks,
  story_views, profiles.username.

**Real gaps remaining (the actually-dangerous ones):**

| Table        | Gap                                                          |
|--------------|--------------------------------------------------------------|
| profiles     | Two `qual=true` SELECT policies — every profile readable     |
| board_posts  | `qual=true` SELECT — every board's post list readable        |
| reposts      | `qual=true` SELECT — every repost readable                   |
| likes        | `qual=true` SELECT — likes-by-user globally enumerable       |
| comments     | `qual=true` SELECT (3 dupes) — comments globally readable    |
| story_views  | `qual=true` SELECT — viewer list readable by **anyone**      |
| notifications| INSERT policy permits `from_user_id` spoofing if `user_id=auth.uid()` |

Plus minor cleanup of duplicate INSERT/DELETE policies on `comments`.

---

## Rollout — what happens in which order

### Step 1 — applied via MCP `apply_migration` (this session)

Migration name: **`phase3_visibility_helpers_and_indexes`**

Adds, idempotently and non-breakingly:

- SECURITY DEFINER helpers `is_following`, `is_blocked_either_way`,
  `can_view_post` — used by Step 2 policies.
- Performance indexes:
  - `notifications (user_id, read, created_at desc)` — unread badge
  - `posts (user_id, created_at desc)` — feed
  - `friendships (user_id, friend_id, status)` and reverse
  - `profiles (lower(username))`
  - `reposts (user_id, show_on_profile, created_at desc)`
  - `comments (post_id, created_at)`
  - `board_posts (board_id, position)`

Status: **APPLIED**.

Rollback (only if needed):
```sql
drop function if exists public.can_view_post(uuid, text);
drop function if exists public.is_following(uuid);
drop function if exists public.is_blocked_either_way(uuid);
drop index if exists public.notifications_user_read_created_idx;
-- …etc. for the other indexes
```

### Step 2 — pending (paste-ready in `0002_phase3_strict_policies.sql`)

Drops the wide-open SELECT/INSERT policies and replaces them with strict
visibility-aware ones using the Step 1 helpers. Idempotent. Apply table-by-
table or in one shot.

Apply via the SQL editor in the Supabase dashboard, or via
`supabase db execute` against the migration file.

**Recommended order if applying piecemeal:**

1. `profiles_select` — narrowest blast radius; verify profile pages still load
   for the four flows in `PHASE3_VERIFICATION.md`.
2. `board_posts_select` + `board_posts_insert` — verify board page renders.
3. `reposts_select` + `reposts_insert` — verify reposts grid on profile.
4. `likes_select` + `likes_insert` — verify like counts on feed.
5. `comments_select` + `comments_insert` — verify comments modal.
6. `story_views_select` + `story_views_insert` — verify story viewer list
   is owner-only.
7. `notifications_insert` — verify a like still creates a notification.
8. Final cleanup of duplicate `comments_*` INSERT/DELETE policies.

After each block, smoke-test the affected flow. If anything breaks, the
rollback is the inverse drop+create — see the comment block at the top of
`0002_phase3_strict_policies.sql`.

### Step 3 — pending (storage policies)

The `images`, `videos`, `headers`, `stories` buckets are public and have
upload/select/delete policies in place (mostly legacy German names). The
gaps to close:

- Confirm every upload policy enforces
  `(storage.foldername(name))[1] = auth.uid()::text` so a user can only
  write into their own folder. The app's `media.service.js` already produces
  paths shaped that way (`${userId}/...`), so this is enforceable.
- Drop the `anon upload moodboard` / `public insert moodboard` policies if
  the moodboard bucket is no longer used by this social app (it predates the
  refactor — verify before touching).
- Remove the `covers` bucket from rotation if unused, or document its purpose.

These are best done in the dashboard UI rather than as a migration, since
storage policies live in `storage.objects` and require service-role privileges.

### Step 4 — Phase 7 (deferred)

- Replace `notifyAction()` body with an Edge Function call. Once that ships,
  drop `notifications_insert` policy entirely.
- Make repost atomic via DB function or Edge Function.
- Move story expiry to pg_cron / scheduled Edge Function.

These do not block Phase 3.

---

## Safety notes

- The migration file is idempotent; running it twice is safe.
- Every `drop policy if exists` is paired with the matching `create policy`
  in the same block, so there is no window where a table is "RLS enabled
  with no SELECT policy" (which would deny all reads).
- The CHECK constraints in the original `0001_phase3_rls.sql` are already
  in production. Do **not** re-run those — they would error with
  "constraint already exists".
- The original `0001` proposal also calls `enable row level security` on
  every table; this is harmless but unnecessary (RLS is already on).
