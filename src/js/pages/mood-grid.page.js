import { supabase } from '../supabase.js'
import { getSession } from '../services/auth.service.js'
import { iconSvg, escapeHtml, detectMediaType } from '../utils.js'
import { exportAsGif, exportAsPng, shareGrid, renderGridFrame, hasAnimatedItems } from '../services/mood-grid.service.js'

// ─── State ──────────────────────────────────────────────────────────────────────

let _selectedItems = [] // max 3 { url, type, postId }
let _isGifExport = true
let _isExporting = false

// ─── Open Creator ───────────────────────────────────────────────────────────────

/**
 * Öffnet den Mood-Grid Creator als Overlay.
 * @param {object} profile
 * @param {{ navigate: function }} ctx
 */
export async function openMoodGridCreator(profile, ctx) {
  const session = await getSession()
  const currentUserId = session?.user?.id || null
  if (!currentUserId) return

  // Eigene Posts mit Medien laden
  const { data: posts } = await supabase
    .from('posts')
    .select('id, media_url, media_type, mood')
    .eq('user_id', currentUserId)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const mediaItems = (posts || [])
    .filter(p => p.media_url)
    .map(p => ({
      postId: p.id,
      url: p.media_url,
      type: p.media_type || detectMediaType(p.media_url),
      mood: p.mood || null,
    }))

  _selectedItems = []
  _isGifExport = true
  _isExporting = false

  // Overlay erstellen
  const overlay = document.createElement('div')
  overlay.id = 'mood-grid-overlay'
  overlay.innerHTML = _renderOverlay(mediaItems)
  document.body.appendChild(overlay)

  // Animation: nach DOM-Insert slide-in
  requestAnimationFrame(() => {
    overlay.classList.add('show')
  })

  // ── Event Listeners ──────────────────────────────────────────────────────

  // Close
  overlay.querySelector('#mg-close').addEventListener('click', () => _closeOverlay(overlay))
  overlay.addEventListener('click', e => {
    if (e.target === overlay) _closeOverlay(overlay)
  })

  // Escape
  const onKey = (e) => { if (e.key === 'Escape') _closeOverlay(overlay) }
  document.addEventListener('keydown', onKey)

  // Media-Auswahl
  overlay.querySelectorAll('.mg-media-item').forEach(el => {
    el.addEventListener('click', () => {
      if (_isExporting) return
      const postId = el.dataset.postId
      const idx = _selectedItems.findIndex(s => s.postId === postId)

      if (idx >= 0) {
        // Bereits ausgewählt → entfernen
        _selectedItems.splice(idx, 1)
        el.classList.remove('mg-selected')
      } else if (_selectedItems.length < 3) {
        // Hinzufügen
        const item = mediaItems.find(m => m.postId === postId)
        if (item) {
          _selectedItems.push({ ...item })
          el.classList.add('mg-selected')
        }
      }

      _updatePreview(overlay)
    })
  })

  // Export-Typ umschalten (GIF / PNG)
  overlay.querySelector('#mg-toggle-gif').addEventListener('click', () => {
    _isGifExport = true
    overlay.querySelector('#mg-toggle-gif').classList.add('mg-toggle-active')
    overlay.querySelector('#mg-toggle-png').classList.remove('mg-toggle-active')
  })
  overlay.querySelector('#mg-toggle-png').addEventListener('click', () => {
    _isGifExport = false
    overlay.querySelector('#mg-toggle-png').classList.add('mg-toggle-active')
    overlay.querySelector('#mg-toggle-gif').classList.remove('mg-toggle-active')
  })

  // Export-Button
  overlay.querySelector('#mg-export-btn').addEventListener('click', async () => {
    if (_isExporting || _selectedItems.length === 0) return
    _isExporting = true
    const btn = overlay.querySelector('#mg-export-btn')
    btn.textContent = 'Erstelle...'
    btn.disabled = true

    try {
      let blob
      if (_isGifExport) {
        blob = await exportAsGif(_selectedItems)
      } else {
        blob = await exportAsPng(_selectedItems)
      }

      // Vorschau aktualisieren mit dem exportierten Blob
      _showExportResult(overlay, blob)
    } catch (e) {
      console.error('Export failed:', e)
      btn.textContent = '❌ Fehler'
      setTimeout(() => { btn.textContent = 'Exportieren'; btn.disabled = false; _isExporting = false }, 2000)
    }
  })

  // Drag-to-Reorder für ausgewählte Items
  _setupDragReorder(overlay)

  // Initial Preview
  _updatePreview(overlay)
}

// ─── Render ─────────────────────────────────────────────────────────────────────

