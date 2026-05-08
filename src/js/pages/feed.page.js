import { supabase } from '../supabase.js'
import { shellHtml, wireShellNav, applyNavPref, refreshUnreadBadge } from '../shell.js'
import { iconSvg, escapeHtml, detectMediaType, renderMediaEl, timeAgo } from '../utils.js'
import { loadFeedPosts, getVisiblePostIds, loadPostInteractions, loadMoodTags, loadUsernameMap, insertPost } from '../services/posts.service.js'
import { toggleLike, addRepost, removeRepost, getOrCreateRepostsBoardId, loadComments, insertComment, getLikeCount, acceptFollowRequest, rejectFollowRequest } from '../services/interactions.service.js'
import { getBoardsByUser } from '../services/boards.service.js'
import { notifyAction } from '../services/notify.action.js'
import { uploadPostMedia } from '../services/media.service.js'
import { loadNotifications, getUnreadCount, markAllRead, subscribeToNotifications } from '../services/notifications.service.js'
import { loadStoriesForUser, markStoryViewed, getStoryViewers, deleteStory, uploadStoryFile, insertStory } from '../services/stories.service.js'
import { searchProfiles } from '../services/profiles.service.js'

// ─── Feed-scoped state ────────────────────────────────────────────────────────
let activeMood = null
let searchTimeout = null

// ─── Feed Page ────────────────────────────────────────────────────────────────

/**
 * Zeigt den Feed.
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, onNotifChannelReady: function }} ctx
 */
export async function showFeed(profile, ctx) {
  const { navigate, openComposer } = ctx
  applyNavPref()

  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${shellHtml('home', profile)}
      <main class="app-main">
        <header class="topbar">
          <span style="font-size:16px;font-weight:600;letter-spacing:.02em;cursor:pointer;flex-shrink:0;" id="logo">Marvin's Place</span>
          <div class="topbar-search">
            <span class="topbar-search-icon">${iconSvg('search', 16)}</span>
            <input id="search-input" class="input" type="text" placeholder="User suchen..." />
            <div id="search-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;z-index:50;box-shadow:var(--shadow-elev);"></div>
          </div>
          <div class="topbar-actions">
            <div style="position:relative;">
              <button id="notif-btn" class="icon-btn" aria-label="Benachrichtigungen">
                ${iconSvg('bell', 18)}
                <span id="notif-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--danger);color:#fff;font-size:9px;font-weight:700;border-radius:50%;min-width:16px;height:16px;padding:0 4px;align-items:center;justify-content:center;line-height:1;"></span>
              </button>
              <div id="notif-dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 8px);width:320px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;z-index:50;box-shadow:var(--shadow-elev);backdrop-filter:blur(24px);">
                <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:13px;font-weight:600;color:#fff;">Benachrichtigungen</span>
                  <button id="notif-mark-read" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text-mute);">Alle gelesen</button>
                </div>
                <div id="notif-list" style="max-height:340px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>
        </header>
        <span id="header-username" data-username="${profile.username}" class="hidden">@${profile.username}</span>

        <div id="story-bar" style="display:flex;gap:12px;padding:14px 16px;overflow-x:auto;border-bottom:1px solid var(--border);scrollbar-width:none;-webkit-overflow-scrolling:touch;"></div>

        <div class="feed-wrap">
          <div id="feed-active-filter" class="hidden" style="display:flex;align-items:center;gap:8px;padding:8px 4px 12px;color:#888;font-size:12px;"></div>
          <div id="feed-grid" class="feed-grid"></div>
          <div id="feed-state" class="feed-state hidden"></div>
        </div>
      </main>
    </div>

    <!-- Comments Modal -->
    <div id="comments-modal" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.88);align-items:center;justify-content:center;">
      <div style="background:#111;border:1px solid #222;border-radius:14px;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column;margin:12px;">
        <div style="padding:14px 20px;border-bottom:1px solid #1f1f1f;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <span style="font-size:14px;font-weight:500;color:#fff;">Kommentare</span>
          <button id="modal-close" style="background:none;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div id="modal-image-wrap" style="flex-shrink:0;max-height:280px;overflow:hidden;"></div>
        <div id="comments-list" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;"></div>
        <div style="padding:12px 20px;border-top:1px solid #1f1f1f;display:flex;gap:8px;flex-shrink:0;">
          <input id="comment-input" type="text" placeholder="Kommentar schreiben..." style="flex:1;padding:9px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;outline:none;" />
          <button id="comment-submit" style="padding:9px 16px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;">Senden</button>
        </div>
      </div>
    </div>`

  loadStoryBar(profile.id)
  wireShellNav(profile, {
    navigate,
    openComposer,
    toggleNotif: (p) => _toggleNotifPanel(p),
  })

  document.querySelector('#logo').addEventListener('click', () => navigate('/'))
  _setupSearch(profile.id, navigate)
  _setupNotifications(profile.id, ctx)

  document.querySelector('#modal-close').addEventListener('click', _closeCommentsModal)
  document.querySelector('#comments-modal').addEventListener('click', e => {
    if (e.target === document.querySelector('#comments-modal')) _closeCommentsModal()
  })
  document.addEventListener('click', e => {
    const nb = document.querySelector('#notif-btn'), nd = document.querySelector('#notif-dropdown')
    if (nb && nd && !nb.contains(e.target) && !nd.contains(e.target)) nd.style.display = 'none'
    const si = document.querySelector('#search-input'), sd = document.querySelector('#search-dropdown')
    if (si && sd && !si.contains(e.target) && !sd.contains(e.target)) sd.style.display = 'none'
  })

  await loadFeed(profile, navigate)
}

// ─── Feed loading ─────────────────────────────────────────────────────────────

/**
 * Lädt den Feed (eigene + gefollowte Posts) und rendert ihn.
 * Nutzt ausschließlich die Service-Schicht — keine direkten Queries hier.
 */
export async function loadFeed(profile, navigate) {
  const grid = document.querySelector('#feed-grid')
  const state = document.querySelector('#feed-state')
  const filterBar = document.querySelector('#feed-active-filter')
  if (!grid || !state) return

  _renderFilterBar(profile, navigate)

  state.classList.add('hidden')
  grid.innerHTML = `<div style="grid-column:1/-1;color:#444;font-size:12px;text-align:center;padding:20px;">Lädt…</div>`

  const { data: allPosts, error } = await loadFeedPosts(profile.id, activeMood)
  if (error) {
    grid.innerHTML = ''
    _showState(`Konnte Feed nicht laden: ${error.message}`)
    return
  }

  const visibleIds = await getVisiblePostIds(allPosts || [], profile.id)
  const posts = (allPosts || []).filter(p => visibleIds.has(p.id)).slice(0, 60)

  if (!posts.length) {
    grid.innerHTML = ''
    if (activeMood) {
      _showState(`Keine Posts mit #${activeMood}.`)
    } else {
      _showWelcomeState(profile, navigate)
    }
    return
  }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const [usernameMap, interactions] = await Promise.all([
    loadUsernameMap(userIds),
    loadPostInteractions(posts.map(p => p.id), profile.id),
  ])

  grid.innerHTML = posts
    .map(p => _renderFeedCard(p, profile.id, usernameMap, interactions))
    .join('')

  _wireFeedActions(profile, navigate)
}

