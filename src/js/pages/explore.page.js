import { updateShellContent, updateActiveNav, wireShellNav, applyNavPref, refreshUnreadBadge, updateGlobalHeader, refreshGlobalHeaderBadge } from '../shell.js'
import { iconSvg, escapeHtml, detectMediaType, renderMediaEl, timeAgo } from '../utils.js'
import { initGridCols } from '../grid-utils.js'
import { renderGridControls } from '../grid-controls.js'
import { loadExplorePosts, loadExploreMoodTags, loadSuggestedUsers, loadPostInteractions, loadUsernameMap } from '../services/posts.service.js'
import { toggleLike, addRepost, removeRepost, getOrCreateRepostsBoardId, loadComments, insertComment } from '../services/interactions.service.js'
import { notifyAction } from '../services/notify.action.js'
import { getBoardsByUser } from '../services/boards.service.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { openCommentsModal, openRepostModal } from './feed.page.js'

// ─── Explore-scoped state ─────────────────────────────────────────────────────
let exploreMood = null
let exploreCursor = null
let exploreLoading = false
let exploreHasMore = true
const EXPLORE_LIMIT = 30

// ─── Explore-scoped state (continued) ─────────────────────────────────────────

// ─── IntersectionObserver für Video-Autoplay ──────────────────────────────────
let _exploreObserver = null
function _getExploreObserver() {
  if (_exploreObserver) return _exploreObserver
  _exploreObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target
      if (e.isIntersecting) { v.muted = true; v.play().catch(() => {}) }
      else { v.pause(); v.currentTime = 0 }
    })
  }, { threshold: 0.1, rootMargin: '200px' })
  return _exploreObserver
}

// ─── Explore Page ─────────────────────────────────────────────────────────────

/**
 * Zeigt die Explore-Seite.
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, toggleNotif: function }} nav
 */
export async function showExplorePage(profile, nav) {
  applyNavPref()
  document.body.classList.add('has-global-header')
  document.body.classList.remove('profile-page')

  // State zurücksetzen bei jedem Seitenaufruf
  exploreMood = null
  exploreCursor = null
  exploreLoading = false
  exploreHasMore = true

  updateActiveNav('explore')
  updateShellContent(`
    <!-- Mood-Filter Chips -->
    <div id="explore-moods" style="display:flex;gap:8px;padding:10px 14px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border);-webkit-overflow-scrolling:touch;flex-shrink:0;">
      <div style="color:#444;font-size:12px;padding:6px 0;align-self:center;">Lädt…</div>
    </div>

    <!-- Suggested Users -->
    <div id="explore-suggestions" style="display:none;padding:14px 14px 0;"></div>

    <!-- NEU: Discovery-Kacheln -->
    <div class="discovery-tiles">
      <button class="discovery-tile" data-discovery="personal">
        <div class="discovery-tile-icon">${iconSvg('spark', 16)}</div>
        <div class="discovery-tile-content">
          <div class="discovery-tile-title">Für dich</div>
          <div class="discovery-tile-desc">Beiträge, die zu dir passen</div>
        </div>
        <div class="discovery-tile-chev">${iconSvg('chevR', 14)}</div>
      </button>
      <button class="discovery-tile" data-discovery="boards">
        <div class="discovery-tile-icon discovery-tile-icon--boards">
          <div class="board-preview-grid">
            <div class="board-preview-cell" style="background:#333"></div>
            <div class="board-preview-cell" style="background:#444"></div>
            <div class="board-preview-cell" style="background:#555"></div>
            <div class="board-preview-cell" style="background:#666"></div>
            <div class="board-preview-cell" style="background:#777"></div>
            <div class="board-preview-cell" style="background:#888"></div>
            <div class="board-preview-cell" style="background:#999"></div>
            <div class="board-preview-cell" style="background:#aaa"></div>
            <div class="board-preview-cell" style="background:#bbb"></div>
          </div>
        </div>
        <div class="discovery-tile-content">
          <div class="discovery-tile-title">Board-Vorschläge</div>
          <div class="discovery-tile-desc">Entdecke neue Boards</div>
        </div>
        <div class="discovery-tile-chev">${iconSvg('chevR', 14)}</div>
      </button>
    </div>

    <!-- Grid Controls -->
    <div id="explore-grid-controls" class="grid-controls"></div>

    <!-- Post Grid (Unified Grid) -->
    <div id="explore-grid" class="unified-grid"></div>

    <!-- Load More -->
    <div id="explore-more" style="display:none;padding:20px;text-align:center;">
      <button id="btn-load-more" class="btn" style="min-width:140px;">Mehr laden</button>
    </div>

    <!-- Empty / Error State -->
    <div id="explore-state" style="display:none;padding:60px 24px;text-align:center;color:#444;font-size:14px;"></div>`)

  // Globaler Header updaten (persistent via renderShell)
  updateGlobalHeader({
    tone: 'auto',
    title: 'Explore',
    showSearch: true,
    showCompose: true,
    profile,
  })

  wireShellNav(profile, nav)
  getUnreadCount(profile.id).then(c => {
    refreshUnreadBadge(c)
    refreshGlobalHeaderBadge(c)
  }).catch(() => {})

  // Unified Grid initialisieren
  initGridCols('#explore-grid')
  renderGridControls(document.querySelector('#explore-grid-controls'), '#explore-grid')

  // Mood-Chips + Suggestions + erste Posts parallel laden
  _loadMoodChips(profile, nav)
  _loadSuggestions(profile, nav)
  await _loadExploreGrid(profile, nav, true)

  // Discovery-Tiles Events
  document.querySelector('.discovery-tiles')?.addEventListener('click', (e) => {
    const tile = e.target.closest('.discovery-tile');
    if (!tile) return;
    const type = tile.dataset.discovery;
    if (type === 'personal') {
      // TODO: Personalisierten Feed laden (Algorithmus Phase 9/10)
      tile.classList.toggle('discovery-tile--active');
      document.querySelector('#explore-grid').innerHTML = `<div class="feed-state">${iconSvg('spark', 16)} Personalisierte Ansicht – kommt bald!</div>`;
    } else if (type === 'boards') {
      // TODO: Board-Vorschläge laden
      window.location.hash = '#/boards/suggested';
    }
  });

  document.querySelector('#btn-load-more')?.addEventListener('click', () =>
    _loadExploreGrid(profile, nav, false)
  )
}

