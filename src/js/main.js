import '../css/main.css'
import { supabase } from './supabase.js'

// ─── Router ───────────────────────────────────────────────────────────────────

function navigate(path) {
  window.history.pushState({}, '', path)
  handleRoute()
}

function handleRoute() {
  const path = window.location.pathname
  const boardMatch = path.match(/^\/u\/([a-z0-9_]+)\/board\/([a-z0-9-]+)$/i)
  const profileMatch = path.match(/^\/u\/([a-z0-9_]+)$/i)
  if (boardMatch) showBoardPage(boardMatch[1], boardMatch[2])
  else if (profileMatch) showProfilePage(profileMatch[1])
  else init()
}

window.addEventListener('popstate', handleRoute)
handleRoute()

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { showLogin(); return }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
  if (!profile?.username) showUsernameSetup(session.user.id)
  else showFeed(profile)
}

// ─── Login ────────────────────────────────────────────────────────────────────

function showLogin() {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;">
      <div style="width:100%;max-width:360px;padding:40px 24px;">
        <h1 style="color:#fff;font-size:24px;font-weight:500;margin-bottom:8px;">Marvin's Place</h1>
        <p style="color:#666;font-size:14px;margin-bottom:32px;">Melde dich an</p>
        <input id="email" type="email" placeholder="Email" style="display:block;width:100%;padding:12px;margin-bottom:12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <input id="password" type="password" placeholder="Passwort" style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-login" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:10px;">Einloggen</button>
        <button id="btn-signup" style="width:100%;padding:12px;background:transparent;color:#fff;border:1px solid #333;border-radius:8px;font-size:14px;cursor:pointer;">Registrieren</button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>`
  document.querySelector('#btn-login').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    const msg = document.querySelector('#msg')
    if (!email || !password) { msg.textContent = 'Email und Passwort eingeben'; return }
    if (!email || !password) { msg.textContent = 'Email und Passwort eingeben'; return }
    msg.textContent = 'Lädt..
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { msg.textContent = error.message; return }
    init()
  })
  document.querySelector('#btn-signup').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    const msg = document.querySelector('#msg')
    msg.textContent = 'Lädt...'
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { msg.textContent = error.message; return }
    msg.textContent = 'Bestätigungsmail gesendet!'
  })
}

// ─── Username Setup ───────────────────────────────────────────────────────────

function showUsernameSetup(userId) {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;">
      <div style="width:100%;max-width:360px;padding:40px 24px;">
        <h2 style="color:#fff;font-size:20px;font-weight:500;margin-bottom:8px;">Wähle deinen Username</h2>
        <p style="color:#666;font-size:14px;margin-bottom:32px;">Einmalig — kann später geändert werden</p>
        <input id="username" type="text" placeholder="username" style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-save" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Weiter</button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>`
  document.querySelector('#btn-save').addEventListener('click', async () => {
    const username = document.querySelector('#username').value.trim().toLowerCase()
    const msg = document.querySelector('#msg')
    if (username.length < 3) { msg.textContent = 'Mindestens 3 Zeichen'; return }
    if (!/^[a-z0-9_]+$/.test(username)) { msg.textContent = 'Nur Buchstaben, Zahlen und _ erlaubt'; return }
    msg.textContent = 'Speichern...'
    const { error } = await supabase.from('profiles').update({ username }).eq('id', userId)
    if (error) { msg.textContent = error.code === '23505' ? 'Username bereits vergeben' : error.message; return }
    init()
  })
}

// ─── State ────────────────────────────────────────────────────────────────────

let realtimeChannel = null
let notifChannel = null
let searchTimeout = null
let activeMood = null

// ─── Media Helpers ────────────────────────────────────────────────────────────

function detectMediaType(url) {
  if (!url) return 'image'
  const clean = url.split('?')[0].toLowerCase()
  if (/\.(mp4|webm|mov|ogg)$/.test(clean)) return 'video'
  if (/\.(gif)$/.test(clean)) return 'gif'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  return 'image'
}

function getYouTubeEmbedUrl(url) {
  const listId = url.match(/list=([^&\s]+)/)?.[1]
  const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
  if (listId) return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=0`
  if (videoId) return `https://www.youtube.com/embed/${videoId}`
  return null
}

function renderMediaEl(mediaUrl, mediaType, opts = {}) {
  const { width = '100%', maxHeight = '', cursor = 'pointer', classes = '', dataset = '' } = opts
  const style = `width:${width};display:block;${maxHeight ? `max-height:${maxHeight};object-fit:cover;` : ''}${cursor ? `cursor:${cursor};` : ''}`
  if (mediaType === 'video' || mediaType === 'gif') {
    return `<video src="${mediaUrl}" ${classes ? `class="${classes}"` : ''} ${dataset} style="${style}" autoplay loop muted playsinline onerror="this.style.display='none'"></video>`
  }
  if (mediaType === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(mediaUrl)
    if (!embedUrl) return ''
    return `<div style="position:relative;width:100%;padding-bottom:56.25%;background:#000;"><iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`
  }
  if (mediaType === 'instagram') {
    return `<div style="padding:12px;background:#111;border-radius:8px;text-align:center;"><a href="${mediaUrl}" target="_blank" rel="noopener" style="color:#4d9fff;font-size:13px;text-decoration:none;">📷 Instagram öffnen →</a></div>`
  }
  return `<img src="${mediaUrl}" alt="" ${classes ? `class="${classes}"` : ''} ${dataset} style="${style}" onerror="this.style.display='none'" />`
}

// ─── Privacy Helpers ──────────────────────────────────────────────────────────
// friendships: user_id = follower, friend_id = following

async function getFollowedIds(currentUserId) {
  if (!currentUserId) return new Set()
  const { data } = await supabase.from('friendships')
    .select('friend_id').eq('user_id', currentUserId).eq('status', 'accepted')
  return new Set(data?.map(f => f.friend_id) || [])
}

async function isFollowing(currentUserId, targetUserId) {
  if (!currentUserId) return false
  const { data } = await supabase.from('friendships')
    .select('id').eq('user_id', currentUserId).eq('friend_id', targetUserId).eq('status', 'accepted').maybeSingle()
  return !!data
}

async function getVisiblePostIds(posts, currentUserId) {
  const visible = new Set()
  if (!posts?.length) return visible
  const followerOnly = []
  for (const p of posts) {
    const vis = p.visibility || 'public'
    if (vis === 'public') { visible.add(p.id); continue }
    if (p.user_id === currentUserId) { visible.add(p.id); continue }
    if (vis === 'private') continue
    if (vis === 'followers') followerOnly.push(p)
  }
  if (followerOnly.length && currentUserId) {
    const ownerIds = [...new Set(followerOnly.map(p => p.user_id))]
    const { data: followedList } = await supabase.from('friendships')
      .select('friend_id').eq('user_id', currentUserId).eq('status', 'accepted').in('friend_id', ownerIds)
    const followedSet = new Set(followedList?.map(f => f.friend_id) || [])
    for (const p of followerOnly) { if (followedSet.has(p.user_id)) visible.add(p.id) }
  }
  return visible
}

// ─── Stories ──────────────────────────────────────────────────────────────────

