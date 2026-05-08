-- =============================================================================
-- Phase 3 follow-up — notifications insert via Edge Function only
-- =============================================================================
-- Apply this AFTER:
--   1. Edge Function `notify` is deployed and reachable.
--   2. Frontend bundle that calls supabase.functions.invoke('notify', ...) is
--      live for all users (otherwise old clients still trying direct INSERT
--      will silently fail).
-- =============================================================================

drop policy if exists notifications_insert on public.notifications;