function _renderOverlay(mediaItems) {
  return `
    <div class="mg-backdrop"></div>
    <div class="mg-sheet">
      <!-- Header -->
      <div class="mg-header">
        <button id="mg-close" class="mg-close-btn" aria-label="Schliessen">${iconSvg('x', 18)}</button>
        <span class="mg-title">Mood Grid Creator</span>
        <div style="width:36px;"></div>
      </div>

      <!-- Preview -->
      <div class="mg-preview-wrap">
        <div class="mg-preview" id="mg-preview">
          <div class="mg-preview-grid" id="mg-preview-grid">
            <div class="mg-preview-cell mg-preview-cell--empty" data-idx="0"></div>
            <div class="mg-preview-cell mg-preview-cell--empty" data-idx="1"></div>
            <div class="mg-preview-cell mg-preview-cell--empty" data-idx="2"></div>
          </div>
          <div class="mg-preview-label">3×3 · 9:16</div>
        </div>
      </div>

      <!-- Ausgewählte Items (Drag-Reihenfolge) -->
      <div class="mg-selected-row" id="mg-selected-row">
        <div class="mg-selected-slot" data-slot="0">
          <div class="mg-slot-placeholder">1</div>
        </div>
        <div class="mg-selected-slot" data-slot="1">
          <div class="mg-slot-placeholder">2</div>
        </div>
        <div class="mg-selected-slot" data-slot="2">
          <div class="mg-slot-placeholder">3</div>
        </div>
      </div>

      <!-- Export Controls -->
      <div class="mg-controls">
        <div class="mg-toggle">
          <button id="mg-toggle-gif" class="mg-toggle-btn mg-toggle-active">GIF</button>
          <button id="mg-toggle-png" class="mg-toggle-btn">PNG</button>
        </div>
        <button id="mg-export-btn" class="mg-export-btn" disabled>
          ${iconSvg('spark', 16)} Exportieren
        </button>
      </div>

      <!-- Share Buttons (nach Export sichtbar) -->
      <div class="mg-share-bar" id="mg-share-bar" style="display:none;">
        <span class="mg-share-label">Teilen auf</span>
        <div class="mg-share-btns">
          <button class="mg-share-btn" data-platform="instagram" aria-label="Instagram">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/></svg>
            <span>Instagram</span>
          </button>
          <button class="mg-share-btn" data-platform="pinterest" aria-label="Pinterest">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2C6.5 2 2 6.5 2 12c0 4.2 2.6 7.8 6.3 9.3-.1-.8-.2-2.1 0-3 .2-.9 1.3-5.5 1.3-5.5s-.3-.7-.3-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.7 1.5 1.6 0 1-.6 2.5-1 3.9-.3 1.2.6 2.1 1.8 2.1 2.1 0 3.8-2.2 3.8-5.5 0-2.9-2.1-4.9-5-4.9-3.4 0-5.4 2.6-5.4 5.2 0 1 .4 2.1.9 2.7.1.1.1.3-.1.8-.1.4-.3 1.3-.4 1.7-.1.5-.4.6-.9.4-1.7-.8-2.8-3.3-2.8-5.4 0-4.4 3.2-8.4 9.2-8.4 4.8 0 8.6 3.4 8.6 8 0 4.8-3 8.7-7.2 8.7-1.4 0-2.7-.7-3.2-1.6l-.9 3.4c-.3 1.2-1.2 2.7-1.8 3.6 1.4.4 2.8.7 4.3.7 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
            <span>Pinterest</span>
          </button>
          <button class="mg-share-btn" data-platform="x" aria-label="X (Twitter)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            <span>X</span>
          </button>
          <button class="mg-share-btn" data-platform="download" aria-label="Download">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          </button>
        </div>
      </div>

      <!-- Media-Auswahl -->
      <div class="mg-media-section">
        <div class="mg-media-header">
          <span class="mg-media-title">Wähle bis zu 3 Medien</span>
          <span class="mg-media-count" id="mg-media-count">0/3</span>
        </div>
        <div class="mg-media-grid" id="mg-media-grid">
          ${mediaItems.map(item => `
            <div class="mg-media-item" data-post-id="${item.postId}" data-url="${item.url}" data-type="${item.type}">
              ${item.type === 'video' || item.type === 'gif'
                ? `<video src="${item.url}" muted loop playsinline preload="metadata"></video>`
                : `<img src="${item.url}" alt="" loading="lazy" />`
              }
              ${item.mood ? `<span class="mg-media-mood">#${escapeHtml(item.mood)}</span>` : ''}
              ${item.type === 'video' ? `<span class="mg-media-badge">🎬</span>` : ''}
              ${item.type === 'gif' ? `<span class="mg-media-badge">GIF</span>` : ''}
            </div>
          `).join('')}
          ${!mediaItems.length ? '<p style="color:#555;font-size:13px;padding:24px;text-align:center;grid-column:1/-1;">Keine Medien gefunden. Lade zuerst Bilder oder Videos hoch.</p>' : ''}
        </div>
      </div>
    </div>
  `
}

// ─── Preview Update ─────────────────────────────────────────────────────────────

