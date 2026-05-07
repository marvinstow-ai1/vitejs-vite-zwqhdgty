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
