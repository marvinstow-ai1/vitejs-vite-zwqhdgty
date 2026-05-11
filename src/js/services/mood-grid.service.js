import GIF from 'gif.js'
// Vite resolves this to a hashed asset URL that exists in the built bundle.
// Without this, gif.js tries to load `/node_modules/...` which 404s in prod
// and the encoder hangs forever.
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url'

// 3×3 grid, each cell 9:16, total canvas 9:16.
const GRID_COLS = 3
const GRID_ROWS = 3
// Full PNG export is mobile-fullscreen (1080×1920). GIF is downscaled because
// encoding 35 × 1080×1920 frames takes ~minute even on fast laptops; 540×960
// still looks crisp on phones and encodes ~4× faster.
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const GIF_WIDTH = 540
const GIF_HEIGHT = 960
const CELL_GAP = 6
const FRAME_DELAY = 200
const MAX_DURATION_MS = 7000
const MAX_FRAMES = Math.floor(MAX_DURATION_MS / FRAME_DELAY) // 35 frames @ 200ms = 7s

function _loadMedia(url, type) {
  return new Promise((resolve, reject) => {
    if (type === 'video' || type === 'gif') {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.src = url
      video.onloadeddata = () => resolve(video)
      video.onerror = () => reject(new Error('Video konnte nicht geladen werden'))
      setTimeout(() => { if (!video.videoWidth) reject(new Error('Timeout')) }, 10000)
    } else {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = url
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      setTimeout(() => { if (!img.naturalWidth) reject(new Error('Timeout')) }, 10000)
    }
  })
}

function _getCellRect(index, cellW, cellH, gap) {
  const row = Math.floor(index / GRID_COLS)
  const col = index % GRID_COLS
  return {
    x: col * (cellW + gap),
    y: row * (cellH + gap),
    w: cellW,
    h: cellH,
  }
}

function _drawCover(ctx, media, rect) {
  const { x, y, w, h } = rect
  const sw0 = media.videoWidth || media.naturalWidth || media.width
  const sh0 = media.videoHeight || media.naturalHeight || media.height
  if (!sw0 || !sh0) return
  const scale = Math.max(w / sw0, h / sh0)
  const sw = sw0 * scale
  const sh = sh0 * scale
  const sx = x + (w - sw) / 2
  const sy = y + (h - sh) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(media, sx, sy, sw, sh)
  ctx.restore()
}

/**
 * Rendert ein einzelnes Frame des 3×3-Grids auf eine Canvas.
 * @param {Array<{url: string, type: string} | null>} items - 9 Slots (null = leer)
 * @param {Array<HTMLImageElement|HTMLVideoElement|null>} medias - vorbereitete Medien
 * @param {HTMLCanvasElement} canvas
 */
function _drawFrame(items, medias, canvas) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, W, H)

  const gap = Math.max(2, Math.round(CELL_GAP * (W / CANVAS_WIDTH)))
  const cellW = Math.floor((W - gap * (GRID_COLS - 1)) / GRID_COLS)
  const cellH = Math.floor((H - gap * (GRID_ROWS - 1)) / GRID_ROWS)

  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    const rect = _getCellRect(i, cellW, cellH, gap)
    const media = medias[i]
    if (!media) {
      ctx.fillStyle = '#141414'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      continue
    }
    try {
      _drawCover(ctx, media, rect)
    } catch (e) {
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    }
  }
}

async function _prepareMedias(items) {
  const out = new Array(items.length).fill(null)
  await Promise.all(items.map(async (item, i) => {
    if (!item) return
    try {
      out[i] = await _loadMedia(item.url, item.type)
    } catch (e) {
      console.warn('Media load failed:', item.url, e)
      out[i] = null
    }
  }))
  return out
}

export function hasAnimatedItems(items) {
  return items.some(item => item && (item.type === 'video' || item.type === 'gif'))
}

/**
 * Rendert ein einzelnes Vorschau-Frame auf die Canvas (für UI-Previews).
 * @param {Array} items
 * @param {HTMLCanvasElement} canvas
 */
export async function renderGridFrame(items, canvas) {
  const medias = await _prepareMedias(items)
  _drawFrame(items, medias, canvas)
  // Versuche Videos zu starten, damit sie ein erstes Frame liefern
  medias.forEach(m => { if (m && m.play) m.play().catch(() => {}) })
}

/**
 * Exportiert das Grid als animiertes GIF.
 * @param {Array} items
 * @returns {Promise<Blob>}
 */
export async function exportAsGif(items, opts = {}) {
  const { quality = 12, frameDelay = FRAME_DELAY, onProgress } = opts
  const canvas = document.createElement('canvas')
  canvas.width = GIF_WIDTH
  canvas.height = GIF_HEIGHT

  const medias = await _prepareMedias(items)
  medias.forEach(m => { if (m && m.play) m.play().catch(() => {}) })
  // Capture phase = 0–50% of total progress; gif.js encoding = 50–100%
  if (onProgress) onProgress(0.05)

  const gif = new GIF({
    workers: 2,
    quality,
    width: GIF_WIDTH,
    height: GIF_HEIGHT,
    workerScript: gifWorkerUrl,
  })

  const totalFrames = Math.min(MAX_FRAMES, Math.floor(MAX_DURATION_MS / frameDelay))
  for (let f = 0; f < totalFrames; f++) {
    _drawFrame(items, medias, canvas)
    gif.addFrame(canvas, { copy: true, delay: frameDelay })
    if (onProgress) onProgress(0.05 + (f / totalFrames) * 0.45)
    // Yield so video elements can advance their playback head between frames.
    await new Promise(r => setTimeout(r, frameDelay / 4))
  }

  return new Promise((resolve, reject) => {
    gif.on('progress', p => { if (onProgress) onProgress(0.5 + p * 0.5) })
    gif.on('finished', blob => { if (onProgress) onProgress(1); resolve(blob) })
    gif.on('error', reject)
    gif.render()
  })
}

/**
 * Exportiert das Grid als PNG.
 */
export async function exportAsPng(items, opts = {}) {
  const { onProgress } = opts
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  if (onProgress) onProgress(0.1)
  const medias = await _prepareMedias(items)
  if (onProgress) onProgress(0.6)
  _drawFrame(items, medias, canvas)
  if (onProgress) onProgress(0.9)
  return new Promise(resolve => canvas.toBlob(b => {
    if (onProgress) onProgress(1)
    resolve(b)
  }, 'image/png'))
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