function _showState(html) {
  const state = document.querySelector('#feed-state')
  if (!state) return
  state.classList.remove('hidden')
  state.innerHTML = html
}

function _showWelcomeState(profile, navigate) {
  _showState(`
    <div style="font-size:30px;margin-bottom:10px;">🌱</div>
    <p style="color:#ccc;font-size:14px;margin:0 0 6px;">Willkommen, @${profile.username}</p>
    <p style="color:#666;font-size:12px;margin:0 0 18px;">Folge anderen Profilen oder poste etwas, um deinen Feed zu füllen.</p>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <button id="cta-explore" class="btn btn-primary">Entdecken</button>
      <button id="cta-profile" class="btn">Mein Profil</button>
    </div>`)
  document.querySelector('#cta-profile')?.addEventListener('click', () => navigate('/u/' + profile.username))
  document.querySelector('#cta-explore')?.addEventListener('click', () => navigate('/explore'))
}

function _renderFilterBar(profile, navigate) {
  const bar = document.querySelector('#feed-active-filter')
  if (!bar) return
  if (!activeMood) { bar.classList.add('hidden'); bar.innerHTML = ''; return }
  bar.classList.remove('hidden')
  bar.innerHTML = `
    <span>Filter:</span>
    <button id="feed-clear-mood" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid #2a2a2a;background:transparent;color:#ddd;font-size:12px;cursor:pointer;">
      #${activeMood}
      <span style="opacity:.6;">×</span>
    </button>`
  document.querySelector('#feed-clear-mood').addEventListener('click', () => {
    activeMood = null
    loadFeed(profile, navigate)
  })
}