async function loadStoryBar(currentUserId) {
  const bar = document.querySelector('#story-bar')
  if (!bar) return

  const followedSet = await getFollowedIds(currentUserId)
  const allIds = [currentUserId, ...followedSet]

  const { data: stories } = await supabase.from('stories')
    .select('*, profiles(username)')
    .in('user_id', allIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const grouped = {}
  for (const s of stories || []) {
    if (!grouped[s.user_id]) grouped[s.user_id] = []
    grouped[s.user_id].push(s)
  }

  const storyIds = (stories || []).map(s => s.id)
  let viewedSet = new Set()
  if (storyIds.length) {
    const { data: viewed } = await supabase.from('story_views')
      .select('story_id').eq('user_id', currentUserId).in('story_id', storyIds)
    viewedSet = new Set(viewed?.map(v => v.story_id) || [])
  }

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

function openAddStoryModal(currentUserId) {
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
    const file = e.target.files[0]; if (!file) return
    if (file.size > 50 * 1024 * 1024) { msg.textContent = 'Max 50MB'; return }
    const isVideo = file.type.startsWith('video/')
    const isGif = file.type === 'image/gif'
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${currentUserId}/${Date.now()}.${ext}`

    drop.style.display = 'none'
    preview.style.display = 'block'
    preview.innerHTML = isVideo
      ? `<video src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" autoplay loop muted playsinline></video>`
      : `<img src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" />`

    msg.textContent = 'Hochladen...'
    const { error } = await supabase.storage.from('stories').upload(path, file, { upsert: true })
    if (error) { msg.textContent = '❌ ' + error.message; return }
    const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path)
    uploadedUrl = urlData.publicUrl
    uploadedType = isVideo ? 'video' : isGif ? 'gif' : 'image'
    msg.textContent = '✅ Bereit'
  })

  modal.querySelector('#story-submit').addEventListener('click', async () => {
    if (!uploadedUrl) { msg.textContent = 'Erst Datei hochladen'; return }
    const mood = modal.querySelector('#story-mood').value.trim().replace(/^#+/, '').toLowerCase() || null
    msg.textContent = 'Posten...'
    const { error } = await supabase.from('stories').insert({ user_id: currentUserId, media_url: uploadedUrl, media_type: uploadedType, mood })
    if (error) { msg.textContent = '❌ ' + error.message; return }
    modal.remove()
    loadStoryBar(currentUserId)
  })

  modal.querySelector('#story-modal-close').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

function openStoryViewer(stories, currentUserId, viewedSet, onClose) {
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
        </div>` : ''}
    `

    clearTimeout(progressTimer)
    const bar = viewer.querySelector(`#prog-${current}`)
    if (bar) {
      bar.style.transition = `width ${DURATION}ms linear`
      requestAnimationFrame(() => { bar.style.width = '100%' })
    }
    progressTimer = setTimeout(goNext, DURATION)

    if (!viewedSet.has(story.id)) {
      viewedSet.add(story.id)
      supabase.from('story_views').insert({ story_id: story.id, user_id: currentUserId }).then(() => {})
    }

    viewer.querySelector('#story-close').addEventListener('click', close)
    viewer.querySelector('#tap-prev').addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(progressTimer); if (current > 0) { current--; render() } })
    viewer.querySelector('#tap-next').addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(progressTimer); goNext() })

    if (isOwn) {
      viewer.querySelector('#story-delete')?.addEventListener('click', async () => {
        clearTimeout(progressTimer)
        await supabase.from('stories').delete().eq('id', story.id)
        stories.splice(current, 1)
        if (!stories.length) { close(); return }
        if (current >= stories.length) current = stories.length - 1
        render()
      })
      viewer.querySelector('#viewer-count')?.addEventListener('click', async () => {
        const { data: views } = await supabase.from('story_views')
          .select('*, profiles(username)').eq('story_id', story.id)
        const list = views?.map(v => '@' + (v.profiles?.username || '?')).join('\n') || 'Noch keine Viewer'
        alert(`👁 ${views?.length || 0} Viewer:\n\n${list}`)
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

// ─── Feed ─────────────────────────────────────────────────────────────────────

async function showFeed(profile) {
  document.querySelector('#app').innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;">
      <header style="padding:12px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;position:sticky;top:0;background:#0a0a0a;z-index:10;">
        <span style="font-size:16px;font-weight:500;white-space:nowrap;flex-shrink:0;cursor:pointer;" id="logo">Marvin's Place</span>
        <div style="flex:1;max-width:320px;position:relative;">
          <input id="search-input" type="text" placeholder="User suchen..." style="width:100%;padding:8px 12px 8px 32px;background:#1a1a1a;border:1px solid #222;border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;" />
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:#444;">🔍</span>
          <div id="search-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:#111;border:1px solid #222;border-radius:10px;overflow:hidden;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,0.6);"></div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-left:auto;flex-shrink:0;">
          <div style="position:relative;">
            <button id="notif-btn" style="background:none;border:none;cursor:pointer;color:#555;font-size:18px;padding:4px;line-height:1;position:relative;">🔔
              <span id="notif-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:#ff4d6d;color:#fff;font-size:9px;font-weight:700;border-radius:50%;width:14px;height:14px;align-items:center;justify-content:center;line-height:1;"></span>
            </button>
            <div id="notif-dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 8px);width:300px;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
              <div style="padding:12px 16px;border-bottom:1px solid #1f1f1f;display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:13px;font-weight:500;color:#fff;">Benachrichtigungen</span>
                <button id="notif-mark-read" style="background:none;border:none;cursor:pointer;font-size:11px;color:#555;">Alle gelesen</button>
              </div>
              <div id="notif-list" style="max-height:320px;overflow-y:auto;"></div>
            </div>
          </div>
          <span id="header-username" data-username="${profile.username}" style="font-size:14px;color:#666;cursor:pointer;">@${profile.username}</span>
          <button id="btn-logout" style="padding:6px 14px;background:transparent;color:#666;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:12px;">Ausloggen</button>
        </div>
      </header>

      <!-- Story Bar -->
      <div id="story-bar" style="display:flex;gap:12px;padding:14px 16px;overflow-x:auto;border-bottom:1px solid #111;scrollbar-width:none;-webkit-overflow-scrolling:touch;"></div>

      <!-- Post Composer -->
      <div style="max-width:600px;margin:24px auto;padding:0 16px;">
        <div style="background:#111;border:1px solid #222;border-radius:12px;padding:16px;">
          <p style="color:#666;font-size:12px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Neuer Post</p>
          <div style="display:flex;gap:6px;margin-bottom:14px;">
            <button class="post-tab" data-tab="upload" style="padding:6px 14px;border-radius:20px;border:none;background:#fff;color:#000;font-size:12px;font-weight:500;cursor:pointer;">📁 Upload</button>
            <button class="post-tab" data-tab="url" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:transparent;color:#555;font-size:12px;cursor:pointer;">🔗 URL</button>
            <button class="post-tab" data-tab="embed" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:transparent;color:#555;font-size:12px;cursor:pointer;">▶️ Embed</button>
          </div>
          <div id="tab-upload" style="margin-bottom:12px;">
            <input id="post-file" type="file" accept="image/*,video/*,.gif" style="display:none;" />
            <div id="upload-drop" style="border:2px dashed #2a2a2a;border-radius:10px;padding:28px 16px;text-align:center;cursor:pointer;">
              <div style="font-size:28px;margin-bottom:8px;">📷</div>
              <p style="color:#555;font-size:13px;margin:0;">Foto, GIF oder Video auswählen</p>
              <p style="color:#333;font-size:11px;margin-top:4px;">oder hierher ziehen</p>
            </div>
            <div id="upload-preview" style="display:none;margin-top:10px;border-radius:10px;overflow:hidden;position:relative;"></div>
            <div id="upload-progress" style="display:none;margin-top:10px;">
              <div style="background:#1a1a1a;border-radius:4px;height:4px;overflow:hidden;"><div id="upload-bar" style="height:100%;background:#fff;width:0%;transition:width 0.3s;"></div></div>
              <p id="upload-status" style="color:#555;font-size:11px;margin-top:6px;"></p>
            </div>
          </div>
          <div id="tab-url" style="display:none;margin-bottom:12px;">
            <input id="post-url" type="text" placeholder="https://... (Bild, GIF, Video)" style="display:block;width:100%;padding:10px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
          </div>
          <div id="tab-embed" style="display:none;margin-bottom:12px;">
            <input id="post-embed" type="text" placeholder="YouTube URL einfügen..." style="display:block;width:100%;padding:10px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
            <p style="color:#444;font-size:11px;margin-top:6px;">YouTube Videos & Playlists</p>
          </div>
          <div style="position:relative;margin-bottom:12px;">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#555;font-size:13px;">#</span>
            <input id="post-mood" type="text" placeholder="mood, vibe, aesthetic..." style="display:block;width:100%;padding:10px 12px 10px 24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
          </div>
          <div style="display:flex;gap:6px;margin-bottom:14px;">
            <button class="vis-btn" data-vis="public" style="padding:5px 12px;border-radius:20px;border:none;background:#fff;color:#000;font-size:12px;font-weight:500;cursor:pointer;">🌍 Alle</button>
            <button class="vis-btn" data-vis="followers" style="padding:5px 12px;border-radius:20px;border:1px solid #333;background:transparent;color:#555;font-size:12px;cursor:pointer;">👥 Follower</button>
            <button class="vis-btn" data-vis="private" style="padding:5px 12px;border-radius:20px;border:1px solid #333;background:transparent;color:#555;font-size:12px;cursor:pointer;">🔒 Nur ich</button>
          </div>
          <button id="btn-post" style="padding:10px 20px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Posten</button>
          <span id="post-msg" style="color:#666;font-size:13px;margin-left:12px;"></span>
        </div>
      </div>

      <!-- Mood Filter -->
      <div style="max-width:1200px;margin:0 auto;padding:0 16px 16px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button id="filter-all" style="padding:5px 14px;background:#fff;color:#000;border:none;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Alle</button>
          <div id="mood-chips" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
        </div>
      </div>

      <!-- Feed Grid -->
      <div id="feed-grid" style="max-width:1200px;margin:0 auto;padding:0 16px 80px;columns:3 180px;gap:10px;">
        <p style="color:#333;font-size:14px;">Lädt...</p>
      </div>
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

  // Visibility picker
  let postVisibility = 'public'
  document.querySelectorAll('.vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      postVisibility = btn.dataset.vis
      document.querySelectorAll('.vis-btn').forEach(b => { b.style.background = 'transparent'; b.style.color = '#555'; b.style.border = '1px solid #333' })
      btn.style.background = '#fff'; btn.style.color = '#000'; btn.style.border = 'none'
    })
  })

  // Post tabs
  let activeTab = 'upload', uploadedUrl = null, uploadedType = null
  const tabs = ['upload', 'url', 'embed']
  document.querySelectorAll('.post-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab
      tabs.forEach(t => {
        document.querySelector(`#tab-${t}`).style.display = t === activeTab ? 'block' : 'none'
        const tb = document.querySelector(`.post-tab[data-tab="${t}"]`)
        tb.style.background = t === activeTab ? '#fff' : 'transparent'
        tb.style.color = t === activeTab ? '#000' : '#555'
        tb.style.border = t === activeTab ? 'none' : '1px solid #333'
      })
    })
  })

  const dropZone = document.querySelector('#upload-drop')
  const fileInput = document.querySelector('#post-file')
  dropZone.addEventListener('click', () => fileInput.click())
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#555' })
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#2a2a2a' })
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.style.borderColor = '#2a2a2a'; if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0], profile.id) })
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFileSelect(e.target.files[0], profile.id) })

  async function handleFileSelect(file, userId) {
    if (file.size > 50 * 1024 * 1024) { document.querySelector('#post-msg').textContent = 'Max 50MB'; return }
    const isVideo = file.type.startsWith('video/'), isGif = file.type === 'image/gif'
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${userId}/${Date.now()}.${ext}`
    const bucket = isVideo ? 'videos' : 'images'
    const previewWrap = document.querySelector('#upload-preview')
    previewWrap.style.display = 'block'; dropZone.style.display = 'none'
    previewWrap.innerHTML = `
      <button id="upload-clear" style="position:absolute;top:8px;right:8px;z-index:2;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1;">×</button>
      ${isVideo ? `<video src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" autoplay loop muted playsinline></video>` : `<img src="${URL.createObjectURL(file)}" style="width:100%;max-height:280px;object-fit:cover;display:block;" />`}`
    previewWrap.querySelector('#upload-clear').addEventListener('click', () => {
      uploadedUrl = null; uploadedType = null; previewWrap.style.display = 'none'; dropZone.style.display = 'block'; fileInput.value = ''
    })
    const progress = document.querySelector('#upload-progress'), bar = document.querySelector('#upload-bar'), status = document.querySelector('#upload-status')
    progress.style.display = 'block'; bar.style.width = '30%'; status.textContent = 'Hochladen...'
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (error) { status.textContent = '❌ ' + error.message; return }
    bar.style.width = '100%'
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    uploadedUrl = urlData.publicUrl; uploadedType = isVideo ? 'video' : isGif ? 'gif' : 'image'
    status.textContent = '✅ Bereit'
    setTimeout(() => { progress.style.display = 'none' }, 1500)
  }

  document.querySelector('#logo').addEventListener('click', () => navigate('/'))
  document.querySelector('#header-username').addEventListener('click', () => navigate('/u/' + profile.username))
  setupSearch(profile.id)
  setupNotifications(profile.id)

  document.querySelector('#btn-logout').addEventListener('click', async () => {
    if (realtimeChannel) { await supabase.removeChannel(realtimeChannel); realtimeChannel = null }
    if (notifChannel) { await supabase.removeChannel(notifChannel); notifChannel = null }
    await supabase.auth.signOut(); showLogin()
  })

  document.querySelector('#btn-post').addEventListener('click', async () => {
    const moodRaw = document.querySelector('#post-mood').value.trim()
    const mood = moodRaw.replace(/^#+/, '').toLowerCase().replace(/\s+/g, '_') || null
    const msg = document.querySelector('#post-msg')
    let mediaUrl = null, mediaType = 'image'
    if (activeTab === 'upload') {
      if (!uploadedUrl) { msg.textContent = 'Bitte erst Datei hochladen'; return }
      mediaUrl = uploadedUrl; mediaType = uploadedType || 'image'
    } else if (activeTab === 'url') {
      mediaUrl = document.querySelector('#post-url').value.trim()
      if (!mediaUrl) { msg.textContent = 'URL fehlt'; return }
      mediaType = detectMediaType(mediaUrl)
    } else if (activeTab === 'embed') {
      mediaUrl = document.querySelector('#post-embed').value.trim()
      if (!mediaUrl) { msg.textContent = 'Embed-URL fehlt'; return }
      mediaType = detectMediaType(mediaUrl)
    }
    msg.textContent = 'Posten...'
    const { error } = await supabase.from('posts').insert({ user_id: profile.id, media_url: mediaUrl, media_type: mediaType, mood, visibility: postVisibility })
    if (error) { msg.textContent = error.message; return }
    msg.textContent = '✓ Gepostet!'
    document.querySelector('#post-url').value = ''; document.querySelector('#post-embed').value = ''; document.querySelector('#post-mood').value = ''
    uploadedUrl = null; uploadedType = null
    document.querySelector('#upload-preview').style.display = 'none'; document.querySelector('#upload-drop').style.display = 'block'; fileInput.value = ''
    postVisibility = 'public'
    document.querySelectorAll('.vis-btn').forEach(b => { b.style.background = 'transparent'; b.style.color = '#555'; b.style.border = '1px solid #333' })
    document.querySelector('.vis-btn[data-vis="public"]').style.cssText += ';background:#fff;color:#000;border:none;'
    setTimeout(() => { msg.textContent = '' }, 2000)
    activeMood = null; await loadMoodChips(profile.id); loadPosts(profile.id)
  })

  document.querySelector('#modal-close').addEventListener('click', closeCommentsModal)
  document.querySelector('#comments-modal').addEventListener('click', e => { if (e.target === document.querySelector('#comments-modal')) closeCommentsModal() })
  document.addEventListener('click', e => {
    const nb = document.querySelector('#notif-btn'), nd = document.querySelector('#notif-dropdown')
    if (nb && nd && !nb.contains(e.target) && !nd.contains(e.target)) nd.style.display = 'none'
    const si = document.querySelector('#search-input'), sd = document.querySelector('#search-dropdown')
    if (si && sd && !si.contains(e.target) && !sd.contains(e.target)) sd.style.display = 'none'
  })
  document.querySelector('#filter-all').addEventListener('click', () => { activeMood = null; updateFilterUI(); loadPosts(profile.id) })

  await loadMoodChips(profile.id)
  await loadPosts(profile.id)
  setupRealtimeLikes(profile.id)
}

function closeCommentsModal() {
  document.querySelector('#comments-modal').style.display = 'none'
  document.querySelector('#comment-input').value = ''
}

// ─── Mood Chips ───────────────────────────────────────────────────────────────

async function loadMoodChips(currentUserId) {
  const container = document.querySelector('#mood-chips')
  if (!container) return
  const { data } = await supabase.from('posts').select('mood').not('mood', 'is', null)
  if (!data?.length) { container.innerHTML = ''; return }
  const moodMap = {}
  data.forEach(p => { moodMap[p.mood] = (moodMap[p.mood] || 0) + 1 })
  const moods = Object.entries(moodMap).sort((a, b) => b[1] - a[1])
  container.innerHTML = moods.map(([mood, count]) => `
    <button class="mood-chip" data-mood="${mood}" style="padding:5px 12px;background:transparent;color:#555;border:1px solid #2a2a2a;border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap;">
      #${mood} <span style="opacity:0.5;">${count}</span>
    </button>`).join('')
  container.querySelectorAll('.mood-chip').forEach(btn => {
    btn.addEventListener('click', () => { activeMood = btn.dataset.mood; updateFilterUI(); loadPosts(currentUserId) })
  })
  updateFilterUI()
}

function updateFilterUI() {
  const allBtn = document.querySelector('#filter-all')
  if (allBtn) { allBtn.style.background = activeMood ? 'transparent' : '#fff'; allBtn.style.color = activeMood ? '#555' : '#000'; allBtn.style.border = activeMood ? '1px solid #2a2a2a' : 'none' }
  document.querySelectorAll('.mood-chip').forEach(btn => {
    const on = btn.dataset.mood === activeMood
    btn.style.background = on ? '#fff' : 'transparent'; btn.style.color = on ? '#000' : '#555'; btn.style.border = on ? '1px solid #fff' : '1px solid #2a2a2a'
  })
}

// ─── Search ───────────────────────────────────────────────────────────────────

function setupSearch(currentUserId) {
  const input = document.querySelector('#search-input')
  const dropdown = document.querySelector('#search-dropdown')
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const q = input.value.trim()
    if (!q) { dropdown.style.display = 'none'; return }
    searchTimeout = setTimeout(() => runSearch(q, currentUserId), 250)
  })
  input.addEventListener('focus', () => { if (input.value.trim()) runSearch(input.value.trim(), currentUserId) })
}

async function runSearch(query, currentUserId) {
  const dropdown = document.querySelector('#search-dropdown')
  dropdown.style.display = 'block'
  dropdown.innerHTML = `<p style="padding:12px 16px;color:#444;font-size:13px;">Suche...</p>`
  const { data: users } = await supabase.from('profiles').select('id, username').ilike('username', `%${query}%`).limit(6)
  if (!users?.length) { dropdown.innerHTML = `<p style="padding:12px 16px;color:#444;font-size:13px;">Keine User gefunden.</p>`; return }
  dropdown.innerHTML = users.map(u => `
    <div class="search-result" data-username="${u.username}" style="padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='transparent'">
      <div style="width:28px;height:28px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:12px;color:#555;flex-shrink:0;">${u.username[0].toUpperCase()}</div>
      <span style="font-size:13px;color:#ccc;">@${u.username}</span>
      ${u.id === currentUserId ? `<span style="font-size:11px;color:#444;margin-left:auto;">du</span>` : ''}
    </div>`).join('')
  dropdown.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => { dropdown.style.display = 'none'; document.querySelector('#search-input').value = ''; navigate('/u/' + el.dataset.username) })
  })
}

// ─── Notifications ────────────────────────────────────────────────────────────

function setupNotifications(currentUserId) {
  const btn = document.querySelector('#notif-btn')
  const dropdown = document.querySelector('#notif-dropdown')
  refreshNotifBadge(currentUserId)
  btn.addEventListener('click', async e => {
    e.stopPropagation()
    const isOpen = dropdown.style.display === 'block'
    dropdown.style.display = isOpen ? 'none' : 'block'
    if (!isOpen) await loadNotifications(currentUserId)
  })
  document.querySelector('#notif-mark-read').addEventListener('click', async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', currentUserId).eq('read', false)
    refreshNotifBadge(currentUserId); loadNotifications(currentUserId)
  })
  if (notifChannel) supabase.removeChannel(notifChannel)
  notifChannel = supabase.channel('notif-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUserId}` }, () => {
      refreshNotifBadge(currentUserId)
      const dd = document.querySelector('#notif-dropdown')
      if (dd?.style.display === 'block') loadNotifications(currentUserId)
    }).subscribe()
}

