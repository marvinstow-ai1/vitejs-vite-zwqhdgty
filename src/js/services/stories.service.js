import { supabase } from '../supabase.js'
import { getFollowedIds } from './posts.service.js'
import { detectMediaType } from '../utils.js'

/**
 * Lädt aktive Stories für den aktuellen User und seine Follows.
 * Gibt gruppierte Stories + viewedSet zurück.
 */
export async function loadStoriesForUser(currentUserId) {
  const followedSet = await getFollowedIds(currentUserId)
  const allIds = [currentUserId, ...followedSet]

  const { data: stories } = await supabase
    .from('stories')
    .select('*, profiles(username)')
    .in('user_id', allIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const grouped = {}
  for (const s of stories || []) {
    if (!grouped[s.user_id]) grouped[s.user_id] = []
    grouped[s.user_id].push(s)
  }

  const storyIds = (stories || []).map(s => s.id)
  let viewedSet = new Set()
  if (storyIds.length) {
    const { data: viewed } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('user_id', currentUserId)
      .in('story_id', storyIds)
    viewedSet = new Set(viewed?.map(v => v.story_id) || [])
  }

  return { grouped, viewedSet }
}

/**
 * Lädt aktive Stories eines einzelnen Profils.
 */
export async function loadProfileStories(profileId) {
  const { data } = await supabase
    .from('stories')
    .select('*, profiles(username)')
    .eq('user_id', profileId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  return data || []
}

/**
 * Lädt die Story-View-IDs für einen User und eine Liste von Story-IDs.
 */
export async function getViewedStoryIds(userId, storyIds) {
  if (!storyIds.length) return new Set()
  const { data } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('user_id', userId)
    .in('story_id', storyIds)
  return new Set(data?.map(v => v.story_id) || [])
}

/**
 * Markiert eine Story als gesehen (ignoriert Duplikate).
 */
export async function markStoryViewed(storyId, userId) {
  await supabase
    .from('story_views')
    .insert({ story_id: storyId, user_id: userId })
    .then(() => {})
}

/**
 * Lädt die Viewer-Liste einer Story (nur für Owner).
 */
export async function getStoryViewers(storyId) {
  const { data } = await supabase
    .from('story_views')
    .select('*, profiles(username)')
    .eq('story_id', storyId)
  return data || []
}

/**
 * Löscht eine Story.
 */
export async function deleteStory(storyId) {
  return supabase.from('stories').delete().eq('id', storyId)
}

/**
 * Lädt eine Story-Datei hoch und gibt die öffentliche URL zurück.
 */
export async function uploadStoryFile(file, userId) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('stories').upload(path, file, { upsert: true })
  if (error) return { url: null, error }
  const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path)
  return { url: urlData.publicUrl, error: null }
}

/**
 * Erstellt eine neue Story in der Datenbank.
 */
export async function insertStory(userId, mediaUrl, mediaType, mood) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return supabase.from('stories').insert({
    user_id: userId,
    media_url: mediaUrl,
    media_type: mediaType,
    mood,
    expires_at: expiresAt,
  })
}
