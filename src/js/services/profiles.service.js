import { supabase } from '../supabase.js'

/**
 * Lädt ein Profil anhand der User-ID.
 * @param {string} userId
 */
export async function getProfileById(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

/**
 * Lädt ein Profil anhand des Usernamens (case-insensitive).
 * @param {string} username
 */
export async function getProfileByUsername(username) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .single()
  return data
}

/**
 * Aktualisiert Profilfelder für eine User-ID.
 * @param {string} userId
 * @param {object} fields
 */
export async function updateProfile(userId, fields) {
  return supabase.from('profiles').update(fields).eq('id', userId)
}

/**
 * Setzt den Username für einen neuen User.
 * @param {string} userId
 * @param {string} username
 */
export async function setUsername(userId, username) {
  return supabase.from('profiles').update({ username }).eq('id', userId)
}

/**
 * Sucht Profile nach Username-Fragment.
 * @param {string} query
 * @param {number} limit
 */
export async function searchProfiles(query, limit = 6) {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${query}%`)
    .limit(limit)
  return data || []
}

/**
 * Liefert Beziehung zwischen Viewer und Target: following + Block-Status (beide Richtungen).
 * Konsolidiert die drei separaten Queries auf der Profilseite.
 *
 * NOTE: Die Block-Sichtbarkeit ist hier ein UX-Hinweis — die echte Durchsetzung
 * gehört in RLS. Siehe docs/PHASE3_RLS_AUDIT.md §A11.
 *
 * @param {string} viewerId
 * @param {string} targetId
 * @returns {Promise<{ following: boolean, iBlocked: boolean, iAmBlocked: boolean }>}
 */
export async function getRelationshipStatus(viewerId, targetId) {
  if (!viewerId || viewerId === targetId) {
    return { following: false, iBlocked: false, iAmBlocked: false }
  }
  const [fwRes, bOutRes, bInRes] = await Promise.all([
    supabase.from('friendships').select('id')
      .eq('user_id', viewerId).eq('friend_id', targetId).eq('status', 'accepted').maybeSingle(),
    supabase.from('blocks').select('id')
      .eq('blocker_id', viewerId).eq('blocked_id', targetId).maybeSingle(),
    supabase.from('blocks').select('id')
      .eq('blocker_id', targetId).eq('blocked_id', viewerId).maybeSingle(),
  ])
  return {
    following: !!fwRes.data,
    iBlocked: !!bOutRes.data,
    iAmBlocked: !!bInRes.data,
  }
}

/**
 * Liest die Liste der vom Viewer blockierten User inkl. Username/Display-Name.
 * @param {string} viewerId
 */
export async function getMyBlocks(viewerId) {
  const { data: blocks } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', viewerId)
    .order('created_at', { ascending: false })
  if (!blocks?.length) return []
  const ids = blocks.map(b => b.blocked_id)
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', ids)
  const m = Object.fromEntries((profs || []).map(p => [p.id, p]))
  return blocks
    .map(b => ({ ...b, profile: m[b.blocked_id] || null }))
    .filter(b => b.profile)
}

/**
 * Gibt die Profil-Objekte zurück, die einem User folgen.
 * @param {string} userId
 * @returns {Promise<Array<{id, username, display_name}>>}
 */
export async function getFollowers(userId) {
  if (!userId) return []
  const { data: fs } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('friend_id', userId)
    .eq('status', 'accepted')
  if (!fs?.length) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', fs.map(f => f.user_id))
  return data || []
}

/**
 * Gibt die Profil-Objekte zurück, denen ein User folgt.
 * @param {string} userId
 * @returns {Promise<Array<{id, username, display_name}>>}
 */
export async function getFollowing(userId) {
  if (!userId) return []
  const { data: fs } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')
  if (!fs?.length) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', fs.map(f => f.friend_id))
  return data || []
}

/**
 * Gibt Follower- und Following-Anzahl zurück.
 * @param {string} profileId
 */
export async function getFollowCounts(profileId) {
  const [followerRes, followingRes] = await Promise.all([
    supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('friend_id', profileId)
      .eq('status', 'accepted'),
    supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileId)
      .eq('status', 'accepted'),
  ])
  return {
    followerCount: followerRes.count || 0,
    followingCount: followingRes.count || 0,
  }
}
