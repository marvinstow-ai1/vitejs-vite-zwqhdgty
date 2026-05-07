import { supabase } from '../supabase.js'

// =============================================================================
// Trusted-action seam for notifications.
//
// PHASE 3: notifications are still created by direct client INSERT. This is a
// known trust gap (a malicious client can forge notifications). See
// docs/PHASE3_RLS_AUDIT.md §A4.
//
// PHASE 7 plan: replace the body of `notifyAction()` with a call to an Edge
// Function that uses the service role key and validates that the actor really
// performed the like/comment/repost/follow. When that lands, every call site
// keeps working unchanged because they all go through this single seam.
//
// DO NOT add `supabase.from('notifications').insert(...)` anywhere else.
// =============================================================================

const VALID_TYPES = new Set(['like', 'comment', 'repost', 'follow'])

/**
 * Records a notification for `toUserId` triggered by `fromUserId`.
 * Self-notifications are dropped.
 *
 * @param {string} toUserId
 * @param {string} fromUserId
 * @param {'like'|'comment'|'repost'|'follow'} type
 * @param {string|null} postId
 */
export async function notifyAction(toUserId, fromUserId, type, postId = null) {
  if (!toUserId || !fromUserId) return
  if (toUserId === fromUserId) return
  if (!VALID_TYPES.has(type)) return

  // TODO(phase7): swap this body for `supabase.functions.invoke('notify', {...})`.
  await supabase.from('notifications').insert({
    user_id: toUserId,
    from_user_id: fromUserId,
    type,
    post_id: postId,
    read: false,
  })
}