async function refreshNotifBadge(currentUserId) {
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', currentUserId).eq('read', false)
  const badge = document.querySelector('#notif-badge')
  if (!badge) return
  if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex' } else { badge.style.display = 'none' }
}

async function loadNotifications(currentUserId) {
  const list = document.querySelector('#notif-list')
  if (!list) return
  list.innerHTML = `<p style="padding:16px;color:#444;font-size:13px;">Lädt...</p>`
  const { data: notifs } = await supabase.from('notifications').select('*').eq('user_id', currentUserId).order('created_at', { ascending: false }).limit(30)
  if (!notifs?.length) { list.innerHTML = `<p style="padding:16px;color:#444;font-size:13px;">Keine Benachrichtigungen.</p>`; return }
  const senderIds = [...new Set(notifs.map(n => n.from_user_id).filter(Boolean))]
  let usernameMap = {}
  if (senderIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', senderIds)
    profiles?.forEach(p => { usernameMap[p.id] = p.username })
  }
  list.innerHTML = notifs.map(n => {
    const actor = usernameMap[n.from_user_id] ? `@${usernameMap[n.from_user_id]}` : 'Jemand'
    const icon = n.type === 'like' ? '♥' : n.type === 'comment' ? '💬' : n.type === 'repost' ? '🔁' : '👤'
    const iconColor = n.type === 'like' ? '#ff4d6d' : n.type === 'comment' ? '#4d9fff' : n.type === 'repost' ? '#06d6a0' : '#aaa'
    const text = n.type === 'like' ? 'hat deinen Post geliked' : n.type === 'comment' ? 'hat kommentiert' : n.type === 'repost' ? 'hat deinen Post gerepostet' : 'folgt dir jetzt'
    const unread = !n.read
    return `<div style="padding:12px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:flex-start;gap:10px;background:${unread ? '#141414' : 'transparent'};">
      <span style="font-size:14px;color:${iconColor};flex-shrink:0;margin-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <span style="font-size:13px;color:${unread ? '#ddd' : '#666'};"><strong style="color:${unread ? '#fff' : '#888'}">${actor}</strong> ${text}</span>
        <div style="font-size:11px;color:#444;margin-top:2px;">${timeAgo(n.created_at)}</div>
      </div>
      ${unread ? `<div style="width:6px;height:6px;border-radius:50%;background:#ff4d6d;flex-shrink:0;margin-top:5px;"></div>` : ''}
    </div>`
  }).join('')
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'Gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

async function createNotification(toUserId, fromUserId, type, postId = null) {
  if (toUserId === fromUserId) return
  await supabase.from('notifications').insert({ user_id: toUserId, from_user_id: fromUserId, type, post_id: postId, read: false })
}

// ─── Posts laden ──────────────────────────────────────────────────────────────

async function loadPosts(currentUserId) {
  const grid = document.querySelector('#feed-grid')
  if (!grid) return
  let query = supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(120)
  if (activeMood) query = query.eq('mood', activeMood)
  const { data: allPosts, error } = await query
  if (error) { grid.innerHTML = `<p style="color:#666;">Fehler: ${error.message}</p>`; return }
  if (!allPosts?.length) { grid.innerHTML = `<p style="color:#333;font-size:14px;">${activeMood ? `Keine Posts mit #${activeMood}.` : 'Noch keine Posts.'}</p>`; return }
  const visibleIds = await getVisiblePostIds(allPosts, currentUserId)
  const posts = allPosts.filter(p => visibleIds.has(p.id)).slice(0, 60)
  if (!posts.length) { grid.innerHTML = `<p style="color:#333;font-size:14px;">Keine sichtbaren Posts.</p>`; return }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
  const usernameMap = {}; profiles?.forEach(p => { usernameMap[p.id] = p.username })

  const postIds = posts.map(p => p.id)
  const { data: allLikes } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds)
  const { data: allComments } = await supabase.from('comments').select('post_id').in('post_id', postIds)
  const { data: allReposts } = await supabase.from('reposts').select('post_id, user_id').in('post_id', postIds)
  const likeCounts = {}, userLikedSet = new Set(), commentCounts = {}, repostCounts = {}, userRepostedSet = new Set()
  allLikes?.forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; if (l.user_id === currentUserId) userLikedSet.add(l.post_id) })
  allComments?.forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1 })
  allReposts?.forEach(r => { repostCounts[r.post_id] = (repostCounts[r.post_id] || 0) + 1; if (r.user_id === currentUserId) userRepostedSet.add(r.post_id) })

  grid.innerHTML = posts.map(post => {
    const count = likeCounts[post.id] || 0, liked = userLikedSet.has(post.id)
    const ccount = commentCounts[post.id] || 0, rcount = repostCounts[post.id] || 0, reposted = userRepostedSet.has(post.id)
    const username = usernameMap[post.user_id] || 'unknown'
    const mt = post.media_type || detectMediaType(post.media_url)
    const isEmbed = mt === 'youtube' || mt === 'instagram'
    const vis = post.visibility || 'public', isOwn = post.user_id === currentUserId
    return `
      <div data-post-id="${post.id}" style="break-inside:avoid;margin-bottom:10px;border-radius:10px;overflow:hidden;background:#111;border:1px solid #1a1a1a;">
        <div class="post-media-wrap" data-post-id="${post.id}" data-media-url="${post.media_url}" data-media-type="${mt}" style="cursor:${isEmbed ? 'default' : 'pointer'};position:relative;">
          ${renderMediaEl(post.media_url, mt)}
          ${isOwn && vis !== 'public' ? `<div style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.65);border-radius:10px;padding:2px 7px;font-size:10px;color:#ccc;">${vis === 'followers' ? '👥' : '🔒'}</div>` : ''}
        </div>
        <div style="padding:8px 10px;display:flex;align-items:center;justify-content:space-between;">
          <div style="min-width:0;">
            <span class="username-link" data-username="${username}" style="font-size:12px;color:#777;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:100px;" onmouseover="this.style.color='#aaa'" onmouseout="this.style.color='#777'">@${username}</span>
            ${post.mood ? `<span class="mood-tag" data-mood="${post.mood}" style="font-size:11px;color:#555;cursor:pointer;">#${post.mood}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
            <button class="comment-btn" data-post-id="${post.id}" data-media-url="${post.media_url}" data-media-type="${mt}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:#555;font-size:12px;padding:4px 6px;border-radius:6px;">
              <span style="font-size:14px;">💬</span><span class="comment-count" data-post-id="${post.id}">${ccount}</span>
            </button>
            <button class="repost-btn" data-post-id="${post.id}" data-reposted="${reposted}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:${reposted ? '#06d6a0' : '#555'};font-size:12px;padding:4px 6px;border-radius:6px;">
              <span style="font-size:14px;">🔁</span><span class="repost-count" data-post-id="${post.id}">${rcount}</span>
            </button>
            <button class="like-btn" data-post-id="${post.id}" data-liked="${liked}" data-owner-id="${post.user_id}" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:${liked ? '#ff4d6d' : '#555'};font-size:12px;padding:4px 6px;border-radius:6px;transition:all 0.15s;">
              <span style="font-size:15px;">${liked ? '♥' : '♡'}</span><span class="like-count" data-post-id="${post.id}">${count}</span>
            </button>
          </div>
        </div>
      </div>`
  }).join('')

  document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', () => handleLike(btn, currentUserId)))
  document.querySelectorAll('.repost-btn').forEach(btn => btn.addEventListener('click', () => handleRepost(btn, currentUserId)))
  const openComment = (postId, mediaUrl, mediaType, ownerId) => openCommentsModal(postId, mediaUrl, mediaType, currentUserId, ownerId)
  document.querySelectorAll('.comment-btn').forEach(btn => btn.addEventListener('click', () => openComment(btn.dataset.postId, btn.dataset.mediaUrl, btn.dataset.mediaType, btn.dataset.ownerId)))
  document.querySelectorAll('.post-media-wrap').forEach(wrap => {
    if (wrap.dataset.mediaType === 'youtube' || wrap.dataset.mediaType === 'instagram') return
    wrap.addEventListener('click', () => { const cb = wrap.closest('[data-post-id]')?.querySelector('.comment-btn'); openComment(wrap.dataset.postId, wrap.dataset.mediaUrl, wrap.dataset.mediaType, cb?.dataset.ownerId) })
  })
  document.querySelectorAll('.username-link').forEach(el => el.addEventListener('click', () => navigate('/u/' + el.dataset.username)))
  document.querySelectorAll('.mood-tag').forEach(tag => tag.addEventListener('click', () => { activeMood = tag.dataset.mood; updateFilterUI(); loadPosts(currentUserId); window.scrollTo({ top: 0, behavior: 'smooth' }) }))
}

