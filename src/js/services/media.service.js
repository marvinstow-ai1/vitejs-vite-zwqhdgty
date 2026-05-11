import { supabase } from '../supabase.js'

// =============================================================================
// Media uploads — single seam for storage writes.
//
// All file paths are scoped under `${userId}/...` so that a future Storage RLS
// policy can enforce ownership with `(storage.foldername(name))[1] = auth.uid()`.
// See docs/PHASE3_RLS_AUDIT.md §C2 / Block 4 of the SQL draft.
//
// Buckets used: `images`, `videos`, `headers`, `stories`.
// =============================================================================

const MAX_BYTES = 50 * 1024 * 1024

/**
 * @typedef {Object} UploadResult
 * @property {string|null} url
 * @property {'image'|'video'|'gif'|null} type
 * @property {{ message: string }|null} error
 */

function _ext(file) {
  return (file.name.split('.').pop() || 'bin').toLowerCase()
}

function _kindFromFile(file) {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'image/gif') return 'gif'
  return 'image'
}

/**
 * Upload a feed-composer image / video / gif. Bucket is chosen by media kind.
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<UploadResult>}
 */
export async function uploadPostMedia(file, userId) {
  if (!file) return { url: null, type: null, error: { message: 'No file' } }
  if (file.size > MAX_BYTES) return { url: null, type: null, error: { message: 'Max 50MB' } }

  const kind = _kindFromFile(file)
  const bucket = kind === 'video' ? 'videos' : 'images'
  const path = `${userId}/${Date.now()}.${_ext(file)}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { url: null, type: null, error }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, type: kind, error: null }
}

/**
 * Upload a profile header image. One file per user (overwrites).
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<UploadResult>}
 */
export async function uploadHeaderImage(file, userId) {
  if (!file) return { url: null, type: null, error: { message: 'No file' } }
  const path = `${userId}/header.${_ext(file)}`
  const { error } = await supabase.storage.from('headers').upload(path, file, { upsert: true })
  if (error) return { url: null, type: null, error }
  const { data } = supabase.storage.from('headers').getPublicUrl(path)
  return { url: data.publicUrl, type: 'image', error: null }
}

/**
 * Upload a story file. Re-exported convenience over the existing
 * stories.service helper so all upload paths can come from one module.
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<UploadResult>}
 */
export async function uploadStoryMedia(file, userId) {
  if (!file) return { url: null, type: null, error: { message: 'No file' } }
  if (file.size > MAX_BYTES) return { url: null, type: null, error: { message: 'Max 50MB' } }

  const kind = _kindFromFile(file)
  const path = `${userId}/${Date.now()}.${_ext(file)}`
  const { error } = await supabase.storage.from('stories').upload(path, file, { upsert: true })
  if (error) return { url: null, type: null, error }
  const { data } = supabase.storage.from('stories').getPublicUrl(path)
  return { url: data.publicUrl, type: kind, error: null }
}

// ─── Delete helpers ──────────────────────────────────────────────────────────────

/**
 * Extrahiert Bucket und Pfad aus einer Supabase Public-URL.
 * @param {string} url
 * @returns {{ bucket: string|null, path: string|null }}
 */
function _parseStorageUrl(url) {
  if (!url) return { bucket: null, path: null }
  // Format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const match = url.match(/\/object\/public\/([^/]+)\/(.+)/)
  if (!match) return { bucket: null, path: null }
  return { bucket: match[1], path: match[2] }
}

/**
 * Löscht eine Datei aus dem Supabase Storage anhand ihrer Public-URL.
 * @param {string} url
 * @returns {Promise<{ error: object|null }>}
 */
export async function deleteStorageFile(url) {
  const { bucket, path } = _parseStorageUrl(url)
  if (!bucket || !path) return { error: { message: 'Ungültige Storage-URL' } }
  const { error } = await supabase.storage.from(bucket).remove([path])
  return { error }
}

/**
 * Löscht mehrere Dateien aus dem Supabase Storage anhand ihrer Public-URLs.
 * @param {string[]} urls
 * @returns {Promise<{ error: object|null }>}
 */
export async function deleteStorageFiles(urls) {
  const pathsByBucket = {}
  for (const url of urls) {
    const { bucket, path } = _parseStorageUrl(url)
    if (bucket && path) {
      if (!pathsByBucket[bucket]) pathsByBucket[bucket] = []
      pathsByBucket[bucket].push(path)
    }
  }
  const errors = []
  for (const [bucket, paths] of Object.entries(pathsByBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) errors.push(error)
  }
  return { error: errors.length ? errors[0] : null }
}

/**
 * Löscht Posts inkl. aller abhängigen Daten (Likes, Comments, Reposts, Board-Posts)
 * und der zugehörigen Storage-Dateien.
 *
 * @param {string[]} postIds
 * @param {string} userId — zur Sicherheit: nur Posts dieses Users werden gelöscht
 * @returns {Promise<{ error: object|null }>}
 */
export async function deletePostsWithMedia(postIds, userId) {
  if (!postIds.length) return { error: null }

  // 1. Medien-URLs der Posts abrufen (nur eigene Posts)
  const { data: posts, error: fetchError } = await supabase
    .from('posts')
    .select('id, media_url')
    .in('id', postIds)
    .eq('user_id', userId)

  if (fetchError) return { error: fetchError }

  // 2. Storage-Dateien löschen
  const mediaUrls = posts.map(p => p.media_url).filter(Boolean)
  if (mediaUrls.length) {
    const { error: storageError } = await deleteStorageFiles(mediaUrls)
    if (storageError) console.error('Storage delete error:', storageError)
  }

  // 3. Abhängige Daten löschen (Reihenfolge wichtig wegen Foreign Keys)
  await supabase.from('likes').delete().in('post_id', postIds)
  await supabase.from('comments').delete().in('post_id', postIds)
  await supabase.from('reposts').delete().in('post_id', postIds)
  await supabase.from('board_posts').delete().in('post_id', postIds)

  // 4. Posts selbst löschen
  const { error } = await supabase
    .from('posts')
    .delete()
    .in('id', postIds)
    .eq('user_id', userId)

  return { error }
}
