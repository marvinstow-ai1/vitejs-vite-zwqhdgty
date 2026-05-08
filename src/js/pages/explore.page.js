import { shellHtml, wireShellNav, applyNavPref, refreshUnreadBadge } from '../shell.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { loadExplorePosts, loadExplorePostsMoods, loadUsernameMap } from '../services/posts.service.js'
import { detectMediaType, escapeHtml } from '../utils.js'
import { trackEvent } from '../analytics.js'

// ─── Module-level state ───────────────────────────────────────────────────────

let activeMood = null
let currentPage = 0
let allLoaded = false
const PAGE_SIZE = 24

// ─── Explore Page ─────────────────────────────────────────────────────────────

export async function showExplorePage(profile, nav) {
  applyNavPref()
  trackEvent('Explore Opened')

  // Reset pagination state on each page visit
  activeMood = null
  currentPage = 0
  allLoaded = false

  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${shellHtml('explore', profile)}
      <main class="app-main">
        <header class="topbar">
          <span style="font-size:16px;font-weight:600;letter-spacing:.02em;">Entdecken</span>
        </header>

        <div id="explore-mood-bar" style="display:flex;gap:8px;padding:10px 14px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;border-bottom:1px solid var(--border);flex-shrink:0;align-items:center;">
          <div style="color:#444;font-size:12px;white-space:nowrap;">Lädt…</div>
        </div>

        <div style="max-width:900px;margin:0 auto;padding:10px 8px 96px;">
          <div id="explore-grid" class="explore-grid"></div>
          <div id="explore-state" style="display:none;max-width:480px;margin:32px auto;padding:28px 20px;text-align:center;color:#888;font-size:13px;line-height:1.6;"></div>
          <div id="explore-more" style="display:none;text-align:center;padding:20px 0 8px;">
            <button id="btn-load-more" style="padding:10px 28px;background:transparent;border:1px solid #2a2a2a;border-radius:24px;color:#666;font-size:13px;cursor:pointer;touch-action:manipulation;">Mehr entdecken</button>
          </div>
        </div>
      </main>
    </div>`

  wireShellNav(profile, nav)
  getUnreadCount(profile.id).then(c => refreshUnreadBadge(c)).catch(() => {})

  await Promise.all([
    _loadMoods(profile, nav),
    _loadGrid(profile, nav, false),
  ])
}

// ─── Mood bar ─────────────────────────────────────────────────────────────────

async function _loadMoods(profile, nav) {
  const bar = document.querySelector('#explore-mood-bar')
  if (!bar) return

  const moods = await loadExplorePostsMoods()

  if (!moods.length) {
    bar.innerHTML = `<span style="color:#444;font-size:12px;">Keine Moods vorhanden</span>`
    return
  }

  const renderChips = () => {
    bar.innerHTML = `
      ${_moodChip('', 'Alle', activeMood === null)}
      ${moods.map(m => _moodChip(m, '#' + m, activeMood === m)).join('')}`

    bar.querySelectorAll('.explore-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMood = btn.dataset.mood || null
        currentPage = 0
        allLoaded = false
        renderChips()
        _loadGrid(profile, nav, false)
      })
    })
  }

  renderChips()
}

function _moodChip(mood, label, active) {
  return `<button class="explore-chip" data-mood="${mood}" style="padding:6px 14px;border-radius:20px;border:${active ? 'none' : '1px solid #2a2a2a'};background:${active ? '#fff' : 'transparent'};color:${active ? '#000' : '#666'};font-size:12px;font-weight:${active ? '500' : '400'};cursor:pointer;white-space:nowrap;flex-shrink:0;touch-action:manipulation;">${escapeHtml(label)}</button>`
}

// ─── Grid loading ─────────────────────────────────────────────────────────────

async function _loadGrid(profile, nav, append) {
  const grid = document.querySelector('#explore-grid')
  const stateEl = document.querySelector('#explore-state')
  const moreEl = document.querySelector('#explore-more')
  if (!grid || !stateEl) return

  if (!append) {
    grid.innerHTML = _skeletonHtml()
    stateEl.style.display = 'none'
    if (moreEl) moreEl.style.display = 'none'
  } else {
    if (moreEl) moreEl.style.display = 'none'
    const loadingRow = document.createElement('div')
    loadingRow.id = 'explore-loading-more'
    loadingRow.style.cssText = 'text-align:center;padding:16px;color:#444;font-size:13px;'
    loadingRow.textContent = 'Lädt…'
    grid.appendChild(loadingRow)
  }

  const { data: posts, error } = await loadExplorePosts(currentPage, activeMood, PAGE_SIZE)

  if (!append) {
    grid.innerHTML = ''
  } else {
    document.querySelector('#explore-loading-more')?.remove()
  }

  if (error) {
    if (!append) {
      stateEl.style.display = 'block'
      stateEl.innerHTML = `
        <div style="font-size:28px;margin-bottom:12px;">⚠</div>
        <p style="color:#555;font-size:13px;margin:0;">Explore konnte nicht geladen werden.</p>`
    }
    return
  }

  // Filter out embeds (image-first content strategy)
  const imagePosts = (posts || []).filter(p => {
    const mt = p.media_type || detectMediaType(p.media_url)
    return mt !== 'youtube' && mt !== 'instagram' && !!p.media_url
  })

  if (!imagePosts.length && !append) {
    stateEl.style.display = 'block'
    stateEl.innerHTML = `
      <div style="font-size:32px;margin-bottom:14px;opacity:.6;">🌌</div>
      <p style="color:#bbb;font-size:14px;margin:0 0 8px;">${activeMood ? `Noch nichts unter <strong style="color:#fff;">#${escapeHtml(activeMood)}</strong>` : 'Noch nichts zu entdecken.'}</p>
      <p style="color:#555;font-size:12px;margin:0;">Die ersten öffentlichen Posts erscheinen hier.</p>`
    return
  }

  if (!imagePosts.length && append) {
    allLoaded = true
    return
  }

  const userIds = [...new Set(imagePosts.map(p => p.user_id))]
  const usernameMap = await loadUsernameMap(userIds)

  const cards = imagePosts.map(p => _renderCard(p, usernameMap)).join('')

  if (append) {
    grid.insertAdjacentHTML('beforeend', cards)
  } else {
    grid.innerHTML = cards
  }

  _wireCards(grid, imagePosts, usernameMap, nav.navigate)

  if ((posts || []).length === PAGE_SIZE) {
    if (moreEl) {
      moreEl.style.display = 'block'
      const btn = document.querySelector('#btn-load-more')
      if (btn) {
        const fresh = btn.cloneNode(true)
        btn.parentNode.replaceChild(fresh, btn)
        fresh.addEventListener('click', () => {
          currentPage++
          _loadGrid(profile, nav, true)
        })
      }
    }
  } else {
    allLoaded = true
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function _skeletonHtml() {
  const heights = [150, 210, 170, 230, 180, 160]
  return Array.from({ length: 12 }, (_, i) =>
    `<div style="break-inside:avoid;margin-bottom:6px;border-radius:10px;height:${heights[i % 6]}px;" class="explore-skel"></div>`
  ).join('')
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function _renderCard(post, usernameMap) {
  const mt = post.media_type || detectMediaType(post.media_url)
  const username = usernameMap[post.user_id] || 'unknown'
  const mediaHtml = mt === 'video' || mt === 'gif'
    ? `<video src="${escapeHtml(post.media_url)}" style="width:100%;display:block;" autoplay loop muted playsinline></video>`
    : `<img src="${escapeHtml(post.media_url)}" alt="" style="width:100%;display:block;" loading="lazy" />`

  return `
    <div class="explore-card" data-post-id="${post.id}" style="break-inside:avoid;margin-bottom:6px;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;background:#111;">
      ${mediaHtml}
      <div class="explore-hover" style="position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(0,0,0,0.65));opacity:0;transition:opacity 0.18s;display:flex;align-items:flex-end;padding:8px 10px;pointer-events:none;">
        <span style="font-size:11px;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${escapeHtml(username)}${post.mood ? ' · #' + escapeHtml(post.mood) : ''}</span>
      </div>
    </div>`
}

function _wireCards(grid, posts, usernameMap, navigate) {
  grid.querySelectorAll('.explore-card').forEach(card => {
    const post = posts.find(p => p.id === card.dataset.postId)
    if (!post) return

    card.addEventListener('mouseenter', () => {
      const h = card.querySelector('.explore-hover')
      if (h) h.style.opacity = '1'
    })
    card.addEventListener('mouseleave', () => {
      const h = card.querySelector('.explore-hover')
      if (h) h.style.opacity = '0'
    })

    card.addEventListener('click', () => _openLightbox(post, usernameMap, navigate))
  })
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function _openLightbox(post, usernameMap, navigate) {
  const existing = document.querySelector('#explore-lightbox')
  if (existing) existing.remove()

  const mt = post.media_type || detectMediaType(post.media_url)
  const username = escapeHtml(usernameMap[post.user_id] || 'unknown')

  const lb = document.createElement('div')
  lb.id = 'explore-lightbox'
  lb.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.96);display:flex;flex-direction:column;align-items:center;justify-content:center;'

  lb.innerHTML = `
    <button id="lb-close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:22px;cursor:pointer;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;z-index:10;touch-action:manipulation;">×</button>
    <div style="width:100%;max-width:700px;max-height:calc(100vh - 90px);display:flex;align-items:center;justify-content:center;padding:56px 16px 0;box-sizing:border-box;">
      ${mt === 'video' || mt === 'gif'
        ? `<video src="${escapeHtml(post.media_url)}" style="max-width:100%;max-height:calc(100vh - 148px);object-fit:contain;border-radius:8px;display:block;" autoplay loop muted playsinline></video>`
        : `<img src="${escapeHtml(post.media_url)}" alt="" style="max-width:100%;max-height:calc(100vh - 148px);object-fit:contain;border-radius:8px;display:block;" />`}
    </div>
    <div style="width:100%;max-width:700px;padding:14px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;box-sizing:border-box;">
      <div style="flex:1;min-width:0;">
        <div id="lb-username" style="font-size:13px;color:#bbb;cursor:pointer;">@${username}</div>
        ${post.mood ? `<div style="font-size:12px;color:#444;margin-top:2px;">#${escapeHtml(post.mood)}</div>` : ''}
      </div>
      <button id="lb-profile" style="padding:7px 16px;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#ccc;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;touch-action:manipulation;">Profil anzeigen</button>
    </div>`

  document.body.appendChild(lb)

  const rawUsername = usernameMap[post.user_id] || 'unknown'
  const close = () => lb.remove()
  lb.querySelector('#lb-close').addEventListener('click', close)
  lb.addEventListener('click', e => { if (e.target === lb) close() })
  lb.querySelector('#lb-username').addEventListener('click', () => { close(); navigate('/u/' + rawUsername) })
  lb.querySelector('#lb-profile').addEventListener('click', () => { close(); navigate('/u/' + rawUsername) })
}