// ─── Mood Chips ───────────────────────────────────────────────────────────────

async function _loadMoodChips(profile, nav) {
  const bar = document.querySelector('#explore-moods')
  if (!bar) return
  const moods = await loadExploreMoodTags()
  if (!moods.length) { bar.style.display = 'none'; return }

  bar.innerHTML = `
    <button class="mood-chip ${!exploreMood ? 'mood-chip-active' : ''}" data-mood="" style="${_chipStyle(!exploreMood)}">
      Alle
    </button>
    ${moods.map(([mood]) => `
      <button class="mood-chip ${exploreMood === mood ? 'mood-chip-active' : ''}" data-mood="${mood}" style="${_chipStyle(exploreMood === mood)}">
        #${mood}
      </button>`).join('')}`

  bar.querySelectorAll('.mood-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      exploreMood = btn.dataset.mood || null
      exploreCursor = null
      exploreHasMore = true
      // Aktiven Chip highlighten
      bar.querySelectorAll('.mood-chip').forEach(b => {
        const active = b.dataset.mood === (exploreMood || '')
        b.style.cssText = _chipStyle(active)
        b.classList.toggle('mood-chip-active', active)
      })
      _loadExploreGrid(profile, nav, true)
    })
  })
}

function _chipStyle(active) {
  return active
    ? 'padding:5px 14px;border-radius:999px;border:none;background:#fff;color:#000;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;flex-shrink:0;'
    : 'padding:5px 14px;border-radius:999px;border:1px solid #2a2a2a;background:transparent;color:#888;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;'
}

// ─── Suggested Users ──────────────────────────────────────────────────────────

async function _loadSuggestions(profile, nav) {
  const wrap = document.querySelector('#explore-suggestions')
  if (!wrap) return
  const users = await loadSuggestedUsers(profile.id, 6)
  if (!users.length) return

  wrap.style.display = 'block'
  wrap.innerHTML = `
    <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Vorschläge für dich</div>
    <div style="display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:14px;-webkit-overflow-scrolling:touch;">
      ${users.map(u => `
        <div class="suggest-card" data-username="${u.username}" style="flex-shrink:0;width:100px;cursor:pointer;text-align:center;">
          <div style="width:52px;height:52px;border-radius:50%;background:#1a1a1a;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;margin:0 auto 6px;">
            ${u.username[0].toUpperCase()}
          </div>
          <div style="font-size:11px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${escapeHtml(u.username)}</div>
          ${u.followerCount ? `<div style="font-size:10px;color:#555;margin-top:2px;">${u.followerCount} Follower</div>` : ''}
        </div>`).join('')}
    </div>
    <div style="height:1px;background:var(--border);margin-bottom:4px;"></div>`

  wrap.querySelectorAll('.suggest-card').forEach(card => {
    card.addEventListener('click', () => nav.navigate('/u/' + card.dataset.username))
  })
}

