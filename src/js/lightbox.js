// ─── Lightbox ─────────────────────────────────────────────────────────────────

let _items = []
let _idx = 0
let _txStart = 0
let _tyStart = 0

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach lightbox click delegation to a stable container element.
 * Works for #feed-grid, #explore-grid, #board-content, etc.
 * @param {string|HTMLElement} containerSel
 */
export function wireLightbox(containerSel) {
  const container = typeof containerSel === 'string'
    ? document.querySelector(containerSel)
    : containerSel
  if (!container) return
  container.addEventListener('click', e => {
    if (e.target.closest('button, a, iframe')) return
    const cell = e.target.closest('.unified-cell')
    if (!cell) return
    const item = _cellToItem(cell)
    if (!item) return
    const allCells = [...container.querySelectorAll('.unified-cell')]
    const items = []
    const validCells = []
    allCells.forEach(c => {
      const it = _cellToItem(c)
      if (it) { items.push(it); validCells.push(c) }
    })
    const idx = validCells.indexOf(cell)
    if (idx >= 0) openLightbox(items, idx)
  })
}

export function openLightbox(items, startIdx = 0) {
  _items = items.filter(Boolean)
  _idx = Math.max(0, Math.min(startIdx, _items.length - 1))
  if (!_items.length) return
  _render()
  document.addEventListener('keydown', _onKey)
  document.body.style.overflow = 'hidden'
}

export function closeLightbox() {
  document.getElementById('_lb')?.remove()
  document.removeEventListener('keydown', _onKey)
  document.body.style.overflow = ''
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _cellToItem(cell) {
  if (cell.querySelector('iframe')) return null
  // Feed / explore: data-media-url on inner wrapper
  const withData = cell.querySelector('[data-media-url]')
  if (withData?.dataset.mediaUrl) {
    const mt = withData.dataset.mediaType
    if (mt === 'youtube' || mt === 'instagram') return null
    return { mediaUrl: withData.dataset.mediaUrl, mediaType: mt }
  }
  // Board / profile: img or video directly in cell
  const vid = cell.querySelector('video')
  if (vid) return { mediaUrl: vid.src || vid.currentSrc, mediaType: 'video' }
  const img = cell.querySelector('img')
  if (!img?.src) return null
  const src = img.src
  const isGif = src.split('?')[0].toLowerCase().endsWith('.gif')
  return { mediaUrl: src, mediaType: isGif ? 'gif' : 'image' }
}

function _render() {
  document.getElementById('_lb')?.remove()
  const item = _items[_idx]
  const hasPrev = _idx > 0
  const hasNext = _idx < _items.length - 1
  const btnStyle = 'position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:44px;height:44px;background:rgba(255,255,255,.12);border:none;border-radius:50%;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);'

  const el = document.createElement('div')
  el.id = '_lb'
  el.style.cssText = 'position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.96);display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;'

  el.innerHTML = `
    <button id="_lb-x" style="position:absolute;top:12px;right:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,.12);border:none;border-radius:50%;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    ${hasPrev ? `<button id="_lb-prev" style="${btnStyle}left:10px;">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>` : ''}
    ${hasNext ? `<button id="_lb-next" style="${btnStyle}right:10px;">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>` : ''}
    <div id="_lb-media" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:${hasPrev || hasNext ? '60px 72px' : '60px 20px'};box-sizing:border-box;">
      ${_mediaHtml(item)}
    </div>
    ${_items.length > 1 ? `<div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:12px;letter-spacing:.05em;pointer-events:none;white-space:nowrap;">${_idx + 1} / ${_items.length}</div>` : ''}
  `

  document.body.appendChild(el)

  el.addEventListener('click', e => { if (e.target === el || e.target.id === '_lb-media') closeLightbox() })
  document.getElementById('_lb-x').onclick = closeLightbox
  document.getElementById('_lb-prev')?.addEventListener('click', e => { e.stopPropagation(); _go(_idx - 1) })
  document.getElementById('_lb-next')?.addEventListener('click', e => { e.stopPropagation(); _go(_idx + 1) })

  el.addEventListener('touchstart', e => {
    _txStart = e.touches[0].clientX
    _tyStart = e.touches[0].clientY
  }, { passive: true })
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _txStart
    const dy = Math.abs(e.changedTouches[0].clientY - _tyStart)
    if (Math.abs(dx) > 50 && dy < 80) _go(dx < 0 ? _idx + 1 : _idx - 1)
  }, { passive: true })

  const vid = el.querySelector('video')
  if (vid) {
    vid.muted = false
    vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}) })
  }
}

function _mediaHtml(item) {
  const s = 'max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:6px;'
  if (item.mediaType === 'video') {
    return `<video src="${item.mediaUrl}" loop playsinline preload="metadata" style="${s}"></video>`
  }
  return `<img src="${item.mediaUrl}" alt="" draggable="false" style="${s}" />`
}

function _go(idx) {
  if (idx < 0 || idx >= _items.length) return
  _idx = idx
  _render()
}

function _onKey(e) {
  if (e.key === 'Escape') closeLightbox()
  else if (e.key === 'ArrowLeft') _go(_idx - 1)
  else if (e.key === 'ArrowRight') _go(_idx + 1)
}