// ─── Repost ───────────────────────────────────────────────────────────────────

async function handleRepost(btn, currentUserId) {
  const postId = btn.dataset.postId, reposted = btn.dataset.reposted === 'true', ownerId = btn.dataset.ownerId
  const countEl = document.querySelector(`.repost-count[data-post-id="${postId}"]`), current = parseInt(countEl?.textContent || '0')
  btn.dataset.reposted = !reposted; btn.style.color = !reposted ? '#06d6a0' : '#555'
  if (countEl) countEl.textContent = !reposted ? current + 1 : Math.max(0, current - 1)
  if (reposted) {
    const { error } = await supabase.from('reposts').delete().eq('post_id', postId).eq('user_id', currentUserId)
    if (error) { btn.dataset.reposted = reposted; btn.style.color = '#06d6a0'; if (countEl) countEl.textContent = current }
  } else {
    const { error } = await supabase.from('reposts').insert({ post_id: postId, user_id: currentUserId })
    if (error) { btn.dataset.reposted = reposted; btn.style.color = '#555'; if (countEl) countEl.textContent = current }
    else if (ownerId) await createNotification(ownerId, currentUserId, 'repost', postId)
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

async function openCommentsModal(postId, mediaUrl, mediaType, currentUserId, postOwnerId) {
  const modal = document.querySelector('#comments-modal'), list = document.querySelector('#comments-list')
  const imgWrap = document.querySelector('#modal-image-wrap'), input = document.querySelector('#comment-input')
  let submitBtn = document.querySelector('#comment-submit')
  const mt = mediaType || detectMediaType(mediaUrl)
  imgWrap.innerHTML = renderMediaEl(mediaUrl, mt, { maxHeight: '280px', cursor: 'default' })
  modal.style.display = 'flex'; list.innerHTML = `<p style="color:#444;font-size:13px;">Lädt...</p>`
  await loadComments(postId, list)
  const newBtn = submitBtn.cloneNode(true); submitBtn.parentNode.replaceChild(newBtn, submitBtn)
  newBtn.addEventListener('click', async () => {
    const text = input.value.trim(); if (!text) return
    newBtn.disabled = true; newBtn.textContent = '...'
    const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: currentUserId, content: text })
    newBtn.disabled = false; newBtn.textContent = 'Senden'
    if (error) { console.error(error); return }
    input.value = ''; await loadComments(postId, list)
    const countEl = document.querySelector(`.comment-count[data-post-id="${postId}"]`)
    if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1
    list.scrollTop = list.scrollHeight
    if (postOwnerId) await createNotification(postOwnerId, currentUserId, 'comment', postId)
  })
  input.onkeydown = e => { if (e.key === 'Enter') newBtn.click() }
  input.focus()
}

