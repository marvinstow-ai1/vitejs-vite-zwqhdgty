import { supabase } from '../supabase.js'

/**
 * Gibt alle followed User-IDs zurück (inkl. eigener ID optional).
 * @param {string} currentUserId
 * @returns {Promise<Set<string>>}
 */
export async function getFollowedIds(currentUserId) {
  if (!currentUserId) return new Set()
  const { data } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', currentUserId)
    .eq('status', 'accepted')
  return new Set(data?.map(f => f.friend_id) || [])
}

/**
 * Prüft ob currentUser dem targetUser folgt.
 * @param {string} currentUserId
 * @param {string} targetUserId
 * @returns {Promise<boolean>}
 */
export async function isFollowing(currentUserId, targetUserId) {
  if (!currentUserId) return false
  const { data } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('friend_id', targetUserId)
    .eq('status', 'accepted')
    .maybeSingle()
  return !!data
}

/**
 * Filtert Posts nach Sichtbarkeit für den aktuellen Viewer.
 * Gibt ein Set sichtbarer Post-IDs zurück.
 * @param {Array} posts
 * @param {string|null} currentUserId
 * @returns {Promise<Set<string>>}
 */
export async function getVisiblePostIds(posts, currentUserId) {
  const visible = new Set()
  if (!posts?.length) return visible
  const followerOnly = []
  for (const p of posts) {
    const vis = p.visibility || 'public'
    if (vis === 'public') { visible.add(p.id); continue }
    if (p.user_id === currentUserId) { visible.add(p.id); continue }
    if (vis === 'private') continue
    if (vis === 'followers') followerOnly.push(p)
  }
  if (followerOnly.length && currentUserId) {
    const ownerIds = [...new Set(followerOnly.map(p => p.user_id))]
    const { data: followedList } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', currentUserId)
      .eq('status', 'accepted')
      .in('friend_id', ownerIds)
    const followedSet = new Set(followedList?.map(f => f.friend_id) || [])
    for (const p of followerOnly) {
      if (followedSet.has(p.user_id)) visible.add(p.id)
    }
  }
  return visible
}

/**
 * Lädt Feed-Posts für einen User (eigene + gefollowte).
 * @param {string} currentUserId
 * @param {string|null} moodFilter
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function loadFeedPosts(currentUserId, moodFilter = null) {
  const followedSet = await getFollowedIds(currentUserId)
  const allowedIds = [currentUserId, ...followedSet]
  let query = supabase
    .from('posts')
    .select('*')
    .in('user_id', allowedIds)
    .order('created_at', { ascending: false })
    .limit(120)
  if (moodFilter) query = query.eq('mood', moodFilter)
  return query
}

/**
 * Fügt einen neuen Post ein.
 * @param {object} payload — { user_id, media_url, media_type, mood, visibility }
 */
export async function insertPost(payload) {
  return supabase.from('posts').insert(payload)
}

/**
 * Lädt Interaktionsdaten (likes, comments, reposts) für eine Liste von Post-IDs.
 * @param {string[]} postIds
 * @param {string} currentUserId
 */
export async function loadPostInteractions(postIds, currentUserId) {
  const [likesRes, commentsRes, repostsRes] = await Promise.all([
    supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
    supabase.from('comments').select('post_id').in('post_id', postIds),
    supabase.from('reposts').select('post_id, user_id').in('post_id', postIds),
  ])

  const likeCounts = {}
  const userLikedSet = new Set()
  const commentCounts = {}
  const repostCounts = {}
  const userRepostedSet = new Set()

  likesRes.data?.forEach(l => {
    likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1
    if (l.user_id === currentUserId) userLikedSet.add(l.post_id)
  })
  commentsRes.data?.forEach(c => {
    commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1
  })
  repostsRes.data?.forEach(r => {
    repostCounts[r.post_id] = (repostCounts[r.post_id] || 0) + 1
    if (r.user_id === currentUserId) userRepostedSet.add(r.post_id)
  })

  return { likeCounts, userLikedSet, commentCounts, repostCounts, userRepostedSet }
}

/**
 * Lädt alle Mood-Tags mit Häufigkeit.
 */
