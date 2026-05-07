# Phase 3 — Apply Plan (RLS rollout)

Status: **plan only**. The migration `supabase/migrations/0001_phase3_rls.sql`
has **not** been applied yet. This document is the human checklist for taking
that draft live without locking the app out of its own data.

It is paired with:
- `docs/PHASE3_RLS_AUDIT.md` — rationale for every policy
- `supabase/migrations/0001_phase3_rls.sql` — the SQL itself
- `docs/ROADMAP.md` — Phase-3 task list

---

## 0. Phase-6 product decisions baked into this rollout

The Phase-6 questions are answered (see `ROADMAP.md`):

1. `/` is the **home feed for logged-in users, login gate for guests**.
   → No anonymous SELECT path needed. `posts_select` stays bound to
   `auth.uid()`.
2. Social graph = **follows + follow requests for private profiles**.
   → `friendships.status ∈ {accepted, pending}`. `is_following(...)` only
   counts `accepted`. The auto-accept-vs-pending rule for inserts is a
   **follow-up trigger**, not in this migration. See §6.
3. Messages = **placeholder route only**.
   → No `conversations` / `messages` tables, no new policies.

These decisions do **not** require any change to the SQL block ordering below.

---

## 1. Pre-flight checklist (before touching prod)

- [ ] Take a fresh logical backup / snapshot of the Supabase project.
- [ ] Read `PHASE3_RLS_AUDIT.md` end-to-end.
- [ ] Open `supabase/migrations/0001_phase3_rls.sql` in the SQL editor and
      diff every block against the live schema. The migration assumes the
      base tables already exist with the columns the frontend uses; it only
      adds constraints, indexes, defaults, helper functions and policies.
- [ ] Spin up a Supabase **branch** (preview DB) and apply blocks 1–3 there
      first. Do **not** apply to production until the branch is green.
- [ ] Confirm storage buckets `images`, `videos`, `headers`, `stories` exist
      and that their current public/private setting matches the assumption
      in §D.7 of the audit (public read, authenticated upload to own folder).

## 2. Apply order (mandatory — do not reorder)

The migration is structured as four blocks. They must be applied in this
order, with verification between blocks.

### Block 1 — Schema hardening (non-breaking)

Constraints (`NOT VALID`), defaults, indexes. Safe to apply on a live DB:
existing rows are not validated, new writes are.

- [ ] Apply Block 1 on the branch.
- [ ] Run a backfill pass for each `NOT VALID` constraint, then
      `ALTER TABLE … VALIDATE CONSTRAINT …`. Specifically:
  - [ ] `posts.visibility` — backfill any non-`{public,followers,private}`
        values to `'public'`, then validate.
  - [ ] `boards.visibility` — same.
  - [ ] `profiles.profile_privacy` — same.
  - [ ] `friendships.status` — backfill `NULL`/unknown to `'accepted'`, validate.
  - [ ] `notifications.type` — backfill unknown types or drop them, validate.
- [ ] After backfill: `UPDATE reposts SET show_on_profile = true WHERE
      show_on_profile IS NULL;` then `ALTER TABLE reposts ALTER COLUMN
      show_on_profile SET NOT NULL;`.

### Block 2 — Helper functions

Creates `is_following`, `is_blocked_either_way`, `can_view_post`. Pure
additions; no behavior change.

- [ ] Apply Block 2.
- [ ] Smoke-test each function in the SQL editor:
      `select public.is_following('<some-uuid>');` etc.

### Block 3 — RLS enable + policies (THE BREAKING STEP)

This is where the app becomes RLS-enforced. **Do this table-by-table** so
that if a policy is wrong, only one table goes dark.

Recommended sub-order (least to most coupled):

- [ ] `notifications` — own-rows-only is the simplest; verify badge still
      loads after enabling.
- [ ] `blocks` — own-rows-only.
- [ ] `friendships` — both sides may read; verify follower/following counts
      and follow button states.
- [ ] `profiles` — verify own profile loads, public profiles load, private
      profiles hide bio/header for non-followers.
- [ ] `posts` — verify feed, profile grid, single-post views.
- [ ] `boards`, `board_posts` — verify board pages and "add to board" flow.
- [ ] `reposts` — verify profile reposts grid and repost modal.
- [ ] `stories`, `story_views` — verify story ring, viewer list visible only
      to owner.
- [ ] `likes`, `comments` — verify like toggle and comment insert still
      respect post visibility (RLS WITH CHECK joins back to posts).

For each table, after enabling:

1. Try the action as a logged-in **non-owner**. Expect: filtered correctly.
2. Try the action as an **owner**. Expect: works.
3. Try a forged write (e.g. like on a private post you can't see). Expect:
   `42501` insufficient privilege.

### Block 4 — Storage policies

Storage `objects` policies live in the `storage` schema and need to be
created via the dashboard or a separate SQL block. Pattern in the audit
§D.7.

- [ ] `images` — authenticated insert into `<auth.uid()>/…`, public select.
- [ ] `videos` — same.
- [ ] `headers` — same.
- [ ] `stories` — same.

## 3. Frontend follow-ups after RLS is live

Once RLS is enforcing visibility, the frontend can stop pretending it does:

- [ ] `getVisiblePostIds()` in `posts.service.js` is downgraded to a UX hint
      (already documented as such) or removed entirely.
- [ ] `loadFeedPosts()` can stop filtering by `user_id IN (self, ...followed)`
      — a plain `posts.select(...)` is now safe and lets followers-only posts
      from non-followed-but-followed-back accounts behave correctly.
- [ ] Block-aware filtering on profile/board/feed becomes "trust the DB",
      remove redundant client checks.
- [ ] `notify.action.js` is the single place to swap from direct insert to
      Edge Function once Phase 7 lands. The short-term notifications INSERT
      policy in Block 3 is the safety net until then.

## 4. Rollback plan

If any block goes wrong:

- Block 1: drop the offending constraint / index. Defaults are safe.
- Block 2: `drop function public.is_following(uuid);` etc.
- Block 3: `alter table <t> disable row level security;` immediately
  restores prior behavior. Drop the failing policy with
  `drop policy <name> on <t>;`.
- Block 4: drop the storage policy in the dashboard.

Do **not** roll back Block 1 backfills — the data is now consistent and
that's worth keeping.

## 5. Known not-in-this-migration items

These are intentionally deferred to later phases and must NOT be silently
added to this migration without updating the audit:

- Auto-accept vs. pending follow-request trigger (Phase 6 follow-up).
- Edge Function for notifications (Phase 7).
- Atomic repost (`reposts` + `board_posts` + notification) (Phase 7).
- Story expiry via pg_cron / scheduled Edge Function (Phase 7).
- Conversations / messages tables (Messages is placeholder-only for now).

## 6. Phase-6 follow-up: friendships INSERT rule

When the auto-accept-vs-pending trigger lands, it should:

```sql
create or replace function public.friendships_set_status()
returns trigger language plpgsql as $$
declare
  target_privacy text;
begin
  select profile_privacy into target_privacy
    from public.profiles where id = new.friend_id;

  if target_privacy = 'private' then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end$$;

create trigger friendships_set_status_trg
before insert on public.friendships
for each row execute function public.friendships_set_status();
```

Plus: tighten `friendships_insert` RLS WITH CHECK to forbid the actor from
hand-setting `status='accepted'` against a private profile (the trigger will
overwrite anyway, but defense in depth).

This lives in a follow-up migration, not in `0001_phase3_rls.sql`.