async function loadComments(postId, list) {
  const { data: comments } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })
  if (!comments?.length) { list.innerHTML = `<p style="color:#444;font-size:13px;">Noch keine Kommentare. Sei der Erste!</p>`; return }
  const userIds = [...new Set(comments.map(c => c.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
  const usernameMap = {}; profiles?.forEach(p => { usernameMap[p.id] = p.username })
  list.innerHTML = comments.map(c => `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:11px;color:#555;">@${usernameMap[c.user_id] || 'unknown'}</span>
      <span style="font-size:13px;color:#ccc;line-height:1.4;">${escapeHtml(c.content)}</span>
    </div>`).join('')
  list.scrollTop = list.scrollHeight
}

// ─── Like ─────────────────────────────────────────────────────────────────────

async function handleLike(btn, currentUserId) {
  const postId = btn.dataset.postId, liked = btn.dataset.liked === 'true', ownerId = btn.dataset.ownerId
  const newLiked = !liked, countEl = document.querySelector(`.like-count[data-post-id="${postId}"]`)
  const currentCount = parseInt(countEl?.textContent || '0')
  btn.dataset.liked = newLiked; btn.style.color = newLiked ? '#ff4d6d' : '#555'
  btn.querySelector('span').textContent = newLiked ? '♥' : '♡'
  if (countEl) countEl.textContent = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1)
  if (liked) {
    const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUserId)
    if (error) { btn.dataset.liked = liked; btn.style.color = '#ff4d6d'; btn.querySelector('span').textContent = '♥'; if (countEl) countEl.textContent = currentCount }
  } else {
    const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId })
    if (error) { btn.dataset.liked = liked; btn.style.color = '#555'; btn.querySelector('span').textContent = '♡'; if (countEl) countEl.textContent = currentCount }
    else if (ownerId) await createNotification(ownerId, currentUserId, 'like', postId)
  }
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

function setupRealtimeLikes(currentUserId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
  realtimeChannel = supabase.channel('likes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, payload => {
      const postId = payload.new?.post_id || payload.old?.post_id; if (!postId) return
      if ((payload.new?.user_id || payload.old?.user_id) === currentUserId) return
      supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId).then(({ count }) => {
        const el = document.querySelector(`.like-count[data-post-id="${postId}"]`)
        if (el && count !== null) el.textContent = count
      })
    }).subscribe()
}

// ─── Profil Seite ─────────────────────────────────────────────────────────────