function _updatePreview(overlay) {
  const grid = overlay.querySelector('#mg-preview-grid')
  const cells = grid.querySelectorAll('.mg-preview-cell')
  const countEl = overlay.querySelector('#mg-media-count')
  const exportBtn = overlay.querySelector('#mg-export-btn')

  countEl.textContent = `${_selectedItems.length}/3`
  exportBtn.disabled = _selectedItems.length === 0 || _isExporting

  // Ausgewählte Slots aktualisieren
  const slots = overlay.querySelectorAll('.mg-selected-slot')
  slots.forEach((slot, i) => {
    const existing = slot.querySelector('.mg-slot-thumb')
    if (existing) existing.remove()
    const placeholder = slot.querySelector('.mg-slot-placeholder')

    if (i < _selectedItems.length) {
      placeholder.style.display = 'none'
      const thumb = document.createElement('div')
      thumb.className = 'mg-slot-thumb'
      const item = _selectedItems[i]
      if (item.type === 'video' || item.type === 'gif') {
        thumb.innerHTML = `<video src="${item.url}" muted loop playsinline autoplay></video>`
      } else {
        thumb.innerHTML = `<img src="${item.url}" alt="" />`
      }
      slot.appendChild(thumb)
    } else {
      placeholder.style.display = 'flex'
    }
  })

  // Preview-Zellen befüllen
  cells.forEach((cell, i) => {
    if (i < _selectedItems.length) {
      const item = _selectedItems[i]
      cell.className = 'mg-preview-cell'
      cell.innerHTML = ''
      if (item.type === 'video' || item.type === 'gif') {
        const video = document.createElement('video')
        video.src = item.url
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.autoplay = true
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;'
        cell.appendChild(video)
        // Autoplay starten
        video.play().catch(() => {})
      } else {
        const img = document.createElement('img')
        img.src = item.url
        img.alt = ''
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;'
        cell.appendChild(img)
      }
    } else {
      cell.className = 'mg-preview-cell mg-preview-cell--empty'
      cell.innerHTML = ''
    }
  })
}

// ─── Export Result ──────────────────────────────────────────────────────────────

function _showExportResult(overlay, blob) {
  const isGif = blob.type === 'image/gif'
  const shareBar = overlay.querySelector('#mg-share-bar')
  const exportBtn = overlay.querySelector('#mg-export-btn')
  const previewGrid = overlay.querySelector('#mg-preview-grid')

  // Vorschau durch das exportierte Bild ersetzen
  const url = URL.createObjectURL(blob)
  if (isGif) {
    previewGrid.innerHTML = `<video src="${url}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:contain;display:block;background:#0a0a0a;"></video>`
  } else {
    previewGrid.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;background:#0a0a0a;" />`
  }

  exportBtn.textContent = '✅ Erstellt!'
  exportBtn.disabled = false
  _isExporting = false

  // Share-Buttons einblenden
  shareBar.style.display = 'flex'

  // Share-Buttons verdrahten
  shareBar.querySelectorAll('.mg-share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform
      shareGrid(blob, platform, 'Mein Mood Grid auf Marvin\'s Place 🎨')
    })
  })

  // Nach 3s cleanup
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ─── Drag-to-Reorder ────────────────────────────────────────────────────────────

function _setupDragReorder(overlay) {
  const slots = overlay.querySelectorAll('.mg-selected-slot')
  let dragSrc = null

  slots.forEach(slot => {
    slot.setAttribute('draggable', 'true')

    slot.addEventListener('dragstart', e => {
      dragSrc = slot
      e.dataTransfer.effectAllowed = 'move'
      slot.classList.add('mg-dragging')
    })

    slot.addEventListener('dragenter', e => {
      e.preventDefault()
      if (slot !== dragSrc) slot.classList.add('mg-drag-over')
    })

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('mg-drag-over')
    })

    slot.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    })

    slot.addEventListener('drop', e => {
      e.preventDefault()
      slot.classList.remove('mg-drag-over')
      if (dragSrc && dragSrc !== slot) {
        const fromIdx = parseInt(dragSrc.dataset.slot)
        const toIdx = parseInt(slot.dataset.slot)
        if (fromIdx < _selectedItems.length && toIdx < _selectedItems.length) {
          // Items im Array tauschen
          const temp = _selectedItems[fromIdx]
          _selectedItems[fromIdx] = _selectedItems[toIdx]
          _selectedItems[toIdx] = temp
          _updatePreview(overlay)
        }
      }
      dragSrc = null
    })

    slot.addEventListener('dragend', () => {
      slots.forEach(s => s.classList.remove('mg-dragging', 'mg-drag-over'))
      dragSrc = null
    })
  })
}

// ─── Close ──────────────────────────────────────────────────────────────────────

function _closeOverlay(overlay) {
  overlay.classList.remove('show')
  setTimeout(() => {
    overlay.remove()
    _selectedItems = []
    _isExporting = false
  }, 300) // warte auf Slide-Out-Animation
}