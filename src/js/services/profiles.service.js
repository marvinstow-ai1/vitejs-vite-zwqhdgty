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
 * Gibt Follower- und Following-Anzahl zurück.
 * Uses the get_follow_counts() SECURITY DEFINER RPC so the RLS policy on
 * friendships (owner-scoped) does not prevent counting another user's followers.
 * @param {string} profileId
 */
export async function getFollowCounts(profileId) {
  const { data } = await supabase.rpc('get_follow_counts', { target_user: profileId })
  const row = data?.[0]
  return {
    followerCount: Number(row?.follower_count ?? 0),
    followingCount: Number(row?.following_count ?? 0),
  }
}

/**
 * Returns the minimum public info for a username regardless of privacy.
 * Used to distinguish "profile is private" from "profile not found" after
 * RLS is active (a private profile returns null from getProfileByUsername).
 * @param {string} username
 * @returns {Promise<{ id: string, username: string, display_name: string, profile_privacy: string }|null>}
 */
export async function getProfilePublicStub(username) {
  const { data } = await supabase.rpc('get_profile_public_stub', { p_username: username.toLowerCase() })
  return data?.[0] ?? null
}
