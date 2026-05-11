import { supabase } from '../supabase.js'
import { getSession } from '../services/auth.service.js'
import { iconSvg, escapeHtml, detectMediaType } from '../utils.js'
import {
  exportAsGif,
  exportAsPng,
  hasAnimatedItems,
  downloadBlob,
} from '../services/mood-grid.service.js'
import { uploadPostMedia } from '../services/media.service.js'
import { insertPost } from '../services/posts.service.js'

const GRID_SIZE = 9

// State
let _slots = new Array(GRID_SIZE).fill(null)  // each: { url, type, postId, mood } | null
let _library = []                              // user's media items
let _isExporting = false
let _activeSlotIdx = null                      // slot being filled by picker

// ─── Open Creator ───────────────────────────────────────────────────────────────

export async function openMoodGridCreator(profile, ctx) {
  const session = await getSession()
  const currentUserId = session?.user?.id || null
  if (!currentUserId) return

  const { data: posts } = await supabase
    .from('posts')
    .select('id, media_url, media_type, mood, created_at')
    .eq('user_id', currentUserId)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(150)

  _library = (posts || [])
    .filter(p => p.media_url)
    .map(p => ({
      postId: p.id,
      url: p.media_url,
      type: p.media_type || detectMediaType(p.media_url),
      mood: p.mood || null,
    }))

  _slots = new Array(GRID_SIZE).fill(null)
  _isExporting = false
  _activeSlotIdx = null

  const overlay = document.createElement('div')
  overlay.id = 'mood-grid-overlay'
  overlay.innerHTML = _renderOverlay()
  document.body.appendChild(overlay)

  requestAnimationFrame(() => overlay.classList.add('show'))

  overlay.querySelector('#mg-close').addEventListener('click', () => _closeOverlay(overlay))
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('mg-backdrop')) {
      _closeOverlay(overlay)
    }
  })

  const onKey = (e) => {
    if (e.key === 'Escape') {
      const picker = overlay.querySelector('#mg-picker.show')
      if (picker) _closePicker(overlay)
      else _closeOverlay(overlay)
    }
  }
  document.addEventListener('keydown', onKey)
  overlay._onKey = onKey

  _wireGrid(overlay, profile, currentUserId, ctx)
  _wirePicker(overlay)
  _wireConfirm(overlay, currentUserId, ctx)
  _renderGrid(overlay)
  _renderPickerItems(overlay)
}

// ─── Render: shell ──────────────────────────────────────────────────────────────