export async function loadMoodTags() {
  const { data } = await supabase.from('posts').select('mood').not('mood', 'is', null)
  if (!data?.length) return []
  const moodMap = {}
  data.forEach(p => { moodMap[p.mood] = (moodMap[p.mood] || 0) + 1 })
  return Object.entries(moodMap).sort((a, b) => b[1] - a[1])
}

/**
 * Lädt Usernames für eine Liste von User-IDs.
 * @param {string[]} userIds
 * @returns {Promise<Record<string, string>>}
 */
export async function loadUsernameMap(userIds) {
  if (!userIds.length) return {}
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)
  const map = {}
  data?.forEach(p => { map[p.id] = p.username })
  return map
}

// ─── Explore ──────────────────────────────────────────────────────────────────

/**
 * Hilfsfunktion: Gibt alle blockierten User-IDs zurück (beide Richtungen).
 * @param {string} currentUserId
 * @returns {Promise<string[]>}
 */
async function getBlockedIds(currentUserId) {
  const [blockedOut, blockedIn] = await Promise.all([
    supabase.from('blocks').select('blocked_id').eq('blocker_id', currentUserId),
    supabase.from('blocks').select('blocker_id').eq('blocked_id', currentUserId),
  ])
  return [
    ...(blockedOut.data?.map(b => b.blocked_id) || []),
    ...(blockedIn.data?.map(b => b.blocker_id) || []),
  ]
}

/**
 * Lädt öffentliche Explore-Posts — ausschließlich von Usern, denen currentUser NICHT folgt.
 * Blockierte User werden herausgefiltert.
 * @param {string} currentUserId
 * @param {string|null} moodFilter
 * @param {number} limit
 * @param {string|null} cursor — ISO-Timestamp für Cursor-Pagination (lt created_at)
 * @returns {Promise<{ posts: Array, error: object|null }>}
 */
export async function loadExplorePosts(currentUserId, moodFilter = null, limit = 60, cursor = null) {
  const [followedSet, blockedIds] = await Promise.all([
    getFollowedIds(currentUserId),
    getBlockedIds(currentUserId),
  ])
  const allExclude = [...new Set([currentUserId, ...followedSet, ...blockedIds])]

  let query = supabase
    .from('posts')
    .select('id, user_id, media_url, media_type, mood, created_at, visibility')
    .eq('visibility', 'public')
    .not('user_id', 'in', `(${allExclude.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (moodFilter) query = query.eq('mood', moodFilter)
  if (cursor) query = query.lt('created_at', cursor)

  const { data, error } = await query
  return { posts: data || [], error }
}

/**
 * Lädt User-Vorschläge für Explore — Accounts denen currentUser noch nicht folgt,
 * sortiert nach Follower-Anzahl.
 * @param {string} currentUserId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function loadSuggestedUsers(currentUserId, limit = 8) {
  const [followedSet, blockedIds] = await Promise.all([
    getFollowedIds(currentUserId),
    getBlockedIds(currentUserId),
  ])
  const allExclude = [...new Set([currentUserId, ...followedSet, ...blockedIds])]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, bio, avatar_url, profile_privacy')
    .not('id', 'in', `(${allExclude.join(',')})`)
    .eq('profile_privacy', 'public')
    .limit(limit * 4)

  if (!profiles?.length) return []

  const profileIds = profiles.map(p => p.id)
  const { data: followerRows } = await supabase
    .from('friendships')
    .select('friend_id')
    .in('friend_id', profileIds)
    .eq('status', 'accepted')

  const followerCount = {}
  followerRows?.forEach(r => {
    followerCount[r.friend_id] = (followerCount[r.friend_id] || 0) + 1
  })

  return profiles
    .map(p => ({ ...p, followerCount: followerCount[p.id] || 0 }))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, limit)
}

/**
 * Lädt Explore-Mood-Tags (nur öffentliche Posts), max. 20 Einträge.
 * @returns {Promise<Array<[string, number]>>}
 */
export async function loadExploreMoodTags() {
  const { data } = await supabase
    .from('posts')
    .select('mood')
    .eq('visibility', 'public')
    .not('mood', 'is', null)
  if (!data?.length) return []
  const moodMap = {}
  data.forEach(p => { moodMap[p.mood] = (moodMap[p.mood] || 0) + 1 })
  return Object.entries(moodMap).sort((a, b) => b[1] - a[1]).slice(0, 20)
}