async function showProfilePage(username) {
  const app = document.querySelector('#app')
  app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#444;font-size:14px;">Lädt...</div>`

  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id || null
  const { data: profile } = await supabase.from('profiles').select('*').eq('username', username.toLowerCase()).single()
  if (!profile) {
    app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;">
      <p style="color:#555;font-size:14px;">Profil nicht gefunden</p>
      <button onclick="history.back()" style="padding:8px 20px;background:transparent;color:#666;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:13px;">Zurück</button>
    </div>`; return
  }

  const isOwner = currentUserId === profile.id
  const profilePrivacy = profile.profile_privacy || 'public'
  let following = false, followId = null

  if (currentUserId && !isOwner) {
    const { data: fw } = await supabase.from('friendships').select('id').eq('user_id', currentUserId).eq('friend_id', profile.id).eq('status', 'accepted').maybeSingle()
    following = !!fw; followId = fw?.id || null
  }

  const canSeeBoard = isOwner || profilePrivacy === 'public' || (profilePrivacy === 'followers' && following)

  const { data: allPosts } = await supabase.from('posts').select('id, media_url, mood, media_type, visibility, user_id').eq('user_id', profile.id).order('created_at', { ascending: false })
  const { count: followerCount } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('friend_id', profile.id).eq('status', 'accepted')
  const { count: followingCount } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'accepted')

  // Boards laden
  const { data: boards } = await supabase.from('boards').select('*').eq('user_id', profile.id).order('position', { ascending: true })

  let boardPosts = []
  if (canSeeBoard && allPosts) {
    const visibleIds = await getVisiblePostIds(allPosts, currentUserId)
    boardPosts = allPosts.filter(p => visibleIds.has(p.id))
  }

  const shuffled = profile.pinned_board_mood
    ? boardPosts.filter(p => p.mood === profile.pinned_board_mood)
    : shuffleArray(boardPosts)

  const headerStyle = buildHeaderStyle(profile)

  app.innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;">

      <!-- Header -->
      <div style="position:relative;width:100%;height:260px;overflow:hidden;${headerStyle}">
        ${profile.header_type === 'image' && profile.header_image_url ? `<img src="${profile.header_image_url}" alt="" style="position:absolute;width:100%;height:100%;object-fit:cover;transform:translate(${(profile.header_image_position?.x||50)-50}%, ${(profile.header_image_position?.y||50)-50}%) scale(${profile.header_image_position?.zoom||1});transform-origin:center;" />` : ''}
        ${profile.header_type === 'pattern' ? `<div style="position:absolute;inset:0;${buildPatternStyle(profile.header_pattern)}opacity:0.25;"></div>` : ''}
        <div style="position:absolute;top:20px;left:20px;z-index:2;max-width:60%;">
          <div style="font-size:22px;font-weight:700;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.8);">${escapeHtml(profile.display_name || profile.username)}</div>
          ${profile.bio ? `<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:6px;line-height:1.4;text-shadow:0 1px 4px rgba(0,0,0,0.7);">${escapeHtml(profile.bio)}</div>` : ''}
          ${profilePrivacy !== 'public' ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.5);">${profilePrivacy === 'private' ? '🔒 Privates Profil' : '👥 Nur Follower'}</div>` : ''}
        </div>
        <div style="position:absolute;top:16px;right:16px;z-index:2;display:flex;gap:8px;">
          <button id="btn-back" style="padding:6px 14px;background:rgba(0,0,0,0.5);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">← Feed</button>
          ${isOwner
            ? `<button id="btn-edit" style="padding:6px 14px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">✏️ Edit</button>`
            : currentUserId ? `<button id="btn-follow" style="padding:6px 14px;background:${following ? 'transparent' : 'rgba(255,255,255,0.9)'};color:${following ? '#fff' : '#000'};border:1px solid rgba(255,255,255,0.4);border-radius:8px;cursor:pointer;font-size:12px;">${following ? 'Entfolgen' : 'Folgen'}</button>` : ''
          }
        </div>
        <button id="btn-info" style="position:absolute;bottom:16px;left:16px;z-index:2;padding:6px 14px;background:rgba(0,0,0,0.5);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:20px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">
          @${profile.username} · ${boardPosts.length} Posts · ${followerCount || 0} Follower
        </button>
        ${profile.playlist_url ? `<button id="btn-music" style="position:absolute;bottom:16px;right:16px;z-index:2;width:42px;height:42px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;font-size:20px;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;">🎵</button>` : ''}
      </div>

      <!-- Info Panel -->
      <div id="info-panel" style="display:none;background:#111;border-bottom:1px solid #222;padding:16px 20px;">
        <div style="display:flex;gap:24px;font-size:13px;color:#666;">
          <span><strong style="color:#fff;">${boardPosts.length}</strong> Posts</span>
          <span><strong style="color:#fff;">${followerCount || 0}</strong> Follower</span>
          <span><strong style="color:#fff;">${followingCount || 0}</strong> Following</span>
        </div>
        ${profile.profile_link ? `<a href="${escapeHtml(profile.profile_link)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;color:#4d9fff;text-decoration:none;">🔗 ${escapeHtml(profile.profile_link)}</a>` : ''}
      </div>

      <!-- Musik Panel -->
      <div id="music-panel" style="display:none;"></div>

      ${!canSeeBoard ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:16px;">
          <div style="font-size:48px;">🔒</div>
          <p style="color:#555;font-size:14px;text-align:center;max-width:280px;">${profilePrivacy === 'private' ? 'Dieses Profil ist privat.' : 'Nur Follower können dieses Board sehen.'}</p>
        </div>
      ` : `
        <!-- Boards Tabs -->
        <div style="border-bottom:1px solid #1a1a1a;">
          <div style="display:flex;overflow-x:auto;scrollbar-width:none;padding:0 12px;">
            <button class="board-tab active-board-tab" data-board="all" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid #fff;color:#fff;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Alle Posts</button>
            ${(boards || []).map(b => {
              const visIcon = b.visibility === 'private' ? ' 🔒' : b.visibility === 'followers' ? ' 👥' : ''
              return `<button class="board-tab" data-board="${b.id}" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;color:#555;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">${escapeHtml(b.title)}${visIcon}</button>`
            }).join('')}
            ${isOwner ? `<button id="btn-new-board" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;color:#444;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">+ Board</button>` : ''}
          </div>
        </div>

        <!-- Board Content -->
        <div id="board-content">
          <!-- Default: alle Posts -->
          <div style="columns:3 100px;gap:3px;padding:3px;">
            ${shuffled.map(post => renderBoardPost(post, isOwner)).join('')}
            ${!shuffled.length ? `<p style="color:#333;font-size:14px;padding:40px;">Noch keine Posts.</p>` : ''}
          </div>
        </div>
      `}
    </div>

    <!-- Edit Modal -->
    <div id="edit-modal" style="display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.92);overflow-y:auto;">
      <div style="max-width:500px;margin:0 auto;padding:24px 16px 80px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <h2 style="color:#fff;font-size:18px;font-weight:500;margin:0;">Profil editieren</h2>
          <button id="edit-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;">×</button>
        </div>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Anzeigename</label>
        <input id="edit-displayname" type="text" value="${escapeHtml(profile.display_name || '')}" placeholder="${profile.username}" style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Bio</label>
        <textarea id="edit-bio" rows="3" placeholder="Kurze Bio..." style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;resize:vertical;">${escapeHtml(profile.bio || '')}</textarea>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Link</label>
        <input id="edit-link" type="url" value="${escapeHtml(profile.profile_link || '')}" placeholder="https://..." style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL</label>
        <input id="edit-playlist" type="url" value="${escapeHtml(profile.playlist_url || '')}" placeholder="Spotify / YouTube / Apple Music..." style="display:block;width:100%;padding:10px 12px;margin-bottom:24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Profil-Sichtbarkeit</label>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          ${['public','followers','private'].map(v => `
            <button class="privacy-btn" data-privacy="${v}" style="flex:1;padding:12px 8px;border-radius:10px;border:2px solid ${profilePrivacy===v?'#fff':'#2a2a2a'};background:${profilePrivacy===v?'#fff':'#1a1a1a'};color:${profilePrivacy===v?'#000':'#555'};cursor:pointer;font-size:13px;text-align:center;line-height:1.4;">
              ${v==='public'?'🌍':v==='followers'?'👥':'🔒'}<br><span style="font-size:11px;">${v==='public'?'Öffentlich':v==='followers'?'Follower':'Privat'}</span>
            </button>`).join('')}
        </div>
        <p style="color:#444;font-size:11px;margin-bottom:24px;">Öffentlich = alle sehen dein Board · Follower = nur wer dir folgt · Privat = nur du</p>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Header</label>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="htype-btn" data-type="color" style="flex:1;padding:8px;background:${(profile.header_type||'color')==='color'?'#fff':'#1a1a1a'};color:${(profile.header_type||'color')==='color'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Farbe</button>
          <button class="htype-btn" data-type="pattern" style="flex:1;padding:8px;background:${profile.header_type==='pattern'?'#fff':'#1a1a1a'};color:${profile.header_type==='pattern'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Muster</button>
          <button class="htype-btn" data-type="image" style="flex:1;padding:8px;background:${profile.header_type==='image'?'#fff':'#1a1a1a'};color:${profile.header_type==='image'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Foto</button>
        </div>
        <div id="sec-color" style="display:${(profile.header_type||'color')==='color'?'block':'none'};margin-bottom:20px;">
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Pastell</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ffd6e0','#ffecb3','#d4edda','#cce5ff','#e2d9f3','#ffecd2','#c8e6c9','#b3e5fc','#f8bbd0','#dcedc8'].map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color===c?'#fff':'transparent'};"></div>`).join('')}
          </div>
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Kräftig</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ff4d6d','#ff6b35','#ffd60a','#06d6a0','#118ab2','#7209b7','#3a0ca3','#f72585','#0a0a0a','#ffffff'].map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color===c?'#fff':'transparent'};"></div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="color-wheel" value="${profile.header_color||'#0a0a0a'}" style="width:40px;height:40px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;" />
            <input type="text" id="hex-input" value="${profile.header_color||'#0a0a0a'}" placeholder="#000000" style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;outline:none;" />
            <div id="hex-preview" style="width:40px;height:40px;border-radius:8px;background:${profile.header_color||'#0a0a0a'};border:1px solid #333;"></div>
          </div>
        </div>
        <div id="sec-pattern" style="display:${profile.header_type==='pattern'?'block':'none'};margin-bottom:20px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
            ${[{id:'dots',l:'Punkte'},{id:'stripes',l:'Streifen'},{id:'grid',l:'Gitter'},{id:'diagonal',l:'Diagonal'},{id:'waves',l:'Wellen'},{id:'noise',l:'Noise'}].map(p => `
              <div class="pattern-tile" data-pattern="${p.id}" style="height:60px;border-radius:8px;cursor:pointer;border:2px solid ${profile.header_pattern===p.id?'#fff':'#2a2a2a'};overflow:hidden;position:relative;background:${profile.header_color||'#111'};">
                <div style="position:absolute;inset:0;${buildPatternStyle(p.id)}opacity:0.4;"></div>
                <span style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:10px;color:#ccc;">${p.l}</span>
              </div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#555;font-size:11px;">Bg:</span>
            <input type="color" id="pattern-wheel" value="${profile.header_color||'#0a0a0a'}" style="width:36px;height:36px;border:none;background:none;cursor:pointer;padding:0;" />
            <input type="text" id="pattern-hex" value="${profile.header_color||'#0a0a0a'}" style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:12px;outline:none;" />
          </div>
        </div>
        <div id="sec-image" style="display:${profile.header_type==='image'?'block':'none'};margin-bottom:20px;">
          <div id="img-preview-wrap" style="position:relative;width:100%;height:140px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:10px;cursor:grab;">
            ${profile.header_image_url ? `<img id="img-preview" src="${profile.header_image_url}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform:translate(${(profile.header_image_position?.x||50)-50}%, ${(profile.header_image_position?.y||50)-50}%) scale(${profile.header_image_position?.zoom||1});transform-origin:center;" />` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#444;font-size:13px;">Noch kein Foto</div>`}
          </div>
          <input id="header-file" type="file" accept="image/*" style="display:none;" />
          <button id="btn-upload" style="width:100%;padding:10px;background:#1a1a1a;color:#888;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:10px;">📷 Foto auswählen</button>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#555;font-size:11px;white-space:nowrap;">Zoom:</span>
            <input type="range" id="zoom-slider" min="1" max="3" step="0.05" value="${profile.header_image_position?.zoom||1}" style="flex:1;accent-color:#fff;" />
            <span id="zoom-val" style="color:#555;font-size:11px;white-space:nowrap;">${Math.round((profile.header_image_position?.zoom||1)*100)}%</span>
          </div>
        </div>
        <button id="btn-save-profile" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Speichern</button>
        <p id="save-msg" style="color:#666;font-size:13px;text-align:center;margin-top:10px;"></p>
      </div>
    </div>

    <!-- Board Modal -->
    <div id="board-modal" style="display:none;position:fixed;inset:0;z-index:250;background:rgba(0,0,0,0.92);display:none;align-items:center;justify-content:center;">
      <div style="background:#111;border:1px solid #222;border-radius:16px;width:100%;max-width:420px;padding:24px;margin:16px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span id="board-modal-title" style="color:#fff;font-size:15px;font-weight:500;">Neues Board</span>
          <button id="board-modal-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <input type="hidden" id="board-edit-id" value="" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Name *</label>
        <input id="board-title" type="text" placeholder="z.B. Chill Vibes, Dark Aesthetic..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Beschreibung</label>
        <input id="board-desc" type="text" placeholder="Kurze Beschreibung..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Mood Filter (optional)</label>
        <input id="board-mood" type="text" placeholder="z.B. chill, dark, neon..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL (optional)</label>
        <input id="board-playlist" type="url" placeholder="Spotify / YouTube..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Sichtbarkeit</label>
        <div style="display:flex;gap:6px;margin-bottom:20px;">
          <button class="board-vis-btn" data-vis="public" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #fff;background:#fff;color:#000;font-size:11px;cursor:pointer;text-align:center;">🌍<br>Öffentlich</button>
          <button class="board-vis-btn" data-vis="followers" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #2a2a2a;background:#1a1a1a;color:#555;font-size:11px;cursor:pointer;text-align:center;">👥<br>Follower</button>
          <button class="board-vis-btn" data-vis="private" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #2a2a2a;background:#1a1a1a;color:#555;font-size:11px;cursor:pointer;text-align:center;">🔒<br>Privat</button>
        </div>
        <button id="board-save" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Board erstellen</button>
        <p id="board-msg" style="color:#555;font-size:12px;text-align:center;margin-top:10px;min-height:16px;"></p>
      </div>
    </div>`

  // ── Basic Listeners ────────────────────────────────────────────────────────
  document.querySelector('#btn-back').addEventListener('click', () => navigate('/'))
  document.querySelector('#btn-info').addEventListener('click', () => {
    const p = document.querySelector('#info-panel')
    p.style.display = p.style.display === 'none' ? 'block' : 'none'
  })
  document.querySelector('#btn-music')?.addEventListener('click', () => {
    const p = document.querySelector('#music-panel')
    if (p.style.display === 'none') { p.style.display = 'block'; p.innerHTML = buildMusicEmbed(profile.playlist_url) }
    else { p.style.display = 'none'; p.innerHTML = '' }
  })

  // ── Follow ─────────────────────────────────────────────────────────────────
  document.querySelector('#btn-follow')?.addEventListener('click', async () => {
    const btn = document.querySelector('#btn-follow')
    if (following) {
      await supabase.from('friendships').delete().eq('id', followId)
      btn.textContent = 'Folgen'; btn.style.background = 'rgba(255,255,255,0.9)'; btn.style.color = '#000'
      following = false
    } else {
      const { data } = await supabase.from('friendships').insert({ user_id: currentUserId, friend_id: profile.id, status: 'accepted' }).select().single()
      followId = data?.id; following = true
      btn.textContent = 'Entfolgen'; btn.style.background = 'transparent'; btn.style.color = '#fff'
    }
  })

  // ── Board Tabs ─────────────────────────────────────────────────────────────
  if (canSeeBoard) {
    document.querySelectorAll('.board-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.board-tab').forEach(t => { t.style.borderBottom = '2px solid transparent'; t.style.color = '#555' })
        tab.style.borderBottom = '2px solid #fff'; tab.style.color = '#fff'
        const boardId = tab.dataset.board
        const content = document.querySelector('#board-content')
        if (boardId === 'all') {
          content.innerHTML = `<div style="columns:3 100px;gap:3px;padding:3px;">${shuffled.map(post => renderBoardPost(post, isOwner)).join('') || '<p style="color:#333;font-size:14px;padding:40px;">Noch keine Posts.</p>'}</div>`
        } else {
          content.innerHTML = `<p style="padding:24px;color:#444;font-size:13px;">Lädt...</p>`
          await loadBoardContent(boardId, content, isOwner, currentUserId, boards, profile.username)
        }
      })
    })

    // ── New Board Button ───────────────────────────────────────────────────
    document.querySelector('#btn-new-board')?.addEventListener('click', () => openBoardModal(null, currentUserId, profile.username))
  }

  if (!isOwner) return

  // ── Edit Modal Setup ───────────────────────────────────────────────────────
  let currentType = profile.header_type || 'color'
  let currentColor = profile.header_color || '#0a0a0a'
  let currentPattern = profile.header_pattern || 'dots'
  let currentImageUrl = profile.header_image_url || null
  let currentImagePos = profile.header_image_position ? { ...profile.header_image_position } : { x: 50, y: 50, zoom: 1 }
  let currentPrivacy = profilePrivacy

  document.querySelector('#btn-edit').addEventListener('click', () => { document.querySelector('#edit-modal').style.display = 'block' })
  document.querySelector('#edit-close').addEventListener('click', () => { document.querySelector('#edit-modal').style.display = 'none' })

  document.querySelectorAll('.privacy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPrivacy = btn.dataset.privacy
      document.querySelectorAll('.privacy-btn').forEach(b => { b.style.border = '2px solid #2a2a2a'; b.style.background = '#1a1a1a'; b.style.color = '#555' })
      btn.style.border = '2px solid #fff'; btn.style.background = '#fff'; btn.style.color = '#000'
    })
  })

  document.querySelectorAll('.htype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type
      document.querySelectorAll('.htype-btn').forEach(b => { b.style.background = '#1a1a1a'; b.style.color = '#666' })
      btn.style.background = '#fff'; btn.style.color = '#000'
      document.querySelector('#sec-color').style.display = currentType === 'color' ? 'block' : 'none'
      document.querySelector('#sec-pattern').style.display = currentType === 'pattern' ? 'block' : 'none'
      document.querySelector('#sec-image').style.display = currentType === 'image' ? 'block' : 'none'
    })
  })

  document.querySelectorAll('.color-tile').forEach(k => {
    k.addEventListener('click', () => {
      currentColor = k.dataset.color
      document.querySelector('#hex-input').value = currentColor
      document.querySelector('#color-wheel').value = currentColor
      document.querySelector('#hex-preview').style.background = currentColor
      document.querySelectorAll('.color-tile').forEach(x => x.style.borderColor = 'transparent')
      k.style.borderColor = '#fff'
    })
  })

  const hexInput = document.querySelector('#hex-input'), colorWheel = document.querySelector('#color-wheel')
  hexInput.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) { currentColor = hexInput.value; colorWheel.value = currentColor; document.querySelector('#hex-preview').style.background = currentColor } })
  colorWheel.addEventListener('input', () => { currentColor = colorWheel.value; hexInput.value = currentColor; document.querySelector('#hex-preview').style.background = currentColor })

  document.querySelectorAll('.pattern-tile').forEach(k => {
    k.addEventListener('click', () => { currentPattern = k.dataset.pattern; document.querySelectorAll('.pattern-tile').forEach(x => x.style.borderColor = '#2a2a2a'); k.style.borderColor = '#fff' })
  })

  const patternWheel = document.querySelector('#pattern-wheel'), patternHex = document.querySelector('#pattern-hex')
  patternWheel.addEventListener('input', () => { currentColor = patternWheel.value; patternHex.value = currentColor })
  patternHex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(patternHex.value)) { currentColor = patternHex.value; patternWheel.value = currentColor } })

  document.querySelector('#btn-upload').addEventListener('click', () => document.querySelector('#header-file').click())
  document.querySelector('#header-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const btn = document.querySelector('#btn-upload'); btn.textContent = 'Hochladen...'
    const ext = file.name.split('.').pop()
    const { error } = await supabase.storage.from('headers').upload(`${currentUserId}/header.${ext}`, file, { upsert: true })
    if (error) { btn.textContent = '❌ Fehler'; return }
    const { data: urlData } = supabase.storage.from('headers').getPublicUrl(`${currentUserId}/header.${ext}`)
    currentImageUrl = urlData.publicUrl
    document.querySelector('#img-preview-wrap').innerHTML = `<img id="img-preview" src="${currentImageUrl}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform-origin:center;" />`
    btn.textContent = '✅ Hochgeladen'
    setupImgDrag(currentImagePos)
  })

  document.querySelector('#zoom-slider').addEventListener('input', e => {
    currentImagePos.zoom = parseFloat(e.target.value)
    document.querySelector('#zoom-val').textContent = Math.round(currentImagePos.zoom * 100) + '%'
    const img = document.querySelector('#img-preview')
    if (img) img.style.transform = `translate(${currentImagePos.x - 50}%, ${currentImagePos.y - 50}%) scale(${currentImagePos.zoom})`
  })

  setupImgDrag(currentImagePos)

  document.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const msg = document.querySelector('#save-msg'); msg.textContent = 'Speichern...'
    const { error } = await supabase.from('profiles').update({
      display_name: document.querySelector('#edit-displayname').value.trim() || null,
      bio: document.querySelector('#edit-bio').value.trim() || null,
      profile_link: document.querySelector('#edit-link').value.trim() || null,
      playlist_url: document.querySelector('#edit-playlist').value.trim() || null,
      profile_privacy: currentPrivacy, header_type: currentType, header_color: currentColor,
      header_pattern: currentType === 'pattern' ? currentPattern : null,
      header_image_url: currentType === 'image' ? currentImageUrl : null,
      header_image_position: currentType === 'image' ? currentImagePos : null,
    }).eq('id', currentUserId)
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => showProfilePage(profile.username), 800)
  })
}

// ─── Board Content laden ──────────────────────────────────────────────────────

async function loadBoardContent(boardId, container, isOwner, currentUserId, boards, username) {
  const board = boards.find(b => b.id === boardId)
  if (!board) return

  // Board Posts aus board_posts Tabelle
  const { data: bpRows } = await supabase.from('board_posts')
    .select('post_id, posts(id, media_url, media_type, visibility, user_id, mood)')
    .eq('board_id', boardId).order('position', { ascending: true })

  const posts = bpRows?.map(r => r.posts).filter(Boolean) || []
  const visibleIds = await getVisiblePostIds(posts, currentUserId)
  const visible = posts.filter(p => visibleIds.has(p.id))

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
    <div style="columns:3 100px;gap:3px;padding:3px;margin-top:12px;">
      ${visible.map(post => renderBoardPost(post, isOwner)).join('')}
      ${!visible.length ? `<p style="color:#333;font-size:14px;padding:40px;">Dieses Board ist leer.</p>` : ''}
    </div>
    ${isOwner ? `
      <div style="padding:16px;">
        <p style="color:#444;font-size:12px;margin-bottom:10px;">Post zu diesem Board hinzufügen:</p>
        <input id="board-add-post-id" type="text" placeholder="Post-ID einfügen..." style="width:100%;padding:9px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;box-sizing:border-box;outline:none;margin-bottom:8px;" />
        <button id="board-add-post-btn" data-board-id="${board.id}" style="padding:8px 16px;background:#fff;color:#000;border:none;border-radius:8px;font-size:12px;cursor:pointer;">Hinzufügen</button>
        <span id="board-add-msg" style="font-size:12px;color:#555;margin-left:8px;"></span>
      </div>` : ''}
  `

  container.querySelector('.board-playlist-btn')?.addEventListener('click', e => {
    const panel = container.querySelector('.board-music-panel')
    if (panel.style.display === 'none') { panel.style.display = 'block'; panel.innerHTML = buildMusicEmbed(e.target.dataset.url) }
    else { panel.style.display = 'none'; panel.innerHTML = '' }
  })

  container.querySelector('.board-edit-btn')?.addEventListener('click', () => openBoardModal(board, currentUserId, username))
  container.querySelector('.board-delete-btn')?.addEventListener('click', async () => {
    if (!confirm(`Board "${board.title}" löschen?`)) return
    await supabase.from('boards').delete().eq('id', board.id)
    showProfilePage(username)
  })

  container.querySelector('#board-add-post-btn')?.addEventListener('click', async () => {
    const postId = container.querySelector('#board-add-post-id').value.trim()
    const msg = container.querySelector('#board-add-msg')
    if (!postId) { msg.textContent = 'ID fehlt'; return }
    msg.textContent = 'Hinzufügen...'
    const { error } = await supabase.from('board_posts').insert({ board_id: board.id, post_id: postId, user_id: currentUserId })
    if (error) { msg.textContent = error.code === '23505' ? 'Bereits im Board' : '❌ ' + error.message; return }
    msg.textContent = '✅ Hinzugefügt!'
    container.querySelector('#board-add-post-id').value = ''
    await loadBoardContent(board.id, container, isOwner, currentUserId, boards, username)
  })
}

// ─── Board Modal ──────────────────────────────────────────────────────────────

function openBoardModal(board, currentUserId, username) {
  const modal = document.querySelector('#board-modal')
  modal.style.display = 'flex'
  document.querySelector('#board-modal-title').textContent = board ? 'Board bearbeiten' : 'Neues Board'
  document.querySelector('#board-save').textContent = board ? 'Speichern' : 'Board erstellen'
  document.querySelector('#board-edit-id').value = board?.id || ''
  document.querySelector('#board-title').value = board?.title || ''
  document.querySelector('#board-desc').value = board?.description || ''
  document.querySelector('#board-mood').value = board?.mood || ''
  document.querySelector('#board-playlist').value = board?.playlist_url || ''
  document.querySelector('#board-msg').textContent = ''

  let boardVis = board?.visibility || 'public'
  const updateVisBtns = () => {
    document.querySelectorAll('.board-vis-btn').forEach(b => {
      const on = b.dataset.vis === boardVis
      b.style.border = `2px solid ${on ? '#fff' : '#2a2a2a'}`; b.style.background = on ? '#fff' : '#1a1a1a'; b.style.color = on ? '#000' : '#555'
    })
  }
  updateVisBtns()
  document.querySelectorAll('.board-vis-btn').forEach(b => { b.addEventListener('click', () => { boardVis = b.dataset.vis; updateVisBtns() }) })

  document.querySelector('#board-modal-close').onclick = () => { modal.style.display = 'none' }

  const saveBtn = document.querySelector('#board-save')
  const newSaveBtn = saveBtn.cloneNode(true); saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn)
  newSaveBtn.addEventListener('click', async () => {
    const title = document.querySelector('#board-title').value.trim()
    const msg = document.querySelector('#board-msg')
    if (!title) { msg.textContent = 'Name fehlt'; return }
    msg.textContent = 'Speichern...'
    const editId = document.querySelector('#board-edit-id').value
    const payload = {
      title, description: document.querySelector('#board-desc').value.trim() || null,
      mood: document.querySelector('#board-mood').value.trim().replace(/^#+/, '').toLowerCase() || null,
      playlist_url: document.querySelector('#board-playlist').value.trim() || null,
      visibility: boardVis,
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('boards').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('boards').insert({ ...payload, user_id: currentUserId }))
    }
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => { modal.style.display = 'none'; showProfilePage(username) }, 600)
  })
}

