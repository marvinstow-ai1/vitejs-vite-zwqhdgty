import '../css/main.css'
import { supabase } from './supabase.js'

// ─── Router (inline, kein separates File) ────────────────────────────────────

function navigate(path) {
  window.history.pushState({}, '', path)
  handleRoute()
}

function handleRoute() {
  const path = window.location.pathname
  const profileMatch = path.match(/^\/u\/([a-z0-9_]+)$/i)
  if (profileMatch) {
    showProfilePage(profileMatch[1])
  } else {
    init()
  }
}

window.addEventListener('popstate', handleRoute)
handleRoute()

// ─── Init (Feed) ──────────────────────────────────────────────────────────────

async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { showLogin(); return }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single()

  if (!profile?.username) {
    showUsernameSetup(session.user.id)
  } else {
    showFeed(profile)
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────

function showLogin() {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;">
      <div style="width:100%;max-width:360px;padding:40px 24px;">
        <h1 style="color:#fff;font-size:24px;font-weight:500;margin-bottom:8px;">Marvin's Place</h1>
        <p style="color:#666;font-size:14px;margin-bottom:32px;">Melde dich an</p>
        <input id="email" type="email" placeholder="Email"
          style="display:block;width:100%;padding:12px;margin-bottom:12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <input id="password" type="password" placeholder="Passwort"
          style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-login"
          style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:10px;">
          Einloggen
        </button>
        <button id="btn-signup"
          style="width:100%;padding:12px;background:transparent;color:#fff;border:1px solid #333;border-radius:8px;font-size:14px;cursor:pointer;">
          Registrieren
        </button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>
  `
  document.querySelector('#btn-login').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    const msg = document.querySelector('#msg')
    msg.textContent = 'Lädt...'
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
        <input id="username" type="text" placeholder="username"
          style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-save"
          style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
          Weiter
        </button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>
  `
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

// ─── Feed ────────────────────────────────────────────────────────────────────

async function showFeed(profile) {
  document.querySelector('#app').innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;">

      <header style="padding:12px 24px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;position:sticky;top:0;background:#0a0a0a;z-index:10;">
        <span style="font-size:16px;font-weight:500;white-space:nowrap;flex-shrink:0;cursor:pointer;" id="logo">Marvin's Place</span>

        <div style="flex:1;max-width:320px;position:relative;">
          <input id="search-input" type="text" placeholder="User suchen..."
            style="width:100%;padding:8px 12px 8px 32px;background:#1a1a1a;border:1px solid #222;border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;" />
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:#444;">🔍</span>
          <div id="search-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:#111;border:1px solid #222;border-radius:10px;overflow:hidden;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,0.6);"></div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-left:auto;flex-shrink:0;">
          <div style="position:relative;">
            <button id="notif-btn" style="background:none;border:none;cursor:pointer;color:#555;font-size:18px;padding:4px;line-height:1;position:relative;">
              🔔
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
          <span id="header-username" data-user-id="${profile.id}" data-username="${profile.username}"
            style="font-size:14px;color:#666;cursor:pointer;">@${profile.username}</span>
          <button id="btn-logout" style="padding:6px 14px;background:transparent;color:#666;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:12px;">Ausloggen</button>
        </div>
      </header>

      <div style="max-width:600px;margin:24px auto;padding:0 24px;">
        <div style="background:#111;border:1px solid #222;border-radius:12px;padding:16px;">
          <p style="color:#666;font-size:12px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Neuer Post</p>
          <input id="post-url" type="text" placeholder="Bild-URL einfügen (https://...)"
            style="display:block;width:100%;padding:10px 12px;margin-bottom:10px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
          <div style="position:relative;margin-bottom:12px;">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#555;font-size:13px;">#</span>
            <input id="post-mood" type="text" placeholder="mood, vibe, aesthetic..."
              style="display:block;width:100%;padding:10px 12px 10px 24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
          </div>
          <button id="btn-post" style="padding:10px 20px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Posten</button>
          <span id="post-msg" style="color:#666;font-size:13px;margin-left:12px;"></span>
        </div>
      </div>

      <div style="max-width:1200px;margin:0 auto;padding:0 24px 16px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button id="filter-all" style="padding:5px 14px;background:#fff;color:#000;border:none;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">Alle</button>
          <div id="mood-chips" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
        </div>
      </div>

      <div id="feed-grid" style="max-width:1200px;margin:0 auto;padding:0 24px 80px;columns:3 200px;gap:12px;">
        <p style="color:#333;font-size:14px;">Lädt...</p>
      </div>
    </div>

    <!-- Comments Modal -->
    <div id="comments-modal" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.85);align-items:center;justify-content:center;">
      <div style="background:#111;border:1px solid #222;border-radius:14px;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;margin:16px;">
        <div style="padding:16px 20px;border-bottom:1px solid #1f1f1f;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <span style="font-size:14px;font-weight:500;color:#fff;">Kommentare</span>
          <button id="modal-close" style="background:none;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div id="modal-image-wrap" style="flex-shrink:0;"></div>
        <div id="comments-list" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;"></div>
        <div style="padding:12px 20px;border-top:1px solid #1f1f1f;display:flex;gap:8px;flex-shrink:0;">
          <input id="comment-input" type="text" placeholder="Kommentar schreiben..."
            style="flex:1;padding:9px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;outline:none;" />
          <button id="comment-submit" style="padding:9px 16px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;">Senden</button>
        </div>
      </div>
    </div>
  `

  // Logo → Feed
  document.querySelector('#logo').addEventListener('click', () => navigate('/'))

  // Header Username → eigenes Profil
  document.querySelector('#header-username').addEventListener('click', () => {
    navigate('/u/' + profile.username)
  })

  setupSearch(profile.id)
  setupNotifications(profile.id)

  document.querySelector('#btn-logout').addEventListener('click', async () => {
    if (realtimeChannel) { await supabase.removeChannel(realtimeChannel); realtimeChannel = null }
    if (notifChannel) { await supabase.removeChannel(notifChannel); notifChannel = null }
    await supabase.auth.signOut()
    showLogin()
  })

  document.querySelector('#btn-post').addEventListener('click', async () => {
    const url = document.querySelector('#post-url').value.trim()
    const moodRaw = document.querySelector('#post-mood').value.trim()
    const mood = moodRaw.replace(/^#+/, '').toLowerCase().replace(/\s+/g, '_') || null
    const msg = document.querySelector('#post-msg')
    if (!url) { msg.textContent = 'URL fehlt'; return }
    msg.textContent = 'Posten...'
    const { error } = await supabase.from('posts').insert({ user_id: profile.id, media_url: url, media_type: 'image', mood })
    if (error) { msg.textContent = error.message; return }
    msg.textContent = '✓ Gepostet!'
    document.querySelector('#post-url').value = ''
    document.querySelector('#post-mood').value = ''
    setTimeout(() => { msg.textContent = '' }, 2000)
    activeMood = null
    await loadMoodChips(profile.id)
    loadPosts(profile.id)
  })

  document.querySelector('#modal-close').addEventListener('click', closeCommentsModal)
  document.querySelector('#comments-modal').addEventListener('click', (e) => {
    if (e.target === document.querySelector('#comments-modal')) closeCommentsModal()
  })

  document.addEventListener('click', (e) => {
    const notifBtn = document.querySelector('#notif-btn')
    const notifDrop = document.querySelector('#notif-dropdown')
    if (notifBtn && notifDrop && !notifBtn.contains(e.target) && !notifDrop.contains(e.target)) notifDrop.style.display = 'none'
    const searchIn = document.querySelector('#search-input')
    const searchDrop = document.querySelector('#search-dropdown')
    if (searchIn && searchDrop && !searchIn.contains(e.target) && !searchDrop.contains(e.target)) searchDrop.style.display = 'none'
  })

  document.querySelector('#filter-all').addEventListener('click', () => {
    activeMood = null; updateFilterUI(); loadPosts(profile.id)
  })

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
    <button class="mood-chip" data-mood="${mood}"
      style="padding:5px 12px;background:transparent;color:#555;border:1px solid #2a2a2a;border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap;">
      #${mood} <span style="opacity:0.5;">${count}</span>
    </button>
  `).join('')
  container.querySelectorAll('.mood-chip').forEach(btn => {
    btn.addEventListener('click', () => { activeMood = btn.dataset.mood; updateFilterUI(); loadPosts(currentUserId) })
  })
  updateFilterUI()
}

