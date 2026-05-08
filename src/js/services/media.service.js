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
