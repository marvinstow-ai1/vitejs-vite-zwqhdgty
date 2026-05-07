import { supabase } from '../supabase.js'
import { getVisiblePostIds } from './posts.service.js'

/**
 * Lädt alle Boards eines Users (sortiert nach Position).
 */
export async function getBoardsByUser(userId) {
  const { data } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  return data || []
}

/**
 * Lädt Posts eines Boards aus board_posts inkl. Sichtbarkeitsfilter.
 * @param {string} boardId
 * @param {string|null} currentUserId
 * @returns {Promise<Array>}
 */
export async function getBoardPosts(boardId, currentUserId) {
  const { data: bpRows } = await supabase
    .from('board_posts')
    .select('post_id, posts(id, media_url, media_type, visibility, user_id, mood)')
    .eq('board_id', boardId)
    .order('position', { ascending: true })

  const posts = bpRows?.map(r => r.posts).filter(Boolean) || []
  const visibleIds = await getVisiblePostIds(posts, currentUserId)
  return posts.filter(p => visibleIds.has(p.id))
}

/**
 * Fügt einen Post zu einem Board hinzu.
 */
export async function addPostToBoard(boardId, postId, userId) {
  return supabase
    .from('board_posts')
    .insert({ board_id: boardId, post_id: postId, user_id: userId })
}

/**
 * Erstellt ein neues Board.
 */
export async function createBoard(userId, payload) {
  return supabase
    .from('boards')
    .insert({ ...payload, user_id: userId })
}

/**
 * Aktualisiert ein bestehendes Board.
 */
export async function updateBoard(boardId, payload) {
  return supabase
    .from('boards')
    .update(payload)
    .eq('id', boardId)
}

/**
 * Löscht ein Board.
 */
export async function deleteBoard(boardId) {
  return supabase.from('boards').delete().eq('id', boardId)
}

/**
 * Lädt Reposts eines Users, die auf dem Profil angezeigt werden sollen.
 */
export async function getProfileReposts(userId) {
  const { data } = await supabase
    .from('reposts')
    .select('post_id, created_at, posts(id, media_url, mood, media_type, visibility, user_id)')
    .eq('user_id', userId)
    .eq('show_on_profile', true)
    .order('created_at', { ascending: false })
  return (data || []).map(r => r.posts).filter(Boolean)
}

/**
 * Lädt die Repost-Post-IDs eines Users (für Viewer-Repost-Status).
 */
export async function getUserRepostIds(userId) {
  const { data } = await supabase
    .from('reposts')
    .select('post_id')
    .eq('user_id', userId)
  return new Set((data || []).map(r => r.post_id))
}