// ─── Grid laden ───────────────────────────────────────────────────────────────

async function _loadExploreGrid(profile, nav, reset) {
  if (exploreLoading) return
  exploreLoading = true

  const grid = document.querySelector('#explore-grid')
  const moreBtn = document.querySelector('#explore-more')
  const state = document.querySelector('#explore-state')
  if (!grid) { exploreLoading = false; return }

  if (reset) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;"><div class="spinner-wrap"><div class="spinner"></div></div></div>`
    state.style.display = 'none'
    if (moreBtn) moreBtn.style.display = 'none'
    exploreCursor = null
    exploreHasMore = true
  }

  const { posts, error } = await loadExplorePosts(profile.id, exploreMood, EXPLORE_LIMIT, exploreCursor)
  exploreLoading = false

  if (error) {
    if (reset) grid.innerHTML = ''
    state.style.display = 'block'
    state.innerHTML = `<div style="font-size:28px;margin-bottom:10px;">${iconSvg('mood', 28)}</div><p>Konnte Explore nicht laden.</p>`
    return
  }

  if (!posts.length && reset) {
    grid.innerHTML = ''
    state.style.display = 'block'
    state.innerHTML = exploreMood
      ? `<div style="font-size:28px;margin-bottom:10px;">${iconSvg('volume', 28)}</div><p style="color:#555;">Keine öffentlichen Posts mit #${exploreMood}.</p>`
      : `<div style="font-size:28px;margin-bottom:10px;">${iconSvg('plant', 28)}</div><p style="color:#555;">Noch keine öffentlichen Posts zum Entdecken.</p>`
    return
  }

  // Cursor für nächste Seite
  if (posts.length > 0) {
    exploreCursor = posts[posts.length - 1].created_at
  }
  exploreHasMore = posts.length === EXPLORE_LIMIT

  // Interaktionen + Usernamen laden
  const userIds = [...new Set(posts.map(p => p.user_id))]
  const [usernameMap, interactions] = await Promise.all([
    loadUsernameMap(userIds),
    loadPostInteractions(posts.map(p => p.id), profile.id),
  ])

  if (reset) grid.innerHTML = ''

  const fragment = posts.map(p => _renderExploreCard(p, profile.id, usernameMap, interactions)).join('')
  grid.insertAdjacentHTML('beforeend', fragment)

  _wireExploreActions(profile, nav)

  if (moreBtn) moreBtn.style.display = exploreHasMore ? 'block' : 'none'
}

// ─── Card Render ──────────────────────────────────────────────────────────────