function _renderOverlay() {
  return `
    <div class="mg-backdrop"></div>
    <div class="mg-sheet">
      <div class="mg-header">
        <button id="mg-close" class="mg-close-btn" aria-label="Schliessen">${iconSvg('x', 18)}</button>
        <div class="mg-title-wrap">
          <span class="mg-title">Mood Grid</span>
          <span class="mg-subtitle" id="mg-progress">0 / 9</span>
        </div>
        <button id="mg-clear" class="mg-close-btn" aria-label="Zurücksetzen" title="Zurücksetzen">${iconSvg('trash', 16)}</button>
      </div>

      <div class="mg-canvas-wrap">
        <div class="mg-canvas unified-grid" id="mg-canvas" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);">
          ${Array.from({ length: GRID_SIZE }).map((_, i) => `
            <div class="unified-cell mg-cell mg-cell-empty" data-slot="${i}" draggable="false">
              <div class="mg-cell-add">${iconSvg('plus', 20)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="mg-actions">
        <button id="mg-confirm" class="mg-confirm-btn" disabled>
          ${iconSvg('spark', 16)} <span id="mg-confirm-label">Bestätigen &amp; speichern</span>
        </button>
      </div>

      <!-- Picker Modal -->
      <div class="mg-picker" id="mg-picker">
        <div class="mg-picker-backdrop"></div>
        <div class="mg-picker-sheet">
          <div class="mg-picker-header">
            <button class="mg-close-btn" id="mg-picker-close" aria-label="Schliessen">${iconSvg('x', 18)}</button>
            <span class="mg-title">Medium wählen</span>
            <div style="width:36px;"></div>
          </div>
          <div class="mg-picker-grid unified-grid" id="mg-picker-grid"></div>
        </div>
      </div>
    </div>
  `
}

// ─── Grid rendering ─────────────────────────────────────────────────────────────

function _renderGrid(overlay) {
  const cells = overlay.querySelectorAll('#mg-canvas .mg-cell')
  cells.forEach((cell, i) => {
    const item = _slots[i]
    cell.classList.toggle('mg-cell-empty', !item)
    cell.classList.toggle('mg-cell-filled', !!item)
    cell.setAttribute('draggable', item ? 'true' : 'false')

    if (!item) {
      cell.innerHTML = `<div class="mg-cell-add">${iconSvg('plus', 20)}</div>`
      return
    }
    cell.innerHTML = `${_mediaTileHtml(item)}<button class="mg-cell-remove" aria-label="Entfernen">${iconSvg('x', 12)}</button>`
    const v = cell.querySelector('video')
    if (v) v.play().catch(() => {})
  })

  const filled = _slots.filter(Boolean).length
  overlay.querySelector('#mg-progress').textContent = `${filled} / ${GRID_SIZE}`
  const btn = overlay.querySelector('#mg-confirm')
  btn.disabled = filled < GRID_SIZE || _isExporting
}

// ─── Grid interactions: click empty → picker, drag-to-reorder ───────────────────

function _wireGrid(overlay, profile, userId, ctx) {
  const canvas = overlay.querySelector('#mg-canvas')

  canvas.addEventListener('click', (e) => {
    if (_isExporting) return
    const removeBtn = e.target.closest('.mg-cell-remove')
    if (removeBtn) {
      e.stopPropagation()
      const cell = removeBtn.closest('.mg-cell')
      const idx = parseInt(cell.dataset.slot, 10)
      _slots[idx] = null
      _renderGrid(overlay)
      _renderPickerItems(overlay)
      return
    }
    const cell = e.target.closest('.mg-cell')
    if (!cell) return
    const idx = parseInt(cell.dataset.slot, 10)
    _activeSlotIdx = idx
    _openPicker(overlay)
  })

  // Drag-and-drop reordering
  let dragSrc = null
  canvas.addEventListener('dragstart', (e) => {
    const cell = e.target.closest('.mg-cell')
    if (!cell || !_slots[parseInt(cell.dataset.slot, 10)]) {
      e.preventDefault(); return
    }
    dragSrc = cell
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', cell.dataset.slot) } catch (_) {}
    cell.classList.add('mg-dragging')
  })
  canvas.addEventListener('dragenter', (e) => {
    const cell = e.target.closest('.mg-cell')
    if (cell && cell !== dragSrc) cell.classList.add('mg-drag-over')
  })
  canvas.addEventListener('dragleave', (e) => {
    const cell = e.target.closest('.mg-cell')
    if (cell) cell.classList.remove('mg-drag-over')
  })
  canvas.addEventListener('dragover', (e) => {
    if (e.target.closest('.mg-cell')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  })
  canvas.addEventListener('drop', (e) => {
    e.preventDefault()
    const target = e.target.closest('.mg-cell')
    if (!target || !dragSrc || target === dragSrc) return
    const from = parseInt(dragSrc.dataset.slot, 10)
    const to = parseInt(target.dataset.slot, 10)
    const tmp = _slots[from]
    _slots[from] = _slots[to]
    _slots[to] = tmp
    _renderGrid(overlay)
  })
  canvas.addEventListener('dragend', () => {
    canvas.querySelectorAll('.mg-cell').forEach(c => c.classList.remove('mg-dragging', 'mg-drag-over'))
    dragSrc = null
  })

  // Clear button
  overlay.querySelector('#mg-clear').addEventListener('click', () => {
    if (_isExporting) return
    _slots = new Array(GRID_SIZE).fill(null)
    _renderGrid(overlay)
    _renderPickerItems(overlay)
  })
}

// ─── Picker ─────────────────────────────────────────────────────────────────────

function _wirePicker(overlay) {
  overlay.querySelector('#mg-picker-close').addEventListener('click', () => _closePicker(overlay))
  overlay.querySelector('#mg-picker .mg-picker-backdrop').addEventListener('click', () => _closePicker(overlay))

  overlay.querySelector('#mg-picker-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.mg-picker-item')
    if (!item) return
    const postId = item.dataset.postId
    const lib = _library.find(m => m.postId === postId)
    if (!lib || _activeSlotIdx == null) return

    // If already in another slot, swap; otherwise just place.
    const existing = _slots.findIndex(s => s && s.postId === postId)
    if (existing >= 0 && existing !== _activeSlotIdx) {
      const tmp = _slots[_activeSlotIdx]
      _slots[_activeSlotIdx] = _slots[existing]
      _slots[existing] = tmp
    } else {
      _slots[_activeSlotIdx] = { ...lib }
    }
    _renderGrid(overlay)
    _renderPickerItems(overlay)
    _closePicker(overlay)
  })
}

function _renderPickerItems(overlay) {
  const grid = overlay.querySelector('#mg-picker-grid')
  if (!grid) return
  const usedIds = new Set(_slots.filter(Boolean).map(s => s.postId))
  if (!_library.length) {
    grid.innerHTML = `<p style="color:#666;font-size:13px;padding:32px;text-align:center;grid-column:1/-1;">Keine Medien gefunden. Lade zuerst Bilder oder Videos hoch.</p>`
    return
  }
  grid.innerHTML = _library.map(item => {
    const used = usedIds.has(item.postId)
    return `
      <div class="unified-cell mg-picker-item ${used ? 'mg-picker-used' : ''}" data-post-id="${item.postId}">
        ${_mediaTileHtml(item)}
        ${used ? `<span class="mg-picker-used-badge">In Grid</span>` : ''}
        ${item.mood ? `<span class="mg-media-mood">#${escapeHtml(item.mood)}</span>` : ''}
      </div>
    `
  }).join('')

  _wireVideoAutoplay(grid)
}

// GIF files are real images → <img>. Real videos → autoplaying muted <video>.
function _mediaTileHtml(item) {
  if (item.type === 'video') {
    return `<video src="${item.url}" muted loop playsinline autoplay preload="metadata"></video>`
  }
  return `<img src="${item.url}" alt="" loading="lazy" />`
}

let _vidObserver = null
function _wireVideoAutoplay(container) {
  if (_vidObserver) { _vidObserver.disconnect(); _vidObserver = null }
  if (!('IntersectionObserver' in window)) {
    container.querySelectorAll('video').forEach(v => v.play().catch(() => {}))
    return
  }
  _vidObserver = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.play().catch(() => {})
      else target.pause()
    })
  }, { threshold: 0.25, root: container })
  container.querySelectorAll('video').forEach(v => _vidObserver.observe(v))
}

function _openPicker(overlay) {
  const p = overlay.querySelector('#mg-picker')
  p.classList.add('show')
}

function _closePicker(overlay) {
  const p = overlay.querySelector('#mg-picker')
  p.classList.remove('show')
  _activeSlotIdx = null
}

// ─── Confirm: export + upload to library ────────────────────────────────────────

function _wireConfirm(overlay, userId, ctx) {
  overlay.querySelector('#mg-confirm').addEventListener('click', async () => {
    if (_isExporting) return
    if (_slots.some(s => !s)) return

    _isExporting = true
    const btn = overlay.querySelector('#mg-confirm')
    const label = overlay.querySelector('#mg-confirm-label')
    btn.disabled = true
    label.textContent = 'Erstelle…'

    try {
      const animated = hasAnimatedItems(_slots)
      let blob
      if (animated) {
        label.textContent = 'Rendere GIF…'
        blob = await exportAsGif(_slots)
      } else {
        blob = await exportAsPng(_slots)
      }

      // Download for the user
      const ext = animated ? 'gif' : 'png'
      const filename = `mood-grid-${Date.now()}.${ext}`
      downloadBlob(blob, filename)

      // Upload to library + insert post
      label.textContent = 'Speichere…'
      const file = new File([blob], filename, { type: blob.type })
      const { url, type, error } = await uploadPostMedia(file, userId)
      if (error || !url) throw error || new Error('Upload fehlgeschlagen')

      const { error: insertErr } = await insertPost({
        user_id: userId,
        media_url: url,
        media_type: type,
        mood: 'mood-grid',
        visibility: 'public',
      })
      if (insertErr) throw insertErr

      label.textContent = '✓ Gespeichert'
      setTimeout(() => {
        _closeOverlay(overlay)
        // Reload current page so the new post shows up if user is on profile/feed.
        if (ctx?.navigate) ctx.navigate(window.location.pathname || '/')
      }, 800)
    } catch (e) {
      console.error('Mood-Grid export failed:', e)
      label.textContent = '✗ Fehler'
      setTimeout(() => {
        label.textContent = 'Bestätigen & speichern'
        btn.disabled = false
        _isExporting = false
      }, 1800)
    }
  })
}

// ─── Close ──────────────────────────────────────────────────────────────────────

function _closeOverlay(overlay) {
  overlay.classList.remove('show')
  if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey)
  setTimeout(() => {
    overlay.remove()
    _slots = new Array(GRID_SIZE).fill(null)
    _library = []
    _isExporting = false
    _activeSlotIdx = null
  }, 300)
}