// ─── Board Page ───────────────────────────────────────────────────────────────

async function showBoardPage(username, boardId) {
  const app = document.querySelector('#app')
  app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#444;">Lädt...</div>`
  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id || null
  const { data: profile } = await supabase.from('profiles').select('id, username').eq('username', username.toLowerCase()).single()
  if (!profile) { app.innerHTML = `<p style="color:#555;padding:40px;">Profil nicht gefunden</p>`; return }
  const { data: board } = await supabase.from('boards').select('*').eq('id', boardId).single()
  if (!board) { app.innerHTML = `<p style="color:#555;padding:40px;">Board nicht gefunden</p>`; return }
  const isOwner = currentUserId === profile.id
  app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;color:#fff;padding-bottom:40px;">
    <div style="padding:16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;">
      <button onclick="history.back()" style="background:none;border:none;color:#555;cursor:pointer;font-size:20px;line-height:1;">←</button>
      <span style="color:#fff;font-size:15px;font-weight:500;">${escapeHtml(board.title)}</span>
    </div>
    <div id="board-standalone"></div>
  </div>`
  const { data: boards } = await supabase.from('boards').select('*').eq('user_id', profile.id)
  await loadBoardContent(boardId, document.querySelector('#board-standalone'), isOwner, currentUserId, boards || [], username)
}

// ─── Render Board Post ────────────────────────────────────────────────────────

function renderBoardPost(post, isOwner) {
  const mt = post.media_type || detectMediaType(post.media_url)
  const vis = post.visibility || 'public'
  const badge = isOwner && vis !== 'public' ? `<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.65);border-radius:8px;padding:2px 5px;font-size:10px;color:#ccc;">${vis === 'private' ? '🔒' : '👥'}</div>` : ''
  if (mt === 'video' || mt === 'gif') {
    return `<div style="break-inside:avoid;margin-bottom:3px;aspect-ratio:1;overflow:hidden;background:#111;position:relative;"><video src="${post.media_url}" style="width:100%;height:100%;object-fit:cover;" autoplay loop muted playsinline></video>${badge}</div>`
  }
  if (mt === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(post.media_url)
    return `<div style="break-inside:avoid;margin-bottom:3px;position:relative;padding-bottom:100%;overflow:hidden;background:#111;"><iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allow="autoplay;encrypted-media" allowfullscreen></iframe>${badge}</div>`
  }
  return `<div style="break-inside:avoid;margin-bottom:3px;aspect-ratio:1;overflow:hidden;background:#111;position:relative;"><img src="${post.media_url}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" onerror="this.style.display='none'" />${badge}</div>`
}

