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
 * UX-only filter: dropped posts the viewer should not render.
 *
 * ⚠️ NOT A SECURITY BOUNDARY. This runs in the browser and only filters rows
 * that the database has already returned. The real visibility check must be
 * an RLS policy on `posts` (see docs/PHASE3_RLS_AUDIT.md §A1 and the
 * `posts_select` policy in supabase/migrations/0001_phase3_rls.sql).
 *
 * Once that RLS lands, this helper is redundant and can be removed.
 *
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
 * Lädt öffentliche Posts für die Explore-Seite (kein Repost-Filter nötig — nur echte Posts).
 * @param {number} page
 * @param {string|null} moodFilter
 * @param {number} limit
 */
export async function loadExplorePosts(page = 0, moodFilter = null, limit = 24) {
  let query = supabase
    .from('posts')
    .select('id, user_id, media_url, media_type, mood, created_at')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)
  if (moodFilter) query = query.eq('mood', moodFilter)
  return query
}

/**
 * Gibt die häufigsten Mood-Tags aus öffentlichen Posts zurück.
 * @returns {Promise<string[]>}
 */
export async function loadExplorePostsMoods() {
  const { data } = await supabase
    .from('posts')
    .select('mood')
    .eq('visibility', 'public')
    .not('mood', 'is', null)
  if (!data?.length) return []
  const counts = {}
  data.forEach(p => { counts[p.mood] = (counts[p.mood] || 0) + 1 })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([mood]) => mood)
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
