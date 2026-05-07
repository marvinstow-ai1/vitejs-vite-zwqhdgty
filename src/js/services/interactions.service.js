import { supabase } from '../supabase.js'

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * Erstellt eine Benachrichtigung (ignoriert self-notifications).
 */
export async function createNotification(toUserId, fromUserId, type, postId = null) {
  if (toUserId === fromUserId) return
  await supabase.from('notifications').insert({
    user_id: toUserId,
    from_user_id: fromUserId,
    type,
    post_id: postId,
    read: false,
  })
}

// ─── Likes ────────────────────────────────────────────────────────────────────

/**
 * Gibt die aktuelle Like-Anzahl eines Posts zurück.
 */
export async function getLikeCount(postId) {
  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)
  return count ?? 0
}

/**
 * Toggled einen Like auf einem Post.
 * Gibt { newLiked, error } zurück.
 */
export async function toggleLike(postId, currentUserId, currentlyLiked, ownerId) {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', currentUserId)
    return { newLiked: false, error }
  } else {
    const { error } = await supabase
      .from('likes')
      .insert({ post_id: postId, user_id: currentUserId })
    if (!error && ownerId) {
      await createNotification(ownerId, currentUserId, 'like', postId)
    }
    return { newLiked: true, error }
  }
}

// ─── Reposts ──────────────────────────────────────────────────────────────────

/**
 * Holt oder erstellt das automatische "Reposts"-Board für einen User.
 */
export async function getOrCreateRepostsBoardId(userId) {
  const { data: existing } = await supabase
    .from('boards')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'Reposts')
    .maybeSingle()
  if (existing?.id) return existing.id
  const { data: created, error } = await supabase
    .from('boards')
    .insert({ user_id: userId, title: 'Reposts', visibility: 'public', position: 999 })
    .select('id')
    .single()
  if (error) { console.error('create reposts board failed', error); return null }
  return created.id
}

/**
 * Fügt einen Repost ein und legt ihn ins Reposts-Board (+ optionales weiteres Board).
 */
export async function addRepost(postId, currentUserId, ownerId, { boardId, showOnProfile }) {
  const { error: repErr } = await supabase
    .from('reposts')
    .insert({ post_id: postId, user_id: currentUserId, show_on_profile: showOnProfile })
  if (repErr && repErr.code !== '23505') {
    console.error('repost insert failed', repErr)
    return { error: repErr }
  }
  const repostsBoardId = await getOrCreateRepostsBoardId(currentUserId)
  if (repostsBoardId) {
    const { error: rbErr } = await supabase
      .from('board_posts')
      .insert({ board_id: repostsBoardId, post_id: postId, user_id: currentUserId })
    if (rbErr && rbErr.code !== '23505') console.error('reposts board insert failed', rbErr)
  }
  if (boardId && boardId !== repostsBoardId) {
    const { error: bpErr } = await supabase
      .from('board_posts')
      .insert({ board_id: boardId, post_id: postId, user_id: currentUserId })
    if (bpErr && bpErr.code !== '23505') console.error('board_posts insert failed', bpErr)
  }
  if (ownerId) await createNotification(ownerId, currentUserId, 'repost', postId)
  return { error: null }
}

/**
 * Entfernt einen Repost und löscht ihn aus dem Reposts-Board.
 */
export async function removeRepost(postId, currentUserId) {
  const repostsBoardId = await getOrCreateRepostsBoardId(currentUserId)
  if (repostsBoardId) {
    await supabase
      .from('board_posts')
      .delete()
      .eq('board_id', repostsBoardId)
      .eq('post_id', postId)
      .eq('user_id', currentUserId)
  }
  return supabase
    .from('reposts')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', currentUserId)
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * Lädt alle Kommentare für einen Post inkl. Usernamen.
 */
export async function loadComments(postId) {
  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (!comments?.length) return []

  const userIds = [...new Set(comments.map(c => c.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)
  const usernameMap = {}
  profiles?.forEach(p => { usernameMap[p.id] = p.username })

  return comments.map(c => ({ ...c, username: usernameMap[c.user_id] || 'unknown' }))
}

/**
 * Fügt einen Kommentar ein.
 */
export async function insertComment(postId, userId, content) {
  return supabase.from('comments').insert({ post_id: postId, user_id: userId, content })
}

// ─── Follow / Block ───────────────────────────────────────────────────────────

export async function followUser(currentUserId, targetUserId) {
  return supabase
    .from('friendships')
    .upsert(
      { user_id: currentUserId, friend_id: targetUserId, status: 'accepted' },
      { onConflict: 'user_id,friend_id' }
    )
    .select()
    .single()
}

export async function unfollowUser(currentUserId, targetUserId) {
  return supabase
    .from('friendships')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', targetUserId)
}

export async function blockUser(blockerId, blockedId) {
  // Beidseitige Friendships entfernen
  await supabase
    .from('friendships')
    .delete()
    .or(`and(user_id.eq.${blockerId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${blockerId})`)
  return supabase
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
}

export async function unblockUser(blockerId, blockedId) {
  return supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
}