function _renderExploreCard(post, currentUserId, usernameMap, interactions) {
  const { likeCounts, userLikedSet, commentCounts, repostCounts, userRepostedSet } = interactions
  const liked = userLikedSet.has(post.id)
  const reposted = userRepostedSet.has(post.id)
  const lc = likeCounts[post.id] || 0
  const cc = commentCounts[post.id] || 0
  const rc = repostCounts[post.id] || 0
  const username = usernameMap[post.user_id] || 'unknown'
  const mt = post.media_type || detectMediaType(post.media_url)
  const isVideo = mt === 'video'
  const isEmbed = mt === 'youtube' || mt === 'instagram'

  let mediaHtml
  if (isVideo) {
    mediaHtml = `<video src="${escapeHtml(post.media_url || '')}" muted loop playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block;"></video>`
  } else if (isEmbed) {
    mediaHtml = renderMediaEl(post.media_url, mt, { borderRadius: '0' })
  } else {
    // images and gifs both render as <img> (gif animates natively)
    mediaHtml = `<img src="${escapeHtml(post.media_url || '')}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">`
  }

  const muteBtn = isVideo
    ? `<button class="explore-mute-btn" data-muted="1" title="Ton umschalten">${iconSvg('volume', 14)}</button>`
    : ''

  return `
    <div class="unified-cell" data-post-id="${post.id}">
      <div class="explore-media" data-post-id="${post.id}" data-media-url="${escapeHtml(post.media_url || '')}" data-media-type="${mt}" data-owner-id="${post.user_id}" style="position:absolute;inset:0;">
        ${mediaHtml}
      </div>
      <!-- Hover Overlay -->
      <div class="explore-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;flex-direction:column;justify-content:flex-end;padding:8px;opacity:0;transition:opacity .18s;pointer-events:none;z-index:2;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="explore-username" data-username="${username}" style="font-size:11px;color:rgba(255,255,255,0.85);pointer-events:all;cursor:pointer;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${username}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:11px;color:rgba(255,255,255,0.7);display:inline-flex;align-items:center;gap:2px;">${iconSvg('heart', 11)} ${lc}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.7);display:inline-flex;align-items:center;gap:2px;">${iconSvg('comment', 11)} ${cc}</span>
          </div>
        </div>
        ${post.mood ? `<span class="explore-mood-tag" data-mood="${post.mood}" style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px;pointer-events:all;cursor:pointer;">#${post.mood}</span>` : ''}
      </div>
      <!-- Action Bar (immer sichtbar auf Mobile) -->
      <div class="explore-actions" style="position:absolute;bottom:0;left:0;right:0;z-index:3;display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(0,0,0,0.6);">
        <button class="explore-like-btn" data-post-id="${post.id}" data-liked="${liked}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:2px;background:none;border:none;cursor:pointer;color:${liked ? '#ff4d6d' : '#888'};font-size:11px;padding:3px 4px;border-radius:4px;flex:1;justify-content:center;">
          <span class="explore-like-icon" style="display:inline-flex;align-items:center;">${iconSvg('heart', 13, liked ? 'currentColor' : 'none')}</span>
          <span class="explore-like-count" data-post-id="${post.id}">${lc}</span>
        </button>
        <button class="explore-comment-btn" data-post-id="${post.id}" data-media-url="${escapeHtml(post.media_url || '')}" data-media-type="${mt}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:2px;background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:3px 4px;border-radius:4px;flex:1;justify-content:center;">
          <span style="display:inline-flex;align-items:center;">${iconSvg('comment', 13)}</span>
          <span class="explore-comment-count" data-post-id="${post.id}">${cc}</span>
        </button>
        <button class="explore-repost-btn" data-post-id="${post.id}" data-reposted="${reposted}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:2px;background:none;border:none;cursor:pointer;color:${reposted ? '#06d6a0' : '#888'};font-size:11px;padding:3px 4px;border-radius:4px;flex:1;justify-content:center;">
          <span style="display:inline-flex;align-items:center;">${iconSvg('repost', 13)}</span>
          <span class="explore-repost-count" data-post-id="${post.id}">${rc}</span>
        </button>
      </div>
      ${muteBtn}
    </div>`
}

// ─── Wire Actions ─────────────────────────────────────────────────────────────

function _wireExploreActions(profile, nav) {
  const obs = _getExploreObserver()

  // Hover-Overlay auf Desktop + Video-Autoplay via IntersectionObserver
  document.querySelectorAll('#explore-grid .unified-cell').forEach(card => {
    const overlay = card.querySelector('.explore-overlay')
    if (overlay) {
      card.addEventListener('mouseenter', () => {
        overlay.style.opacity = '1'
        overlay.style.background = 'rgba(0,0,0,0.45)'
      })
      card.addEventListener('mouseleave', () => {
        overlay.style.opacity = '0'
        overlay.style.background = 'rgba(0,0,0,0)'
      })
    }
    // Video-Autoplay beobachten
    const v = card.querySelector('video')
    if (v) obs.observe(v)
  })

  // Mute-Buttons verdrahten
  document.querySelectorAll('#explore-grid .explore-mute-btn').forEach(btn => {
    if (btn.dataset.wired === '1') return
    btn.dataset.wired = '1'
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const card = btn.closest('.unified-cell')
      const v = card?.querySelector('video')
      if (!v) return
      const nowMuted = btn.dataset.muted === '1'
      v.muted = !nowMuted
      btn.dataset.muted = nowMuted ? '0' : '1'
      btn.innerHTML = nowMuted ? iconSvg('volume', 14) : iconSvg('volume', 14)
    })
  })

  // Media-Klick → Comments Modal
  document.querySelectorAll('#explore-grid .explore-media').forEach(wrap => {
    if (wrap.dataset.mediaType === 'youtube' || wrap.dataset.mediaType === 'instagram') return
    wrap.addEventListener('click', () => openCommentsModal(
      wrap.dataset.postId, wrap.dataset.mediaUrl, wrap.dataset.mediaType, profile.id, wrap.dataset.ownerId
    ))
  })

  // Username-Klick → Profil
  document.querySelectorAll('#explore-grid .explore-username').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); nav.navigate('/u/' + el.dataset.username) })
  })

  // Mood-Tag-Klick → Filter setzen
  document.querySelectorAll('#explore-grid .explore-mood-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation()
      exploreMood = tag.dataset.mood
      exploreCursor = null
      exploreHasMore = true
      // Chips aktualisieren
      document.querySelectorAll('#explore-moods .mood-chip').forEach(b => {
        const active = b.dataset.mood === exploreMood
        b.style.cssText = _chipStyle(active)
      })
      _loadExploreGrid(profile, nav, true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })

  // Like
  document.querySelectorAll('#explore-grid .explore-like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); _handleExploreLike(btn, profile.id) })
  })

  // Comment
  document.querySelectorAll('#explore-grid .explore-comment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openCommentsModal(btn.dataset.postId, btn.dataset.mediaUrl, btn.dataset.mediaType, profile.id, btn.dataset.ownerId)
    })
  })

  // Repost
  document.querySelectorAll('#explore-grid .explore-repost-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); _handleExploreRepost(btn, profile.id) })
  })
}

// ─── Like Handler ─────────────────────────────────────────────────────────────

async function _handleExploreLike(btn, currentUserId) {
  const postId = btn.dataset.postId
  const liked = btn.dataset.liked === 'true'
  const ownerId = btn.dataset.ownerId
  const countEl = btn.querySelector('.explore-like-count')
  const iconEl = btn.querySelector('.explore-like-icon')
  const current = parseInt(countEl?.textContent || '0')

  // Optimistic UI
  btn.dataset.liked = String(!liked)
  btn.style.color = !liked ? '#ff4d6d' : '#888'
  if (iconEl) iconEl.innerHTML = iconSvg('heart', 13, !liked ? 'currentColor' : 'none')
  if (countEl) countEl.textContent = !liked ? current + 1 : Math.max(0, current - 1)

  const { error } = await toggleLike(postId, currentUserId, liked, ownerId)
  if (error) {
    // Rollback
    btn.dataset.liked = String(liked)
    btn.style.color = liked ? '#ff4d6d' : '#888'
    if (iconEl) iconEl.innerHTML = iconSvg('heart', 13, liked ? 'currentColor' : 'none')
    if (countEl) countEl.textContent = current
  } else if (!liked && ownerId) {
    notifyAction(ownerId, currentUserId, 'like').catch(() => {})
  }
}

// ─── Repost Handler ───────────────────────────────────────────────────────────

async function _handleExploreRepost(btn, currentUserId) {
  const postId = btn.dataset.postId
  const reposted = btn.dataset.reposted === 'true'
  const ownerId = btn.dataset.ownerId
  const countEl = btn.querySelector('.explore-repost-count')
  const current = parseInt(countEl?.textContent || '0')

  if (reposted) {
    btn.dataset.reposted = 'false'
    btn.style.color = '#888'
    if (countEl) countEl.textContent = Math.max(0, current - 1)
    const { error } = await removeRepost(postId, currentUserId)
    if (error) {
      btn.dataset.reposted = 'true'
      btn.style.color = '#06d6a0'
      if (countEl) countEl.textContent = current
    }
    return
  }

  const boards = await getBoardsByUser(currentUserId)
  openRepostModal(boards, async ({ boardId, showOnProfile }) => {
    btn.dataset.reposted = 'true'
    btn.style.color = '#06d6a0'
    if (countEl) countEl.textContent = current + 1
    const { error } = await addRepost(postId, currentUserId, ownerId, { boardId, showOnProfile })
    if (error) {
      btn.dataset.reposted = 'false'
      btn.style.color = '#888'
      if (countEl) countEl.textContent = current
    } else if (ownerId) {
      notifyAction(ownerId, currentUserId, 'repost').catch(() => {})
    }
  })
}