function updateFilterUI() {
  const allBtn = document.querySelector('#filter-all')
  if (allBtn) {
    allBtn.style.background = activeMood ? 'transparent' : '#fff'
    allBtn.style.color = activeMood ? '#555' : '#000'
    allBtn.style.border = activeMood ? '1px solid #2a2a2a' : 'none'
  }
  document.querySelectorAll('.mood-chip').forEach(btn => {
    const on = btn.dataset.mood === activeMood
    btn.style.background = on ? '#fff' : 'transparent'
    btn.style.color = on ? '#000' : '#555'
    btn.style.border = on ? '1px solid #fff' : '1px solid #2a2a2a'
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
    <div class="search-result" data-username="${u.username}"
      style="padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;"
      onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='transparent'">
      <div style="width:28px;height:28px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:12px;color:#555;flex-shrink:0;">${u.username[0].toUpperCase()}</div>
      <span style="font-size:13px;color:#ccc;">@${u.username}</span>
      ${u.id === currentUserId ? `<span style="font-size:11px;color:#444;margin-left:auto;">du</span>` : ''}
    </div>
  `).join('')
  dropdown.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      dropdown.style.display = 'none'
      document.querySelector('#search-input').value = ''
      navigate('/u/' + el.dataset.username)
    })
  })
}

// ─── Notifications ────────────────────────────────────────────────────────────

function setupNotifications(currentUserId) {
  const btn = document.querySelector('#notif-btn')
  const dropdown = document.querySelector('#notif-dropdown')
  const markReadBtn = document.querySelector('#notif-mark-read')
  refreshNotifBadge(currentUserId)
  btn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const isOpen = dropdown.style.display === 'block'
    dropdown.style.display = isOpen ? 'none' : 'block'
    if (!isOpen) await loadNotifications(currentUserId)
  })
  markReadBtn.addEventListener('click', async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', currentUserId).eq('read', false)
    refreshNotifBadge(currentUserId)
    loadNotifications(currentUserId)
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
  if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex' }
  else { badge.style.display = 'none' }
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
    const icon = n.type === 'like' ? '♥' : n.type === 'comment' ? '💬' : '👤'
    const iconColor = n.type === 'like' ? '#ff4d6d' : n.type === 'comment' ? '#4d9fff' : '#aaa'
    const text = n.type === 'like' ? 'hat deinen Post geliked' : n.type === 'comment' ? 'hat kommentiert' : 'folgt dir jetzt'
    const unread = !n.read
    return `
      <div style="padding:12px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:flex-start;gap:10px;background:${unread ? '#141414' : 'transparent'};">
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

// ─── Posts laden ─────────────────────────────────────────────────────────────

async function loadPosts(currentUserId) {
  const grid = document.querySelector('#feed-grid')
  if (!grid) return
  let query = supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(50)
  if (activeMood) query = query.eq('mood', activeMood)
  const { data: posts, error } = await query
  if (error) { grid.innerHTML = `<p style="color:#666;">Fehler: ${error.message}</p>`; return }
  if (!posts?.length) { grid.innerHTML = `<p style="color:#333;font-size:14px;">${activeMood ? `Keine Posts mit #${activeMood}.` : 'Noch keine Posts.'}</p>`; return }

  const userIds = [...new Set(posts.map(p => p.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
  const usernameMap = {}
  profiles?.forEach(p => { usernameMap[p.id] = p.username })

  const postIds = posts.map(p => p.id)
  const { data: allLikes } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds)
  const { data: allComments } = await supabase.from('comments').select('post_id').in('post_id', postIds)

  const likeCounts = {}; const userLikedSet = new Set(); const commentCounts = {}
  allLikes?.forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; if (l.user_id === currentUserId) userLikedSet.add(l.post_id) })
  allComments?.forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1 })

  grid.innerHTML = posts.map(post => {
    const count = likeCounts[post.id] || 0
    const liked = userLikedSet.has(post.id)
    const ccount = commentCounts[post.id] || 0
    const username = usernameMap[post.user_id] || 'unknown'
    return `
      <div data-post-id="${post.id}" style="break-inside:avoid;margin-bottom:12px;border-radius:10px;overflow:hidden;background:#111;border:1px solid #1a1a1a;">
        <img src="${post.media_url}" alt="" class="post-img" data-post-id="${post.id}" data-media-url="${post.media_url}"
          style="width:100%;display:block;object-fit:cover;cursor:pointer;" onerror="this.style.display='none'" />
        <div style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <span class="username-link" data-username="${username}"
              style="font-size:12px;color:#777;cursor:pointer;"
              onmouseover="this.style.color='#aaa'" onmouseout="this.style.color='#777'">@${username}</span>
            ${post.mood ? `<span class="mood-tag" data-mood="${post.mood}" style="font-size:11px;color:#555;margin-left:8px;cursor:pointer;">#${post.mood}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="comment-btn" data-post-id="${post.id}" data-media-url="${post.media_url}" data-owner-id="${post.user_id}"
              style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;color:#555;font-size:13px;padding:4px 8px;border-radius:6px;">
              <span style="font-size:15px;">💬</span>
              <span class="comment-count" data-post-id="${post.id}">${ccount}</span>
            </button>
            <button class="like-btn" data-post-id="${post.id}" data-liked="${liked}" data-owner-id="${post.user_id}"
              style="display:flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;color:${liked ? '#ff4d6d' : '#555'};font-size:13px;padding:4px 8px;border-radius:6px;transition:all 0.15s;">
              <span style="font-size:16px;">${liked ? '♥' : '♡'}</span>
              <span class="like-count" data-post-id="${post.id}">${count}</span>
            </button>
          </div>
        </div>
      </div>`
  }).join('')

  document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', () => handleLike(btn, currentUserId)))
  const openComment = (postId, mediaUrl, ownerId) => openCommentsModal(postId, mediaUrl, currentUserId, ownerId)
  document.querySelectorAll('.comment-btn').forEach(btn => btn.addEventListener('click', () => openComment(btn.dataset.postId, btn.dataset.mediaUrl, btn.dataset.ownerId)))
  document.querySelectorAll('.post-img').forEach(img => img.addEventListener('click', () => {
    const commentBtn = img.closest('[data-post-id]')?.querySelector('.comment-btn')
    openComment(img.dataset.postId, img.dataset.mediaUrl, commentBtn?.dataset.ownerId)
  }))
  document.querySelectorAll('.username-link').forEach(el => el.addEventListener('click', () => navigate('/u/' + el.dataset.username)))
  document.querySelectorAll('.mood-tag').forEach(tag => tag.addEventListener('click', () => {
    activeMood = tag.dataset.mood; updateFilterUI(); loadPosts(currentUserId); window.scrollTo({ top: 0, behavior: 'smooth' })
  }))
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

async function openCommentsModal(postId, mediaUrl, currentUserId, postOwnerId) {
  const modal = document.querySelector('#comments-modal')
  const list = document.querySelector('#comments-list')
  const imgWrap = document.querySelector('#modal-image-wrap')
  const input = document.querySelector('#comment-input')
  let submitBtn = document.querySelector('#comment-submit')

  imgWrap.innerHTML = `<img src="${mediaUrl}" alt="" style="width:100%;max-height:220px;object-fit:cover;" onerror="this.style.display='none'" />`
  modal.style.display = 'flex'
  list.innerHTML = `<p style="color:#444;font-size:13px;">Lädt...</p>`
  await loadComments(postId, list)

  const newSubmitBtn = submitBtn.cloneNode(true)
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn)
  newSubmitBtn.addEventListener('click', async () => {
    const text = input.value.trim()
    if (!text) return
    newSubmitBtn.disabled = true; newSubmitBtn.textContent = '...'
    const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: currentUserId, content: text })
    newSubmitBtn.disabled = false; newSubmitBtn.textContent = 'Senden'
    if (error) { console.error(error); return }
    input.value = ''
    await loadComments(postId, list)
    const countEl = document.querySelector(`.comment-count[data-post-id="${postId}"]`)
    if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1
    list.scrollTop = list.scrollHeight
    if (postOwnerId) await createNotification(postOwnerId, currentUserId, 'comment', postId)
  })
  input.onkeydown = (e) => { if (e.key === 'Enter') newSubmitBtn.click() }
  input.focus()
}

async function loadComments(postId, list) {
  const { data: comments } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })
  if (!comments?.length) { list.innerHTML = `<p style="color:#444;font-size:13px;">Noch keine Kommentare. Sei der Erste!</p>`; return }
  const userIds = [...new Set(comments.map(c => c.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
  const usernameMap = {}
  profiles?.forEach(p => { usernameMap[p.id] = p.username })
  list.innerHTML = comments.map(c => `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:11px;color:#555;">@${usernameMap[c.user_id] || 'unknown'}</span>
      <span style="font-size:13px;color:#ccc;line-height:1.4;">${escapeHtml(c.content)}</span>
    </div>`).join('')
  list.scrollTop = list.scrollHeight
}

// ─── Like Toggle ─────────────────────────────────────────────────────────────

async function handleLike(btn, currentUserId) {
  const postId = btn.dataset.postId
  const liked = btn.dataset.liked === 'true'
  const ownerId = btn.dataset.ownerId
  const newLiked = !liked
  const countEl = document.querySelector(`.like-count[data-post-id="${postId}"]`)
  const currentCount = parseInt(countEl?.textContent || '0')
  btn.dataset.liked = newLiked
  btn.style.color = newLiked ? '#ff4d6d' : '#555'
  btn.querySelector('span').textContent = newLiked ? '♥' : '♡'
  if (countEl) countEl.textContent = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1)
  if (liked) {
    const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUserId)
    if (error) { btn.dataset.liked = liked; btn.style.color = '#ff4d6d'; btn.querySelector('span').textContent = '♥'; if (countEl) countEl.textContent = currentCount }
  } else {
    const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId })
    if (error) { btn.dataset.liked = liked; btn.style.color = '#555'; btn.querySelector('span').textContent = '♡'; if (countEl) countEl.textContent = currentCount }
    else { if (ownerId) await createNotification(ownerId, currentUserId, 'like', postId) }
  }
}

// ─── Realtime Likes ───────────────────────────────────────────────────────────

function setupRealtimeLikes(currentUserId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
  realtimeChannel = supabase.channel('likes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, (payload) => {
      const postId = payload.new?.post_id || payload.old?.post_id
      if (!postId) return
      if ((payload.new?.user_id || payload.old?.user_id) === currentUserId) return
      refreshLikeCount(postId)
    }).subscribe()
}

async function refreshLikeCount(postId) {
  const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId)
  const countEl = document.querySelector(`.like-count[data-post-id="${postId}"]`)
  if (countEl && count !== null) countEl.textContent = count
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
    </div>`
    return
  }

  const isOwner = currentUserId === profile.id

  const { data: posts } = await supabase.from('posts').select('id, media_url, mood, media_type').eq('user_id', profile.id).order('created_at', { ascending: false })
  const { count: followerCount } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('following_id', profile.id).eq('status', 'accepted')
  const { count: followingCount } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id).eq('status', 'accepted')

  let isFollowing = false, followId = null
  if (currentUserId && !isOwner) {
    const { data: fw } = await supabase.from('friendships').select('id').eq('follower_id', currentUserId).eq('following_id', profile.id).maybeSingle()
    isFollowing = !!fw; followId = fw?.id || null
  }

  const shuffled = profile.pinned_board_mood
    ? (posts || []).filter(p => p.mood === profile.pinned_board_mood)
    : shuffleArray(posts || [])

  const headerStyle = buildHeaderStyle(profile)

  app.innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;">

      <!-- Header -->
      <div id="profile-header" style="position:relative;width:100%;height:260px;overflow:hidden;${headerStyle}">
        ${profile.header_type === 'image' && profile.header_image_url ? `
          <img src="${profile.header_image_url}" alt="" style="position:absolute;width:100%;height:100%;object-fit:cover;
            transform:translate(${(profile.header_image_position?.x || 50) - 50}%, ${(profile.header_image_position?.y || 50) - 50}%) scale(${profile.header_image_position?.zoom || 1});transform-origin:center;" />` : ''}
        ${profile.header_type === 'pattern' ? `<div style="position:absolute;inset:0;${buildPatternStyle(profile.header_pattern)}opacity:0.25;"></div>` : ''}

        <!-- Oben links: Name + Bio -->
        <div style="position:absolute;top:20px;left:20px;z-index:2;max-width:60%;">
          <div style="font-size:22px;font-weight:700;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.8);">${escapeHtml(profile.display_name || profile.username)}</div>
          ${profile.bio ? `<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:6px;line-height:1.4;text-shadow:0 1px 4px rgba(0,0,0,0.7);">${escapeHtml(profile.bio)}</div>` : ''}
        </div>

        <!-- Oben rechts -->
        <div style="position:absolute;top:16px;right:16px;z-index:2;display:flex;gap:8px;">
          <button id="btn-back" style="padding:6px 14px;background:rgba(0,0,0,0.5);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">← Feed</button>
          ${isOwner
            ? `<button id="btn-edit" style="padding:6px 14px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">✏️ Edit</button>`
            : currentUserId ? `<button id="btn-follow" style="padding:6px 14px;background:${isFollowing ? 'transparent' : 'rgba(255,255,255,0.9)'};color:${isFollowing ? '#fff' : '#000'};border:1px solid rgba(255,255,255,0.4);border-radius:8px;cursor:pointer;font-size:12px;">${isFollowing ? 'Entfolgen' : 'Folgen'}</button>` : ''
          }
        </div>

        <!-- Unten links: Info Button -->
        <button id="btn-info" style="position:absolute;bottom:16px;left:16px;z-index:2;padding:6px 14px;background:rgba(0,0,0,0.5);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:20px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">
          @${profile.username} · ${posts?.length || 0} Posts · ${followerCount || 0} Follower
        </button>

        <!-- Unten rechts: Musik -->
        ${profile.playlist_url ? `
          <button id="btn-music" style="position:absolute;bottom:16px;right:16px;z-index:2;width:42px;height:42px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;font-size:20px;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;">🎵</button>
        ` : ''}
      </div>

      <!-- Info Panel -->
      <div id="info-panel" style="display:none;background:#111;border-bottom:1px solid #222;padding:16px 20px;">
        <div style="display:flex;gap:24px;font-size:13px;color:#666;">
          <span><strong style="color:#fff;">${posts?.length || 0}</strong> Posts</span>
          <span><strong style="color:#fff;">${followerCount || 0}</strong> Follower</span>
          <span><strong style="color:#fff;">${followingCount || 0}</strong> Following</span>
        </div>
        ${profile.profile_link ? `<a href="${escapeHtml(profile.profile_link)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;color:#4d9fff;text-decoration:none;">🔗 ${escapeHtml(profile.profile_link)}</a>` : ''}
      </div>

      <!-- Musik Panel -->
      <div id="music-panel" style="display:none;"></div>

      <!-- Board Grid -->
      <div style="columns:3 120px;gap:3px;padding:3px;">
        ${shuffled.map(post => `
          <div style="break-inside:avoid;margin-bottom:3px;aspect-ratio:1;overflow:hidden;background:#111;">
            ${post.media_type === 'video'
              ? `<video src="${post.media_url}" style="width:100%;height:100%;object-fit:cover;" autoplay loop muted playsinline></video>`
              : `<img src="${post.media_url}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" onerror="this.style.display='none'" />`
            }
          </div>`).join('')}
        ${!shuffled.length ? `<p style="color:#333;font-size:14px;padding:40px;">Noch keine Posts.</p>` : ''}
      </div>
    </div>

    <!-- Edit Modal -->
    <div id="edit-modal" style="display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.92);overflow-y:auto;">
      <div style="max-width:500px;margin:0 auto;padding:24px 16px 80px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <h2 style="color:#fff;font-size:18px;font-weight:500;margin:0;">Profil editieren</h2>
          <button id="edit-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;">×</button>
        </div>

        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Anzeigename</label>
        <input id="edit-displayname" type="text" value="${escapeHtml(profile.display_name || '')}" placeholder="${profile.username}"
          style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />

        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Bio</label>
        <textarea id="edit-bio" rows="3" placeholder="Kurze Bio..."
          style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;resize:vertical;">${escapeHtml(profile.bio || '')}</textarea>

        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Link</label>
        <input id="edit-link" type="url" value="${escapeHtml(profile.profile_link || '')}" placeholder="https://..."
          style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />

        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL</label>
        <input id="edit-playlist" type="url" value="${escapeHtml(profile.playlist_url || '')}" placeholder="Spotify / YouTube / Apple Music..."
          style="display:block;width:100%;padding:10px 12px;margin-bottom:24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />

        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Header</label>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="htype-btn" data-type="color" style="flex:1;padding:8px;background:${(profile.header_type||'color')==='color'?'#fff':'#1a1a1a'};color:${(profile.header_type||'color')==='color'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Farbe</button>
          <button class="htype-btn" data-type="pattern" style="flex:1;padding:8px;background:${profile.header_type==='pattern'?'#fff':'#1a1a1a'};color:${profile.header_type==='pattern'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Muster</button>
          <button class="htype-btn" data-type="image" style="flex:1;padding:8px;background:${profile.header_type==='image'?'#fff':'#1a1a1a'};color:${profile.header_type==='image'?'#000':'#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Foto</button>
        </div>

        <!-- Farb Section -->
        <div id="sec-color" style="display:${(profile.header_type||'color')==='color'?'block':'none'};margin-bottom:20px;">
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Pastell</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ffd6e0','#ffecb3','#d4edda','#cce5ff','#e2d9f3','#ffecd2','#c8e6c9','#b3e5fc','#f8bbd0','#dcedc8'].map(c =>
              `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color===c?'#fff':'transparent'};"></div>`).join('')}
          </div>
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Kräftig</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ff4d6d','#ff6b35','#ffd60a','#06d6a0','#118ab2','#7209b7','#3a0ca3','#f72585','#0a0a0a','#ffffff'].map(c =>
              `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color===c?'#fff':'transparent'};"></div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="color-wheel" value="${profile.header_color||'#0a0a0a'}" style="width:40px;height:40px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;" />
            <input type="text" id="hex-input" value="${profile.header_color||'#0a0a0a'}" placeholder="#000000"
              style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;outline:none;" />
            <div id="hex-preview" style="width:40px;height:40px;border-radius:8px;background:${profile.header_color||'#0a0a0a'};border:1px solid #333;"></div>
          </div>
        </div>

        <!-- Pattern Section -->
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
            <input type="text" id="pattern-hex" value="${profile.header_color||'#0a0a0a'}"
              style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:12px;outline:none;" />
          </div>
        </div>

        <!-- Image Section -->
        <div id="sec-image" style="display:${profile.header_type==='image'?'block':'none'};margin-bottom:20px;">
          <div id="img-preview-wrap" style="position:relative;width:100%;height:140px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:10px;cursor:grab;">
            ${profile.header_image_url
              ? `<img id="img-preview" src="${profile.header_image_url}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform:translate(${(profile.header_image_position?.x||50)-50}%, ${(profile.header_image_position?.y||50)-50}%) scale(${profile.header_image_position?.zoom||1});transform-origin:center;" />`
              : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#444;font-size:13px;">Noch kein Foto</div>`}
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
  `

  // Event Listeners
  document.querySelector('#btn-back').addEventListener('click', () => navigate('/'))
  document.querySelector('#btn-info').addEventListener('click', () => {
    const p = document.querySelector('#info-panel')
    p.style.display = p.style.display === 'none' ? 'block' : 'none'
  })

  const musicBtn = document.querySelector('#btn-music')
  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      const p = document.querySelector('#music-panel')
      if (p.style.display === 'none') { p.style.display = 'block'; p.innerHTML = buildMusicEmbed(profile.playlist_url) }
      else { p.style.display = 'none'; p.innerHTML = '' }
    })
  }

  const followBtn = document.querySelector('#btn-follow')
  if (followBtn) {
    followBtn.addEventListener('click', async () => {
      if (isFollowing) {
        await supabase.from('friendships').delete().eq('id', followId)
        followBtn.textContent = 'Folgen'; followBtn.style.background = 'rgba(255,255,255,0.9)'; followBtn.style.color = '#000'
        isFollowing = false
      } else {
        const { data } = await supabase.from('friendships').insert({ follower_id: currentUserId, following_id: profile.id, status: 'accepted' }).select().single()
        followId = data?.id; isFollowing = true
        followBtn.textContent = 'Entfolgen'; followBtn.style.background = 'transparent'; followBtn.style.color = '#fff'
      }
    })
  }

  if (!isOwner) return

  // Edit Modal
  let currentType = profile.header_type || 'color'
  let currentColor = profile.header_color || '#0a0a0a'
  let currentPattern = profile.header_pattern || 'dots'
  let currentImageUrl = profile.header_image_url || null
  let currentImagePos = profile.header_image_position ? { ...profile.header_image_position } : { x: 50, y: 50, zoom: 1 }

  document.querySelector('#btn-edit').addEventListener('click', () => { document.querySelector('#edit-modal').style.display = 'block' })
  document.querySelector('#edit-close').addEventListener('click', () => { document.querySelector('#edit-modal').style.display = 'none' })

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

  const hexInput = document.querySelector('#hex-input')
  const colorWheel = document.querySelector('#color-wheel')
  hexInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) { currentColor = hexInput.value; colorWheel.value = currentColor; document.querySelector('#hex-preview').style.background = currentColor }
  })
  colorWheel.addEventListener('input', () => { currentColor = colorWheel.value; hexInput.value = currentColor; document.querySelector('#hex-preview').style.background = currentColor })

  document.querySelectorAll('.pattern-tile').forEach(k => {
    k.addEventListener('click', () => {
      currentPattern = k.dataset.pattern
      document.querySelectorAll('.pattern-tile').forEach(x => x.style.borderColor = '#2a2a2a')
      k.style.borderColor = '#fff'
    })
  })

  const patternWheel = document.querySelector('#pattern-wheel')
  const patternHex = document.querySelector('#pattern-hex')
  patternWheel.addEventListener('input', () => { currentColor = patternWheel.value; patternHex.value = currentColor })
  patternHex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(patternHex.value)) { currentColor = patternHex.value; patternWheel.value = currentColor } })

  document.querySelector('#btn-upload').addEventListener('click', () => document.querySelector('#header-file').click())
  document.querySelector('#header-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return
    const btn = document.querySelector('#btn-upload'); btn.textContent = 'Hochladen...'
    const ext = file.name.split('.').pop()
    const path = `${currentUserId}/header.${ext}`
    const { error } = await supabase.storage.from('headers').upload(path, file, { upsert: true })
    if (error) { btn.textContent = '❌ Fehler'; return }
    const { data: urlData } = supabase.storage.from('headers').getPublicUrl(path)
    currentImageUrl = urlData.publicUrl
    const wrap = document.querySelector('#img-preview-wrap')
    wrap.innerHTML = `<img id="img-preview" src="${currentImageUrl}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform-origin:center;" />`
    btn.textContent = '✅ Hochgeladen'
    setupImgDrag(currentImagePos)
  })

  const zoomSlider = document.querySelector('#zoom-slider')
  zoomSlider.addEventListener('input', () => {
    currentImagePos.zoom = parseFloat(zoomSlider.value)
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
      header_type: currentType,
      header_color: currentColor,
      header_pattern: currentType === 'pattern' ? currentPattern : null,
      header_image_url: currentType === 'image' ? currentImageUrl : null,
      header_image_position: currentType === 'image' ? currentImagePos : null,
    }).eq('id', currentUserId)
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => showProfilePage(profile.username), 800)
  })
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
  if (url.includes('spotify.com')) {
    const embedUrl = url.replace('open.spotify.com/', 'open.spotify.com/embed/')
    return `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" style="display:block;"></iframe>`
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const listId = url.match(/list=([^&\s]+)/)?.[1]
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
    const embedUrl = listId ? `https://www.youtube.com/embed/videoseries?list=${listId}` : `https://www.youtube.com/embed/${videoId}`
    return `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allow="autoplay;encrypted-media" style="display:block;"></iframe>`
  }
  if (url.includes('music.apple.com')) {
    return `<iframe src="${url.replace('music.apple.com','embed.music.apple.com')}" width="100%" height="150" frameborder="0" allow="autoplay;*;encrypted-media;*" style="display:block;"></iframe>`
  }
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