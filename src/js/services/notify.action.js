import { supabase } from '../supabase.js'

// Trusted-action seam for notifications. All notification writes go through
// the `notify` Edge Function, which validates the actor against the
// like/comment/repost/follow row before inserting via service-role.
// DO NOT add `supabase.from('notifications').insert(...)` anywhere else.

const VALID_TYPES = new Set(['like', 'comment', 'repost', 'follow'])

/**
 * Records a notification for `toUserId` triggered by `fromUserId`.
 * Self-notifications are dropped. `fromUserId` is kept in the signature for
 * call-site clarity but the Edge Function derives the actor from the JWT.
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

  await supabase.functions.invoke('notify', {
    body: { to_user_id: toUserId, type, post_id: postId },
  })
}
