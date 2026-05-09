import { supabase } from '../supabase.js'
import { getSession } from '../services/auth.service.js'
import { getBoardPosts, getBoardsByUser, addPostToBoard, deleteBoard, getUserRepostIds } from '../services/boards.service.js'
import { getVisiblePostIds } from '../services/posts.service.js'
import { escapeHtml, detectMediaType, getYouTubeEmbedUrl, buildMusicEmbed } from '../utils.js'
import { addRepost, removeRepost } from '../services/interactions.service.js'
import { renderGlobalHeader } from '../shell.js'

// ── Grid-CSS (einmalig injizieren) ────────────────────────────────────────────
const BOARD_GRID_CSS = `
.board-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px;}
.board-cell{position:relative;overflow:hidden;background:#111;aspect-ratio:9/16;cursor:pointer;}
.board-cell img,.board-cell video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s;}
.board-cell:hover img,.board-cell:hover video{transform:scale(1.04);}
.board-mute-btn{position:absolute;bottom:6px;right:6px;z-index:4;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,0.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;backdrop-filter:blur(4px);padding:0;}
.board-mute-btn:hover{background:rgba(0,0,0,0.7);}
`
let _boardCssInjected = false
function _injectBoardCss() {
  if (_boardCssInjected) return
  _boardCssInjected = true
  const s = document.createElement('style')
  s.textContent = BOARD_GRID_CSS
  document.head.appendChild(s)
}

// ── IntersectionObserver für Video-Autoplay ───────────────────────────────────
let _boardObserver = null
function _getBoardObserver() {
  if (_boardObserver) return _boardObserver
  _boardObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target
      if (e.isIntersecting) { v.muted = true; v.play().catch(() => {}) }
      else { v.pause(); v.currentTime = 0 }
    })
  }, { threshold: 0.25, rootMargin: '100px' })
  return _boardObserver
}

/**
 * Rendert einen einzelnen Board-Post als Kachel (9:16 Grid, kein Masonry).
 */
export function renderBoardPost(post, isOwner, opts = {}) {
  _injectBoardCss()
  const { viewerId = null, viewerReposted = false } = opts
  const mt = post.media_type || detectMediaType(post.media_url)
  const vis = post.visibility || 'public'
  const badge = isOwner && vis !== 'public'
    ? `<div style="position:absolute;top:4px;left:4px;z-index:3;background:rgba(0,0,0,0.65);border-radius:8px;padding:2px 5px;font-size:10px;color:#ccc;">${vis === 'private' ? '🔒' : '👥'}</div>`
    : ''
  const canRepost = !!viewerId && post.user_id !== viewerId
  const repostBtn = canRepost
    ? `<button class="board-repost-btn" data-post-id="${post.id}" data-owner-id="${post.user_id}" data-reposted="${viewerReposted}" aria-label="Reposten" style="position:absolute;top:4px;right:4px;z-index:4;background:rgba(0,0,0,0.65);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${viewerReposted ? '#06d6a0' : '#fff'};font-size:13px;line-height:1;">🔁</button>`
    : ''
  if (mt === 'video' || mt === 'gif') {
    return `<div class="board-cell" data-post-id="${post.id}"><video src="${post.media_url}" muted loop playsinline preload="none" style="width:100%;height:100%;object-fit:cover;display:block;"></video>${badge}${repostBtn}<button class="board-mute-btn" data-muted="1" title="Ton umschalten">🔇</button></div>`
  }
  if (mt === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(post.media_url)
    return `<div class="board-cell" data-post-id="${post.id}" style="aspect-ratio:1;"><iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allow="autoplay;encrypted-media" allowfullscreen></iframe>${badge}${repostBtn}</div>`
  }
  return `<div class="board-cell" data-post-id="${post.id}"><img src="${post.media_url}" alt="" loading="lazy" onerror="this.style.display='none'" />${badge}${repostBtn}</div>`
}

/**
 * Startet IntersectionObserver für alle Video-Kacheln in einem Container
 * und verdrahtet Mute-Buttons.
 */
