import GIF from 'gif.js'

// ─── Constants ──────────────────────────────────────────────────────────────────

const GRID_COLS = 3
const GRID_ROWS = 3
const CANVAS_WIDTH = 1080  // Instagram-kompatibel
const CANVAS_HEIGHT = 1920 // 9:16
const CELL_GAP = 2         // Pixel zwischen Kacheln (wie unified-grid)
const VIDEO_FRAME_INTERVAL = 200 // ms zwischen Frames bei Videos
const MAX_FRAMES = 30      // max Frames für GIF-Größenkontrolle

// ─── Canvas Grid Rendering ──────────────────────────────────────────────────────

/**
 * Lädt ein Media-Element (Bild oder Video) und gibt ein HTMLImageElement
 * oder HTMLVideoElement zurück.
 * @param {string} url
 * @param {'image'|'video'|'gif'} type
 * @returns {Promise<HTMLImageElement|HTMLVideoElement>}
 */
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
      // Fallback: nach 10s timeout
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

/**
 * Berechnet die Zellen-Position im 3x3-Raster.
 * 3 Bilder → jedes Bild nimmt eine komplette Zeile (3 Spalten).
 * @param {number} index - 0, 1, 2
 * @param {number} cellW
 * @param {number} cellH
 * @param {number} gap
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function _getCellRect(index, cellW, cellH, gap) {
  const row = index
  const col = 0
  return {
    x: col * (cellW + gap),
    y: row * (cellH + gap),
    w: cellW * GRID_COLS + gap * (GRID_COLS - 1),
    h: cellH,
  }
}

/**
 * Zeichnet ein Media-Element auf die Canvas, skaliert auf cell-Bereich (cover).
 */
function _drawMediaOnCanvas(ctx, media, rect, isVideo = false) {
  const { x, y, w, h } = rect

  if (isVideo || media instanceof HTMLVideoElement) {
    // Video Frame zeichnen
    const vw = media.videoWidth
    const vh = media.videoHeight
    const scale = Math.max(w / vw, h / vh)
    const sw = vw * scale
    const sh = vh * scale
    const sx = x + (w - sw) / 2
    const sy = y + (h - sh) / 2
    ctx.drawImage(media, sx, sy, sw, sh)
  } else {
    // Bild zeichnen (cover)
    const iw = media.naturalWidth || media.width
    const ih = media.naturalHeight || media.height
    const scale = Math.max(w / iw, h / ih)
    const sw = iw * scale
    const sh = ih * scale
    const sx = x + (w - sw) / 2
    const sy = y + (h - sh) / 2
    ctx.drawImage(media, sx, sy, sw, sh)
  }
}

/**
 * Rendert ein einzelnes Frame des 3x3-Grids auf eine Canvas.
 * @param {Array<{url: string, type: string}>} items - max. 3 Items
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>}
 */
export async function renderGridFrame(items, canvas) {
  if (!items?.length) return
  const ctx = canvas.getContext('2d')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  // Hintergrund
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const gap = Math.round(CANVAS_WIDTH * (CELL_GAP / 300)) // relativ skalieren
  const cellW = Math.floor((CANVAS_WIDTH - gap * (GRID_COLS - 1)) / GRID_COLS)
  const cellH = Math.floor((CANVAS_HEIGHT - gap * (GRID_ROWS - 1)) / GRID_ROWS)

  // Bis zu 3 Items rendern, jedes in einer eigenen Zeile
  const count = Math.min(items.length, 3)
  for (let i = 0; i < count; i++) {
    const item = items[i]
    try {
      const media = await _loadMedia(item.url, item.type)
      const rect = _getCellRect(i, cellW, cellH, gap)
      const isVideo = item.type === 'video' || item.type === 'gif'
      _drawMediaOnCanvas(ctx, media, rect, isVideo)
    } catch (e) {
      console.warn('Media load error for', item.url, e)
      // Leere Zelle bei Fehler
      const rect = _getCellRect(i, cellW, cellH, gap)
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    }
  }
}

/**
 * Prüft ob eines der Items animiert ist (Video oder GIF).
 * @param {Array<{type: string}>} items
 * @returns {boolean}
 */
export function hasAnimatedItems(items) {
  return items.some(item => item.type === 'video' || item.type === 'gif')
}

/**
 * Exportiert das Grid als animiertes GIF.
 * @param {Array<{url: string, type: string}>} items
 * @param {object} [opts]
 * @param {number} [opts.quality=10]
 * @param {number} [opts.frameDelay=200]
 * @returns {Promise<Blob>}
 */
export async function exportAsGif(items, opts = {}) {
  const { quality = 10, frameDelay = 200 } = opts

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const animated = hasAnimatedItems(items)

  // GIF-Encoder
  const gif = new GIF({
    workers: 2,
    quality,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    workerScript: '/node_modules/gif.js/dist/gif.worker.js',
  })

  if (animated) {
    // Animiertes GIF: Frames in Intervallen aufnehmen
    const totalFrames = Math.min(MAX_FRAMES, Math.ceil(3000 / frameDelay))
    for (let f = 0; f < totalFrames; f++) {
      await renderGridFrame(items, canvas)
      gif.addFrame(canvas, { copy: true, delay: frameDelay })
    }
  } else {
    // Statisches GIF: nur ein Frame
    await renderGridFrame(items, canvas)
    gif.addFrame(canvas, { copy: true, delay: frameDelay })
  }

  return new Promise((resolve, reject) => {
    gif.on('progress', p => {
      // Könnte für Progress-Bar verwendet werden
    })
    gif.on('finished', blob => {
      resolve(blob)
    })
    gif.on('error', err => {
      reject(err)
    })
    gif.render()
  })
}

/**
 * Exportiert das Grid als statisches PNG.
 * @param {Array<{url: string, type: string}>} items
 * @returns {Promise<Blob>}
 */
export async function exportAsPng(items) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  await renderGridFrame(items, canvas)
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png')
  })
}

/**
 * Erzwingt den Download eines Blobs.
 * @param {Blob} blob
 * @param {string} filename
 */
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

/**
 * Teilt einen Blob über die Web-Share-API oder öffnet Social-Media-Links.
 * @param {Blob} blob
 * @param {'instagram'|'pinterest'|'x'|'download'} platform
 * @param {string} [caption]
 */
export async function shareGrid(blob, platform, caption = 'Mein Mood Grid 🎨') {
  switch (platform) {
    case 'download':
      downloadBlob(blob, `mood-grid-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'gif'}`)
      break

    case 'instagram':
      // Instagram hat keine direkte Web-Share-API für Stories/Posts
      // Download + Hinweis anzeigen
      downloadBlob(blob, `mood-grid-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'gif'}`)
      // Öffne Instagram (App oder Web)
      window.open('https://www.instagram.com', '_blank')
      break

    case 'pinterest':
      // Pinterest Pin-it Button via Bild-URL
      // Da wir ein Blob haben, laden wir es zuerst hoch oder nutzen FileReader
      const pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(window.location.href)}&description=${encodeURIComponent(caption)}`
      window.open(pinterestUrl, '_blank', 'width=750,height=600')
      break

    case 'x':
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`
      window.open(xUrl, '_blank', 'width=600,height=400')
      break

    default:
      // Fallback: Web-Share-API
      if (navigator.share) {
        try {
          const file = new File([blob], `mood-grid.${blob.type === 'image/png' ? 'png' : 'gif'}`, { type: blob.type })
          await navigator.share({
            title: 'Mood Grid',
            text: caption,
            files: [file],
          })
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('Share failed:', e)
        }
      } else {
        downloadBlob(blob, `mood-grid-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'gif'}`)
      }
  }
}