function _renderFeedCard(post, currentUserId, usernameMap, interactions) {
  const { likeCounts, userLikedSet, commentCounts, repostCounts, userRepostedSet } = interactions
  const liked = userLikedSet.has(post.id)
  const reposted = userRepostedSet.has(post.id)
  const lc = likeCounts[post.id] || 0
  const cc = commentCounts[post.id] || 0
  const rc = repostCounts[post.id] || 0
  const username = usernameMap[post.user_id] || 'unknown'
  const mt = post.media_type || detectMediaType(post.media_url)
  const isEmbed = mt === 'youtube' || mt === 'instagram'
  const vis = post.visibility || 'public'
  const isOwn = post.user_id === currentUserId
  const visBadge = isOwn && vis !== 'public'
    ? `<div style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.65);border-radius:10px;padding:2px 7px;font-size:10px;color:#ccc;">${vis === 'followers' ? '👥' : '🔒'}</div>`
    : ''
  return `
    <div class="feed-card" data-post-id="${post.id}">
      <div class="post-media-wrap" data-post-id="${post.id}" data-media-url="${escapeHtml(post.media_url)}" data-media-type="${mt}" data-owner-id="${post.user_id}" style="cursor:${isEmbed ? 'default' : 'pointer'};position:relative;">
        ${renderMediaEl(post.media_url, mt)}
        ${visBadge}
      </div>
      <div class="feed-card-foot">
        <div class="meta">
          <span class="username-link" data-username="${username}" style="font-size:12px;color:#777;cursor:pointer;display:block;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${username}</span>
          ${post.mood ? `<span class="mood-tag" data-mood="${post.mood}" style="font-size:11px;color:#555;cursor:pointer;">#${post.mood}</span>` : ''}
        </div>
        <div class="actions">
          <button class="comment-btn" data-post-id="${post.id}" data-media-url="${escapeHtml(post.media_url)}" data-media-type="${mt}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:#555;font-size:12px;padding:4px 6px;border-radius:6px;">
            <span style="font-size:14px;">💬</span><span class="comment-count" data-post-id="${post.id}">${cc}</span>
          </button>
          <button class="repost-btn" data-post-id="${post.id}" data-reposted="${reposted}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:${reposted ? '#06d6a0' : '#555'};font-size:12px;padding:4px 6px;border-radius:6px;">
            <span style="font-size:14px;">🔁</span><span class="repost-count" data-post-id="${post.id}">${rc}</span>
          </button>
          <button class="like-btn" data-post-id="${post.id}" data-liked="${liked}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:${liked ? '#ff4d6d' : '#555'};font-size:12px;padding:4px 6px;border-radius:6px;">
            <span class="like-icon" style="font-size:15px;">${liked ? '♥' : '♡'}</span><span class="like-count" data-post-id="${post.id}">${lc}</span>
          </button>
        </div>
      </div>
    </div>`
}

function _wireFeedActions(profile, navigate) {
  document.querySelectorAll('#feed-grid .like-btn').forEach(btn =>
    btn.addEventListener('click', () => _handleLike(btn, profile.id))
  )
  document.querySelectorAll('#feed-grid .repost-btn').forEach(btn =>
    btn.addEventListener('click', () => _handleRepost(btn, profile.id))
  )
  document.querySelectorAll('#feed-grid .comment-btn').forEach(btn =>
    btn.addEventListener('click', () => openCommentsModal(
      btn.dataset.postId, btn.dataset.mediaUrl, btn.dataset.mediaType, profile.id, btn.dataset.ownerId
    ))
  )
  document.querySelectorAll('#feed-grid .post-media-wrap').forEach(wrap => {
    if (wrap.dataset.mediaType === 'youtube' || wrap.dataset.mediaType === 'instagram') return
    wrap.addEventListener('click', () => openCommentsModal(
      wrap.dataset.postId, wrap.dataset.mediaUrl, wrap.dataset.mediaType, profile.id, wrap.dataset.ownerId
    ))
  })
  document.querySelectorAll('#feed-grid .username-link').forEach(el =>
    el.addEventListener('click', () => navigate('/u/' + el.dataset.username))
  )
  document.querySelectorAll('#feed-grid .mood-tag').forEach(tag =>
    tag.addEventListener('click', () => {
      activeMood = tag.dataset.mood
      loadFeed(profile, navigate)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  )
}

async function _handleLike(btn, currentUserId) {
  const postId = btn.dataset.postId
  const liked = btn.dataset.liked === 'true'
  const ownerId = btn.dataset.ownerId
  const countEl = btn.querySelector('.like-count')
  const iconEl = btn.querySelector('.like-icon')
  const current = parseInt(countEl?.textContent || '0')

  // Optimistic UI
  btn.dataset.liked = String(!liked)
  btn.style.color = !liked ? '#ff4d6d' : '#555'
  if (iconEl) iconEl.textContent = !liked ? '♥' : '♡'
  if (countEl) countEl.textContent = !liked ? current + 1 : Math.max(0, current - 1)

  const { error } = await toggleLike(postId, currentUserId, liked, ownerId)
  if (error) {
    // Rollback
    btn.dataset.liked = String(liked)
    btn.style.color = liked ? '#ff4d6d' : '#555'
    if (iconEl) iconEl.textContent = liked ? '♥' : '♡'
    if (countEl) countEl.textContent = current
  }
}

async function _handleRepost(btn, currentUserId) {
  const postId = btn.dataset.postId
  const reposted = btn.dataset.reposted === 'true'
  const ownerId = btn.dataset.ownerId
  const countEl = btn.querySelector('.repost-count')
  const current = parseInt(countEl?.textContent || '0')

  if (reposted) {
    btn.dataset.reposted = 'false'
    btn.style.color = '#555'
    if (countEl) countEl.textContent = Math.max(0, current - 1)
    const { error } = await removeRepost(postId, currentUserId)
    if (error) {
      btn.dataset.reposted = 'true'
      btn.style.color = '#06d6a0'
      if (countEl) countEl.textContent = current
    }
    return
  }

  // Open modal so the user can pick a board / decide profile visibility
  const boards = await getBoardsByUser(currentUserId)
  openRepostModal(boards, async ({ boardId, showOnProfile }) => {
    btn.dataset.reposted = 'true'
    btn.style.color = '#06d6a0'
    if (countEl) countEl.textContent = current + 1
    const { error } = await addRepost(postId, currentUserId, ownerId, { boardId, showOnProfile })
    if (error) {
      btn.dataset.reposted = 'false'
      btn.style.color = '#555'
      if (countEl) countEl.textContent = current
    }
  })
}

// ─── Story Bar ────────────────────────────────────────────────────────────────

export async function loadStoryBar(currentUserId) {
  const bar = document.querySelector('#story-bar')
  if (!bar) return

  const { grouped, viewedSet } = await loadStoriesForUser(currentUserId)

  bar.innerHTML = `
    <div id="add-story-btn" style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">
      <div style="width:56px;height:56px;border-radius:50%;background:#1a1a1a;border:2px dashed #333;display:flex;align-items:center;justify-content:center;font-size:22px;color:#555;">+</div>
      <span style="font-size:10px;color:#555;">Story</span>
    </div>
    ${Object.entries(grouped).map(([userId, userStories]) => {
      const username = userStories[0].profiles?.username || 'unknown'
      const hasUnseen = userStories.some(s => !viewedSet.has(s.id))
      const isOwn = userId === currentUserId
      return `
        <div class="story-avatar" data-user-id="${userId}" style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">
          <div style="width:56px;height:56px;border-radius:50%;padding:2px;background:${hasUnseen ? 'linear-gradient(135deg,#ff4d6d,#ffd60a,#06d6a0)' : '#333'};">
            <div style="width:100%;height:100%;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;border:2px solid #0a0a0a;">
              ${username[0].toUpperCase()}
            </div>
          </div>
          <span style="font-size:10px;color:${hasUnseen ? '#fff' : '#555'};max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${isOwn ? 'Du' : '@' + username}</span>
        </div>`
    }).join('')}`

  document.querySelector('#add-story-btn').addEventListener('click', () => openAddStoryModal(currentUserId))
  bar.querySelectorAll('.story-avatar').forEach(el => {
    el.addEventListener('click', () => {
      const userId = el.dataset.userId
      openStoryViewer(grouped[userId], currentUserId, viewedSet, () => loadStoryBar(currentUserId))
    })
  })
}

// ─── Story Upload Modal ───────────────────────────────────────────────────────

export function openAddStoryModal(currentUserId) {
  const existing = document.querySelector('#story-upload-modal')
  if (existing) existing.remove()
  const modal = document.createElement('div')
  modal.id = 'story-upload-modal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;'
  modal.innerHTML = `
    <div style="background:#111;border:1px solid #222;border-radius:16px;width:100%;max-width:380px;padding:24px;margin:16px;box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <span style="color:#fff;font-size:15px;font-weight:500;">Neue Story</span>
        <button id="story-modal-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <input id="story-file" type="file" accept="image/*,video/*,.gif" style="display:none;" />
      <div id="story-drop" style="border:2px dashed #2a2a2a;border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">📸</div>
        <p style="color:#555;font-size:13px;margin:0;">Foto oder Video für Story</p>
        <p style="color:#333;font-size:11px;margin-top:4px;">Verschwindet nach 24h · Max 50MB</p>
      </div>
      <div id="story-preview" style="display:none;border-radius:12px;overflow:hidden;margin-bottom:16px;max-height:280px;"></div>
      <div style="position:relative;margin-bottom:16px;">
        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#555;font-size:13px;">#</span>
        <input id="story-mood" type="text" placeholder="mood tag (optional)" style="width:100%;padding:10px 12px 10px 24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;box-sizing:border-box;outline:none;" />
      </div>
      <button id="story-submit" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Story posten</button>
      <p id="story-msg" style="color:#555;font-size:12px;text-align:center;margin-top:10px;min-height:16px;"></p>
    </div>`
  document.body.appendChild(modal)

  let uploadedUrl = null, uploadedType = null
  const drop = modal.querySelector('#story-drop')
  const fileInput = modal.querySelector('#story-file')
  const preview = modal.querySelector('#story-preview')
  const msg = modal.querySelector('#story-msg')

  drop.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { msg.textContent = 'Max 50MB'; return }
    const isVideo = file.type.startsWith('video/')
    const isGif = file.type === 'image/gif'
    drop.style.display = 'none'
    preview.style.display = 'block'
    preview.innerHTML = isVideo
      ? `<video src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" autoplay loop muted playsinline></video>`
      : `<img src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" />`
    msg.textContent = 'Hochladen...'
    const { url, error } = await uploadStoryFile(file, currentUserId)
    if (error) { msg.textContent = '❌ ' + error.message; return }
    uploadedUrl = url
    uploadedType = isVideo ? 'video' : isGif ? 'gif' : 'image'
    msg.textContent = '✅ Bereit'
  })

  modal.querySelector('#story-submit').addEventListener('click', async () => {
    if (!uploadedUrl) { msg.textContent = 'Erst Datei hochladen'; return }
    const mood = modal.querySelector('#story-mood').value.trim().replace(/^#+/, '').toLowerCase() || null
    msg.textContent = 'Posten...'
    const { error } = await insertStory(currentUserId, uploadedUrl, uploadedType, mood)
    if (error) { msg.textContent = '❌ ' + error.message; return }
    modal.remove()
    loadStoryBar(currentUserId)
  })

  modal.querySelector('#story-modal-close').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────

export function openStoryViewer(stories, currentUserId, viewedSet, onClose) {
  const existing = document.querySelector('#story-viewer')
  if (existing) existing.remove()

  let current = 0
  let progressTimer = null
  const DURATION = 5000

  const viewer = document.createElement('div')
  viewer.id = 'story-viewer'
  viewer.style.cssText = 'position:fixed;inset:0;z-index:400;background:#000;display:flex;flex-direction:column;touch-action:none;'

  const render = () => {
    const story = stories[current]
    const mt = story.media_type || detectMediaType(story.media_url)
    const isOwn = story.user_id === currentUserId

    viewer.innerHTML = `
      <div style="position:absolute;top:0;left:0;right:0;z-index:10;display:flex;gap:3px;padding:10px 12px 0;">
        ${stories.map((_, i) => `
          <div style="flex:1;height:2px;background:rgba(255,255,255,0.25);border-radius:2px;overflow:hidden;">
            <div id="prog-${i}" style="height:100%;background:#fff;width:${i < current ? '100%' : '0%'};"></div>
          </div>`).join('')}
      </div>
      <div style="position:absolute;top:18px;left:0;right:0;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:0 16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0;">
            ${(story.profiles?.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:13px;font-weight:500;color:#fff;">@${story.profiles?.username || 'unknown'}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.55);">${timeAgo(story.created_at)}${story.mood ? ' · #' + story.mood : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${isOwn ? `<button id="story-delete" style="background:rgba(255,50,50,0.4);border:none;color:#fff;font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;">Löschen</button>` : ''}
          <button id="story-close" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;line-height:1;padding:0 4px;">×</button>
        </div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        ${mt === 'video' || mt === 'gif'
          ? `<video src="${story.media_url}" style="width:100%;height:100%;object-fit:contain;" autoplay loop muted playsinline></video>`
          : `<img src="${story.media_url}" style="width:100%;height:100%;object-fit:contain;" />`}
      </div>
      <div id="tap-prev" style="position:absolute;left:0;top:0;width:35%;height:100%;z-index:5;cursor:pointer;"></div>
      <div id="tap-next" style="position:absolute;right:0;top:0;width:35%;height:100%;z-index:5;cursor:pointer;"></div>
      ${isOwn ? `
        <div style="position:absolute;bottom:0;left:0;right:0;z-index:10;padding:16px;background:linear-gradient(transparent,rgba(0,0,0,0.6));">
          <button id="viewer-count" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:12px;padding:8px 16px;border-radius:20px;cursor:pointer;backdrop-filter:blur(8px);">👁 Wer hat gesehen?</button>
        </div>` : ''}`

    clearTimeout(progressTimer)
    const bar = viewer.querySelector(`#prog-${current}`)
    if (bar) {
      bar.style.transition = `width ${DURATION}ms linear`
      requestAnimationFrame(() => { bar.style.width = '100%' })
    }
    progressTimer = setTimeout(goNext, DURATION)

    if (!viewedSet.has(story.id)) {
      viewedSet.add(story.id)
      markStoryViewed(story.id, currentUserId)
    }

    viewer.querySelector('#story-close').addEventListener('click', close)
    viewer.querySelector('#tap-prev').addEventListener('click', (e) => {
      e.stopPropagation(); clearTimeout(progressTimer)
      if (current > 0) { current--; render() }
    })
    viewer.querySelector('#tap-next').addEventListener('click', (e) => {
      e.stopPropagation(); clearTimeout(progressTimer); goNext()
    })

    if (isOwn) {
      viewer.querySelector('#story-delete')?.addEventListener('click', async () => {
        clearTimeout(progressTimer)
        await deleteStory(story.id)
        stories.splice(current, 1)
        if (!stories.length) { close(); return }
        if (current >= stories.length) current = stories.length - 1
        render()
      })
      viewer.querySelector('#viewer-count')?.addEventListener('click', async () => {
        const views = await getStoryViewers(story.id)
        const list = views.map(v => '@' + (v.profiles?.username || '?')).join('\n') || 'Noch keine Viewer'
        alert(`👁 ${views.length} Viewer:\n\n${list}`)
      })
    }
  }

  const goNext = () => {
    if (current < stories.length - 1) { current++; render() }
    else close()
  }

  const close = () => {
    clearTimeout(progressTimer)
    viewer.remove()
    onClose?.()
  }

  document.body.appendChild(viewer)
  render()
}

// ─── Composer Modal ───────────────────────────────────────────────────────────

export function openComposerModal(profile, navigate) {
  if (!profile) return
  let host = document.querySelector('#composer-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'composer-host'
    document.body.appendChild(host)
  }
  host.innerHTML = _composerModalHtml()
  document.body.classList.add('no-scroll')
  document.querySelector('#composer-overlay').classList.add('show')
  document.querySelector('#composer-modal').classList.add('show')
  document.querySelector('#composer-close').onclick = _closeComposerModal
  document.querySelector('#composer-cancel').onclick = _closeComposerModal
  document.querySelector('#composer-overlay').onclick = _closeComposerModal
  _wireComposer(profile, navigate)
}

function _closeComposerModal() {
  const host = document.querySelector('#composer-host')
  if (host) host.innerHTML = ''
  document.body.classList.remove('no-scroll')
}

function _composerModalHtml() {
  return `
    <div class="modal-overlay" id="composer-overlay"></div>
    <div class="modal" id="composer-modal" role="dialog" aria-label="Neuer Post">
      <div class="modal-head">
        <span class="modal-title">Neuer Post</span>
        <button class="icon-btn icon-btn-sm" id="composer-close" aria-label="Schließen">${iconSvg('x', 16)}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:6px;margin-bottom:14px;">
          <button class="post-tab" data-tab="upload" style="padding:6px 14px;border-radius:20px;border:none;background:#fff;color:#000;font-size:12px;font-weight:500;cursor:pointer;">📁 Upload</button>
          <button class="post-tab" data-tab="url" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:transparent;color:#aaa;font-size:12px;cursor:pointer;">🔗 URL</button>
          <button class="post-tab" data-tab="embed" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:transparent;color:#aaa;font-size:12px;cursor:pointer;">▶️ Embed</button>
        </div>
        <div id="tab-upload" style="margin-bottom:12px;">
          <input id="post-file" type="file" accept="image/*,video/*,.gif" style="display:none;" />
          <div id="upload-drop" style="border:2px dashed #2a2a2a;border-radius:10px;padding:28px 16px;text-align:center;cursor:pointer;">
            <div style="font-size:28px;margin-bottom:8px;">📷</div>
            <p style="color:#aaa;font-size:13px;margin:0;">Foto, GIF oder Video auswählen</p>
            <p style="color:#666;font-size:11px;margin-top:4px;">oder hierher ziehen</p>
          </div>
          <div id="upload-preview" style="display:none;margin-top:10px;border-radius:10px;overflow:hidden;position:relative;"></div>
          <div id="upload-progress" style="display:none;margin-top:10px;">
            <div style="background:#1a1a1a;border-radius:4px;height:4px;overflow:hidden;"><div id="upload-bar" style="height:100%;background:#fff;width:0%;transition:width 0.3s;"></div></div>
            <p id="upload-status" style="color:#aaa;font-size:11px;margin-top:6px;"></p>
          </div>
        </div>
        <div id="tab-url" style="display:none;margin-bottom:12px;">
          <input id="post-url" class="input" type="text" placeholder="https://... (Bild, GIF, Video)" />
        </div>
        <div id="tab-embed" style="display:none;margin-bottom:12px;">
          <input id="post-embed" class="input" type="text" placeholder="YouTube URL einfügen..." />
          <p style="color:#666;font-size:11px;margin-top:6px;">YouTube Videos &amp; Playlists</p>
        </div>
        <div style="position:relative;margin-bottom:12px;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#666;font-size:13px;">#</span>
          <input id="post-mood" class="input" type="text" placeholder="mood, vibe, aesthetic..." style="padding-left:24px;" />
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button class="vis-btn" data-vis="public" style="padding:5px 12px;border-radius:20px;border:none;background:#fff;color:#000;font-size:12px;font-weight:500;cursor:pointer;">🌍 Alle</button>
          <button class="vis-btn" data-vis="followers" style="padding:5px 12px;border-radius:20px;border:1px solid #333;background:transparent;color:#aaa;font-size:12px;cursor:pointer;">👥 Follower</button>
          <button class="vis-btn" data-vis="private" style="padding:5px 12px;border-radius:20px;border:1px solid #333;background:transparent;color:#aaa;font-size:12px;cursor:pointer;">🔒 Nur ich</button>
        </div>
      </div>
      <div class="modal-foot">
        <span id="post-msg" style="color:#aaa;font-size:13px;margin-right:auto;align-self:center;"></span>
        <button class="btn" id="composer-cancel">Abbrechen</button>
        <button class="btn btn-primary" id="btn-post">Posten</button>
      </div>
    </div>`
}

function _wireComposer(profile, navigate) {
  let postVisibility = 'public'
  document.querySelectorAll('#composer-modal .vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      postVisibility = btn.dataset.vis
      document.querySelectorAll('#composer-modal .vis-btn').forEach(b => {
        b.style.background = 'transparent'
        b.style.color = '#aaa'
        b.style.border = '1px solid #333'
      })
      btn.style.background = '#fff'
      btn.style.color = '#000'
      btn.style.border = 'none'
    })
  })

  // Post tabs
  let activeTab = 'upload', uploadedUrl = null, uploadedType = null
  const tabs = ['upload', 'url', 'embed']
  document.querySelectorAll('#composer-modal .post-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab
      tabs.forEach(t => {
        document.querySelector(`#composer-modal #tab-${t}`).style.display = t === activeTab ? 'block' : 'none'
        const tb = document.querySelector(`#composer-modal .post-tab[data-tab="${t}"]`)
        tb.style.background = t === activeTab ? '#fff' : 'transparent'
        tb.style.color = t === activeTab ? '#000' : '#aaa'
        tb.style.border = t === activeTab ? 'none' : '1px solid #333'
      })
    })
  })

  const dropZone = document.querySelector('#composer-modal #upload-drop')
  const fileInput = document.querySelector('#composer-modal #post-file')
  dropZone.addEventListener('click', () => fileInput.click())
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#777' })
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#2a2a2a' })
  dropZone.addEventListener('drop', e => {
    e.preventDefault()
    dropZone.style.borderColor = '#2a2a2a'
    if (e.dataTransfer.files[0]) _handleFileSelect(e.dataTransfer.files[0], profile.id)
  })
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) _handleFileSelect(e.target.files[0], profile.id)
  })

  document.querySelector('#composer-modal #btn-post').addEventListener('click', async () => {
    const moodRaw = document.querySelector('#composer-modal #post-mood').value.trim()
    const mood = moodRaw.replace(/^#+/, '').toLowerCase().replace(/\s+/g, '_') || null
    const msg = document.querySelector('#composer-modal #post-msg')
    let mediaUrl = null, mediaType = 'image'
    if (activeTab === 'upload') {
      if (!uploadedUrl) { msg.textContent = 'Bitte erst Datei hochladen'; return }
      mediaUrl = uploadedUrl; mediaType = uploadedType || 'image'
    } else if (activeTab === 'url') {
      mediaUrl = document.querySelector('#composer-modal #post-url').value.trim()
      if (!mediaUrl) { msg.textContent = 'URL fehlt'; return }
      mediaType = detectMediaType(mediaUrl)
    } else if (activeTab === 'embed') {
      mediaUrl = document.querySelector('#composer-modal #post-embed').value.trim()
      if (!mediaUrl) { msg.textContent = 'Embed-URL fehlt'; return }
      mediaType = detectMediaType(mediaUrl)
    }
    msg.textContent = 'Posten...'
    const { error } = await insertPost({
      user_id: profile.id, media_url: mediaUrl, media_type: mediaType, mood, visibility: postVisibility,
    })
    if (error) { msg.textContent = error.message; return }
    msg.textContent = '✓ Gepostet!'
    setTimeout(() => {
      _closeComposerModal()
      if (location.pathname.startsWith('/u/' + profile.username)) {
        navigate('/u/' + profile.username)
      } else if (location.pathname === '/' && document.querySelector('#feed-grid')) {
        loadFeed(profile, navigate)
      }
    }, 600)
  })

  async function _handleFileSelect(file, userId) {
    const msgEl = document.querySelector('#composer-modal #post-msg')
    const isVideo = file.type.startsWith('video/')
    const previewWrap = document.querySelector('#composer-modal #upload-preview')
    previewWrap.style.display = 'block'
    dropZone.style.display = 'none'
    previewWrap.innerHTML = `
      <button id="upload-clear" style="position:absolute;top:8px;right:8px;z-index:2;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1;">×</button>
      ${isVideo
        ? `<video src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" autoplay loop muted playsinline></video>`
        : `<img src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" />`}`
    previewWrap.querySelector('#upload-clear').addEventListener('click', () => {
      uploadedUrl = null; uploadedType = null
      previewWrap.style.display = 'none'; dropZone.style.display = 'block'; fileInput.value = ''
    })
    const progress = document.querySelector('#composer-modal #upload-progress')
    const bar = document.querySelector('#composer-modal #upload-bar')
    const status = document.querySelector('#composer-modal #upload-status')
    progress.style.display = 'block'; bar.style.width = '30%'; status.textContent = 'Hochladen...'
    const { url, type, error } = await uploadPostMedia(file, userId)
    if (error) {
      status.textContent = '❌ ' + error.message
      if (msgEl && error.message === 'Max 50MB') msgEl.textContent = 'Max 50MB'
      return
    }
    bar.style.width = '100%'
    uploadedUrl = url
    uploadedType = type
    status.textContent = '✅ Bereit'
    setTimeout(() => { progress.style.display = 'none' }, 1500)
  }
}

// ─── Repost Modal ─────────────────────────────────────────────────────────────

export function openRepostModal(boards, onConfirm) {
  const existing = document.querySelector('#repost-modal')
  if (existing) existing.remove()
  const modal = document.createElement('div')
  modal.id = 'repost-modal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:350;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;'
  const selectableBoards = boards.filter(b => b.title !== 'Reposts')
  const boardOptionsHtml = selectableBoards.length
    ? `<div style="max-height:32vh;overflow-y:auto;margin-bottom:10px;">
         <button type="button" class="repost-board-pick selected" data-board-id="" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#222;border:1px solid #fff;border-radius:8px;color:#fff;font-size:13px;cursor:pointer;">Nur "Reposts"-Board</button>
         ${selectableBoards.map(b => `<button type="button" class="repost-board-pick" data-board-id="${b.id}" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#ddd;font-size:13px;cursor:pointer;">+ ${escapeHtml(b.title)} ${b.visibility === 'private' ? '🔒' : b.visibility === 'followers' ? '👥' : ''}</button>`).join('')}
       </div>`
    : `<p style="color:#666;font-size:12px;margin:0 0 12px;">Wird in dein automatisches "Reposts"-Board gelegt.</p>`
  modal.innerHTML = `
    <div style="background:#111;border:1px solid #222;border-radius:14px;width:100%;max-width:380px;padding:20px;margin:16px;box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="color:#fff;font-size:14px;font-weight:500;">Reposten</span>
        <button type="button" id="repost-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <p style="color:#666;font-size:12px;margin:0 0 12px;">Landet automatisch in deinem "Reposts"-Board. Optional zusätzlich in einem anderen Board.</p>
      ${boardOptionsHtml}
      <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:12px;cursor:pointer;">
        <input id="repost-show-on-profile" type="checkbox" checked style="width:16px;height:16px;cursor:pointer;accent-color:#06d6a0;" />
        <span style="font-size:13px;color:#ddd;">Auf meinem Profil zeigen</span>
      </label>
      <div style="display:flex;gap:8px;">
        <button type="button" id="repost-cancel" style="flex:1;padding:10px;background:transparent;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:13px;cursor:pointer;">Abbrechen</button>
        <button type="button" id="repost-confirm" style="flex:2;padding:10px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Reposten</button>
      </div>
    </div>`
  document.body.appendChild(modal)
  let selectedBoardId = ''
  const close = () => modal.remove()
  modal.querySelector('#repost-close').addEventListener('click', close)
  modal.querySelector('#repost-cancel').addEventListener('click', close)
  modal.addEventListener('click', e => { if (e.target === modal) close() })
  modal.querySelectorAll('.repost-board-pick').forEach(b => {
    b.addEventListener('click', () => {
      selectedBoardId = b.dataset.boardId || ''
      modal.querySelectorAll('.repost-board-pick').forEach(x => {
        x.style.background = '#1a1a1a'; x.style.border = '1px solid #2a2a2a'; x.style.color = '#ddd'
      })
      b.style.background = '#222'; b.style.border = '1px solid #fff'; b.style.color = '#fff'
    })
  })
  modal.querySelector('#repost-confirm').addEventListener('click', () => {
    const showOnProfile = modal.querySelector('#repost-show-on-profile').checked
    close()
    onConfirm({ boardId: selectedBoardId || null, showOnProfile })
  })
}

// ─── Notifications (feed-local) ───────────────────────────────────────────────

function _setupNotifications(currentUserId, ctx) {
  const btn = document.querySelector('#notif-btn')
  const dropdown = document.querySelector('#notif-dropdown')
  if (!btn || !dropdown) return

  _refreshNotifBadge(currentUserId)

  btn.addEventListener('click', async e => {
    e.stopPropagation()
    const isOpen = dropdown.style.display === 'block'
    dropdown.style.display = isOpen ? 'none' : 'block'
    if (!isOpen) await _renderNotifications(currentUserId)
  })

  document.querySelector('#notif-mark-read')?.addEventListener('click', async () => {
    await markAllRead(currentUserId)
    _refreshNotifBadge(currentUserId)
    _renderNotifications(currentUserId)
  })

  const channel = subscribeToNotifications(currentUserId, () => {
    _refreshNotifBadge(currentUserId)
    const dd = document.querySelector('#notif-dropdown')
    if (dd?.style.display === 'block') _renderNotifications(currentUserId)
  })
  ctx.onNotifChannelReady?.(channel)
}

async function _refreshNotifBadge(currentUserId) {
  const count = await getUnreadCount(currentUserId)
  const badge = document.querySelector('#notif-badge')
  if (badge) {
    if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex' }
    else { badge.style.display = 'none' }
  }
  refreshUnreadBadge(count)
}

async function _renderNotifications(currentUserId) {
  const list = document.querySelector('#notif-list')
  if (!list) return
  list.innerHTML = `<p style="padding:16px;color:#444;font-size:13px;">Lädt...</p>`
  const notifs = await loadNotifications(currentUserId)
  if (!notifs.length) { list.innerHTML = `<p style="padding:16px;color:#444;font-size:13px;">Keine Benachrichtigungen.</p>`; return }
  list.innerHTML = notifs.map(n => {
    const actor = n.senderUsername ? `@${n.senderUsername}` : 'Jemand'
    const isFollowReq = n.type === 'follow_request'
    const icon = n.type === 'like' ? '♥' : n.type === 'comment' ? '💬' : n.type === 'repost' ? '🔁' : isFollowReq ? '👤' : '👤'
    const iconColor = n.type === 'like' ? '#ff4d6d' : n.type === 'comment' ? '#4d9fff' : n.type === 'repost' ? '#06d6a0' : '#aaa'
    const text = n.type === 'like'
      ? 'hat deinen Post geliked'
      : n.type === 'comment'
        ? 'hat kommentiert'
        : n.type === 'repost'
          ? 'hat deinen Post gerepostet'
          : isFollowReq
            ? 'möchte dir folgen'
            : 'folgt dir jetzt'
    const unread = !n.read
    // Follow-Request: Accept/Reject Buttons, solange noch nicht bearbeitet
    const actionRow = isFollowReq && n.from_user_id
      ? `<div style="display:flex;gap:6px;margin-top:8px;">
          <button class="notif-accept-req" data-notif-id="${n.id}" data-requester-id="${n.from_user_id}" style="padding:5px 14px;background:#fff;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">Annehmen</button>
          <button class="notif-reject-req" data-notif-id="${n.id}" data-requester-id="${n.from_user_id}" style="padding:5px 14px;background:transparent;color:#666;border:1px solid #333;border-radius:6px;font-size:12px;cursor:pointer;">Ablehnen</button>
        </div>`
      : ''
    return `<div data-notif-id="${n.id}" style="padding:12px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:flex-start;gap:10px;background:${unread ? '#141414' : 'transparent'};">
      <span style="font-size:14px;color:${iconColor};flex-shrink:0;margin-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <span style="font-size:13px;color:${unread ? '#ddd' : '#666'};"><strong style="color:${unread ? '#fff' : '#888'}">${actor}</strong> ${text}</span>
        <div style="font-size:11px;color:#444;margin-top:2px;">${timeAgo(n.created_at)}</div>
        ${actionRow}
      </div>
      ${unread && !isFollowReq ? `<div style="width:6px;height:6px;border-radius:50%;background:#ff4d6d;flex-shrink:0;margin-top:5px;"></div>` : ''}
    </div>`
  }).join('')

  // ── Accept / Reject Handler ──────────────────────────────────────────────────
  list.querySelectorAll('.notif-accept-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      const requesterId = btn.dataset.requesterId
      const notifId = btn.dataset.notifId
      btn.disabled = true; btn.textContent = '...'
      const { error } = await acceptFollowRequest(requesterId, currentUserId)
      if (error) { console.error('accept follow request failed', error); btn.disabled = false; btn.textContent = 'Annehmen'; return }
      // Notification als gelesen markieren und Row ersetzen
      await supabase.from('notifications').update({ read: true }).eq('id', notifId)
      const row = list.querySelector(`[data-notif-id="${notifId}"]`)
      if (row) {
        row.querySelector('.notif-accept-req')?.closest('div[style*="display:flex"]')?.remove()
        const textEl = row.querySelector('span[style*="font-size:13px"]')
        if (textEl) textEl.innerHTML = textEl.innerHTML.replace('möchte dir folgen', 'folgt dir jetzt ✓')
        row.style.background = 'transparent'
      }
      _refreshNotifBadge(currentUserId)
    })
  })

  list.querySelectorAll('.notif-reject-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      const requesterId = btn.dataset.requesterId
      const notifId = btn.dataset.notifId
      btn.disabled = true; btn.textContent = '...'
      const { error } = await rejectFollowRequest(requesterId, currentUserId)
      if (error) { console.error('reject follow request failed', error); btn.disabled = false; btn.textContent = 'Ablehnen'; return }
      await supabase.from('notifications').update({ read: true }).eq('id', notifId)
      const row = list.querySelector(`[data-notif-id="${notifId}"]`)
      if (row) row.remove()
      _refreshNotifBadge(currentUserId)
    })
  })
}

function _toggleNotifPanel(profile) {
  const dd = document.querySelector('#notif-dropdown')
  if (dd) {
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block'
    if (dd.style.display === 'block') _renderNotifications(profile.id)
    return
  }
  // Falls kein Dropdown vorhanden (andere Seite), zur Feed-Seite navigieren
}

// ─── Search ───────────────────────────────────────────────────────────────────

function _setupSearch(currentUserId, navigate) {
  const input = document.querySelector('#search-input')
  const dropdown = document.querySelector('#search-dropdown')
  if (!input || !dropdown) return
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const q = input.value.trim()
    if (!q) { dropdown.style.display = 'none'; return }
    searchTimeout = setTimeout(() => _runSearch(q, currentUserId, navigate), 250)
  })
  input.addEventListener('focus', () => {
    if (input.value.trim()) _runSearch(input.value.trim(), currentUserId, navigate)
  })
}

async function _runSearch(query, currentUserId, navigate) {
  const dropdown = document.querySelector('#search-dropdown')
  if (!dropdown) return
  dropdown.style.display = 'block'
  dropdown.innerHTML = `<p style="padding:12px 16px;color:#444;font-size:13px;">Suche...</p>`
  const users = await searchProfiles(query)
  if (!users.length) { dropdown.innerHTML = `<p style="padding:12px 16px;color:#444;font-size:13px;">Keine User gefunden.</p>`; return }
  dropdown.innerHTML = users.map(u => `
    <div class="search-result" data-username="${u.username}" style="padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='transparent'">
      <div style="width:28px;height:28px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:12px;color:#555;flex-shrink:0;">${u.username[0].toUpperCase()}</div>
      <span style="font-size:13px;color:#ccc;">@${u.username}</span>
      ${u.id === currentUserId ? `<span style="font-size:11px;color:#444;margin-left:auto;">du</span>` : ''}
    </div>`).join('')
  dropdown.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      dropdown.style.display = 'none'
      document.querySelector('#search-input').value = ''
      navigate('/u/' + el.dataset.username)
    })
  })
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

function _closeCommentsModal() {
  const modal = document.querySelector('#comments-modal')
  if (modal) modal.style.display = 'none'
  const input = document.querySelector('#comment-input')
  if (input) input.value = ''
}

export async function openCommentsModal(postId, mediaUrl, mediaType, currentUserId, postOwnerId) {
  const modal = document.querySelector('#comments-modal')
  const list = document.querySelector('#comments-list')
  const imgWrap = document.querySelector('#modal-image-wrap')
  const input = document.querySelector('#comment-input')
  let submitBtn = document.querySelector('#comment-submit')
  if (!modal || !list || !imgWrap || !input || !submitBtn) return

  const mt = mediaType || detectMediaType(mediaUrl)
  imgWrap.innerHTML = renderMediaEl(mediaUrl, mt, { maxHeight: '280px', cursor: 'default' })
  modal.style.display = 'flex'
  list.innerHTML = `<p style="color:#444;font-size:13px;">Lädt...</p>`

  const comments = await loadComments(postId)
  _renderComments(comments, list)

  const newBtn = submitBtn.cloneNode(true)
  submitBtn.parentNode.replaceChild(newBtn, submitBtn)
  newBtn.addEventListener('click', async () => {
    const text = input.value.trim(); if (!text) return
    newBtn.disabled = true; newBtn.textContent = '...'
    const { error } = await insertComment(postId, currentUserId, text)
    newBtn.disabled = false; newBtn.textContent = 'Senden'
    if (error) { console.error(error); return }
    input.value = ''
    const updated = await loadComments(postId)
    _renderComments(updated, list)
    const countEl = document.querySelector(`.comment-count[data-post-id="${postId}"]`)
    if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1
    list.scrollTop = list.scrollHeight
    if (postOwnerId) await notifyAction(postOwnerId, currentUserId, 'comment', postId)
  })
  input.onkeydown = e => { if (e.key === 'Enter') newBtn.click() }
  input.focus()
}

function _renderComments(comments, list) {
  if (!comments.length) {
    list.innerHTML = `<p style="color:#444;font-size:13px;">Noch keine Kommentare. Sei der Erste!</p>`
    return
  }
  list.innerHTML = comments.map(c => `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:11px;color:#555;">@${c.username}</span>
      <span style="font-size:13px;color:#ccc;line-height:1.4;">${escapeHtml(c.content)}</span>
    </div>`).join('')
  list.scrollTop = list.scrollHeight
}

// ─── Realtime Likes ───────────────────────────────────────────────────────────

export function setupRealtimeLikes(currentUserId, onChannelReady) {
  const channel = supabase.channel('likes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, async payload => {
      const postId = payload.new?.post_id || payload.old?.post_id; if (!postId) return
      if ((payload.new?.user_id || payload.old?.user_id) === currentUserId) return
      const count = await getLikeCount(postId)
      const el = document.querySelector(`.like-count[data-post-id="${postId}"]`)
      if (el) el.textContent = count
    }).subscribe()
  onChannelReady?.(channel)
}