// ─── Img Drag ─────────────────────────────────────────────────────────────────

function setupImgDrag(pos) {
  const wrap = document.querySelector('#img-preview-wrap')
  if (!wrap) return
  let dragging = false, sx, sy, spx, spy
  const onStart = (x, y) => { dragging = true; sx = x; sy = y; spx = pos.x; spy = pos.y; wrap.style.cursor = 'grabbing' }
  const onMove = (x, y) => {
    if (!dragging) return
    pos.x = Math.max(0, Math.min(100, spx - (x - sx) / wrap.offsetWidth * 100))
    pos.y = Math.max(0, Math.min(100, spy - (y - sy) / wrap.offsetHeight * 100))
    const img = document.querySelector('#img-preview')
    if (img) img.style.transform = `translate(${pos.x - 50}%, ${pos.y - 50}%) scale(${pos.zoom})`
  }
  const onEnd = () => { dragging = false; wrap.style.cursor = 'grab' }
  wrap.addEventListener('mousedown', e => onStart(e.clientX, e.clientY))
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
  window.addEventListener('mouseup', onEnd)
  wrap.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY))
  window.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY) } }, { passive: false })
  window.addEventListener('touchend', onEnd)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaderStyle(profile) {
  if (profile.header_type === 'image' && profile.header_image_url) return `background:${profile.header_color || '#111'};`
  return `background:${profile.header_color || '#0a0a0a'};`
}

function buildPatternStyle(pattern) {
  const p = {
    dots: 'background-image:radial-gradient(circle,#fff 1px,transparent 1px);background-size:16px 16px;',
    stripes: 'background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%);background-size:8px 8px;',
    grid: 'background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:20px 20px;',
    diagonal: 'background-image:repeating-linear-gradient(-45deg,#fff 0,#fff 1px,transparent 0,transparent 6px);background-size:8px 8px;',
    waves: 'background-image:repeating-radial-gradient(circle at 0 0,transparent 0,#fff 20px),repeating-linear-gradient(#ffffff33,#ffffff33);',
    noise: 'background-image:url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.4\'/%3E%3C/svg%3E");background-size:200px 200px;',
  }
  return p[pattern] || p.dots
}

function buildMusicEmbed(url) {
  if (!url) return ''
  if (url.includes('spotify.com')) return `<iframe src="${url.replace('open.spotify.com/', 'open.spotify.com/embed/')}" width="100%" height="80" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" style="display:block;"></iframe>`
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const listId = url.match(/list=([^&\s]+)/)?.[1], videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
    const embedUrl = listId ? `https://www.youtube.com/embed/videoseries?list=${listId}` : `https://www.youtube.com/embed/${videoId}`
    return `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allow="autoplay;encrypted-media" style="display:block;"></iframe>`
  }
  if (url.includes('music.apple.com')) return `<iframe src="${url.replace('music.apple.com', 'embed.music.apple.com')}" width="100%" height="150" frameborder="0" allow="autoplay;*;encrypted-media;*" style="display:block;"></iframe>`
  return `<p style="padding:16px;color:#555;font-size:13px;">Playlist-URL nicht erkannt.</p>`
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}