export function wireBoardVideos(container) {
  const obs = _getBoardObserver()
  container.querySelectorAll('.board-cell video').forEach(v => {
    obs.observe(v)
  })
  container.querySelectorAll('.board-mute-btn').forEach(btn => {
    if (btn.dataset.wired === '1') return
    btn.dataset.wired = '1'
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const cell = btn.closest('.board-cell')
      const v = cell?.querySelector('video')
      if (!v) return
      const nowMuted = btn.dataset.muted === '1'
      v.muted = !nowMuted
      btn.dataset.muted = nowMuted ? '0' : '1'
      btn.textContent = nowMuted ? '🔊' : '🔇'
    })
  })
}

/**
 * Verdrahtet Repost-Buttons in einem Board-Container.
 */
export function wireBoardRepostButtons(currentUserId, openRepostModal) {
  if (!currentUserId) return
  document.querySelectorAll('.board-repost-btn').forEach(btn => {
    if (btn.dataset.wired === '1') return
    btn.dataset.wired = '1'
    btn.addEventListener('click', e => {
      e.stopPropagation()
      _handleBoardRepost(btn, currentUserId, openRepostModal)
    })
  })
}

async function _handleBoardRepost(btn, currentUserId, openRepostModal) {
  const postId = btn.dataset.postId
  const reposted = btn.dataset.reposted === 'true'
  const ownerId = btn.dataset.ownerId

  if (reposted) {
    btn.dataset.reposted = 'false'
    btn.style.color = '#fff'
    await removeRepost(postId, currentUserId)
    return
  }

  if (ownerId === currentUserId) return

  const boards = await getBoardsByUser(currentUserId)

  openRepostModal(boards, async ({ boardId, showOnProfile }) => {
    btn.dataset.reposted = 'true'
    btn.style.color = '#06d6a0'
    await addRepost(postId, currentUserId, ownerId, { boardId, showOnProfile })
  })
}

/**
 * Lädt Board-Inhalt in einen Container.
 */
