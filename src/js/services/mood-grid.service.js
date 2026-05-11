import GIF from 'gif.js'

// 3×3 grid, each cell 9:16, total canvas 9:16 (1080×1920).
const GRID_COLS = 3
const GRID_ROWS = 3
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const CELL_GAP = 6
const VIDEO_FRAME_INTERVAL = 200
const MAX_FRAMES = 30

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
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const gap = CELL_GAP
  const cellW = Math.floor((CANVAS_WIDTH - gap * (GRID_COLS - 1)) / GRID_COLS)
  const cellH = Math.floor((CANVAS_HEIGHT - gap * (GRID_ROWS - 1)) / GRID_ROWS)

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
  const { quality = 10, frameDelay = 200 } = opts
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const medias = await _prepareMedias(items)
  medias.forEach(m => { if (m && m.play) m.play().catch(() => {}) })

  const gif = new GIF({
    workers: 2,
    quality,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    workerScript: '/node_modules/gif.js/dist/gif.worker.js',
  })

  const totalFrames = Math.min(MAX_FRAMES, Math.ceil(3000 / frameDelay))
  for (let f = 0; f < totalFrames; f++) {
    _drawFrame(items, medias, canvas)
    gif.addFrame(canvas, { copy: true, delay: frameDelay })
    await new Promise(r => setTimeout(r, frameDelay / 4))
  }

  return new Promise((resolve, reject) => {
    gif.on('finished', resolve)
    gif.on('error', reject)
    gif.render()
  })
}

/**
 * Exportiert das Grid als PNG.
 */
export async function exportAsPng(items) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const medias = await _prepareMedias(items)
  _drawFrame(items, medias, canvas)
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
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