export async function loadBoardContent(boardId, container, isOwner, currentUserId, boards, username, { navigate, openRepostModal }) {
  const board = boards.find(b => b.id === boardId)
  if (!board) return

  const posts = await getBoardPosts(boardId, currentUserId)

  let viewerRepostedSet = new Set()
  if (currentUserId && !isOwner && posts.length) {
    viewerRepostedSet = await getUserRepostIds(currentUserId)
  }

  const visIcon = board.visibility === 'private' ? '🔒' : board.visibility === 'followers' ? '👥' : '🌍'

  container.innerHTML = `
    <div style="padding:16px 16px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="color:#fff;font-size:16px;font-weight:500;">${escapeHtml(board.title)}</span>
          <span style="font-size:12px;color:#555;">${visIcon}</span>
        </div>
        ${board.description ? `<p style="color:#555;font-size:13px;margin:0 0 4px;">${escapeHtml(board.description)}</p>` : ''}
        ${board.mood ? `<span style="font-size:12px;color:#444;">#${escapeHtml(board.mood)}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        ${board.playlist_url ? `<button class="board-playlist-btn" data-url="${escapeHtml(board.playlist_url)}" style="padding:6px 12px;background:#1a1a1a;color:#aaa;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:12px;">🎵 Playlist</button>` : ''}
        ${isOwner ? `
          <button class="board-edit-btn" data-board-id="${board.id}" style="padding:6px 12px;background:#1a1a1a;color:#aaa;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:12px;">✏️ Edit</button>
          <button class="board-delete-btn" data-board-id="${board.id}" style="padding:6px 12px;background:#1a1a1a;color:#ff4d6d;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:12px;">🗑</button>
        ` : ''}
      </div>
    </div>
    ${board.playlist_url ? `<div class="board-music-panel" style="display:none;padding:0 16px;margin-top:12px;"></div>` : ''}
    <div class="board-grid" style="margin-top:12px;">
      ${posts.map(post => renderBoardPost(post, isOwner, { viewerId: currentUserId, viewerReposted: viewerRepostedSet.has(post.id) })).join('')}
      ${!posts.length ? `<p style="color:#333;font-size:14px;padding:40px;grid-column:1/-1;">Dieses Board ist leer.</p>` : ''}
    </div>
    ${isOwner ? `
      <div style="padding:16px;">
        <p style="color:#444;font-size:12px;margin-bottom:10px;">Post zu diesem Board hinzufügen:</p>
        <input id="board-add-post-id" type="text" placeholder="Post-ID einfügen..." style="width:100%;padding:9px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;box-sizing:border-box;outline:none;margin-bottom:8px;" />
        <button id="board-add-post-btn" data-board-id="${board.id}" style="padding:8px 16px;background:#fff;color:#000;border:none;border-radius:8px;font-size:12px;cursor:pointer;">Hinzufügen</button>
        <span id="board-add-msg" style="font-size:12px;color:#555;margin-left:8px;"></span>
      </div>` : ''}
  `

  wireBoardRepostButtons(currentUserId, openRepostModal)
  wireBoardVideos(container)

  container.querySelector('.board-playlist-btn')?.addEventListener('click', e => {
    const panel = container.querySelector('.board-music-panel')
    if (panel.style.display === 'none') { panel.style.display = 'block'; panel.innerHTML = buildMusicEmbed(e.target.dataset.url) }
    else { panel.style.display = 'none'; panel.innerHTML = '' }
  })

  container.querySelector('.board-edit-btn')?.addEventListener('click', () => {
    // openBoardModal wird von profile.page.js bereitgestellt
    container.dispatchEvent(new CustomEvent('board-edit', { detail: { board }, bubbles: true }))
  })

  container.querySelector('.board-delete-btn')?.addEventListener('click', async () => {
    if (!confirm(`Board "${board.title}" löschen?`)) return
    await deleteBoard(board.id)
    navigate('/u/' + username)
  })

  container.querySelector('#board-add-post-btn')?.addEventListener('click', async () => {
    const postId = container.querySelector('#board-add-post-id').value.trim()
    const msg = container.querySelector('#board-add-msg')
    if (!postId) { msg.textContent = 'ID fehlt'; return }
    msg.textContent = 'Hinzufügen...'
    const { error } = await addPostToBoard(board.id, postId, currentUserId)
    if (error) { msg.textContent = error.code === '23505' ? 'Bereits im Board' : '❌ ' + error.message; return }
    msg.textContent = '✅ Hinzugefügt!'
    container.querySelector('#board-add-post-id').value = ''
    await loadBoardContent(boardId, container, isOwner, currentUserId, boards, username, { navigate, openRepostModal })
  })
}

/**
 * Zeigt eine eigenständige Board-Seite (/u/:username/board/:id).
 */
export async function showBoardPage(username, boardId, { navigate, openRepostModal }) {
  const app = document.querySelector('#app')
  document.body.classList.add('has-global-header')
  document.body.classList.remove('profile-page')

  app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#444;">Lädt...</div>`

  const session = await getSession()
  const currentUserId = session?.user?.id || null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .single()
  if (!profile) { app.innerHTML = `<p style="color:#555;padding:40px;">Profil nicht gefunden</p>`; return }

  const { data: board } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .single()
  if (!board) { app.innerHTML = `<p style="color:#555;padding:40px;">Board nicht gefunden</p>`; return }

  const isOwner = currentUserId === profile.id

  app.innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;padding-bottom:40px;">
      <div id="board-standalone"></div>
    </div>`

  // Globaler Header mit Back-Button und Board-Titel
  renderGlobalHeader(profile, { navigate }, {
    tone: 'auto',
    title: escapeHtml(board.title),
    showBack: true,
  })

  const boards = await getBoardsByUser(profile.id)
  await loadBoardContent(
    boardId,
    document.querySelector('#board-standalone'),
    isOwner,
    currentUserId,
    boards,
    username,
    { navigate, openRepostModal }
  )
}
