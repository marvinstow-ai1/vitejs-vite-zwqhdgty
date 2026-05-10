import { supabase } from '../supabase.js'
import { updateShellContent, updateActiveNav, wireShellNav, applyNavPref, getNavPref, setNavPref, refreshUnreadBadge, updateGlobalHeader, refreshGlobalHeaderBadge } from '../shell.js'
import { iconSvg, escapeHtml, buildPatternStyle } from '../utils.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { updateProfile, getMyBlocks } from '../services/profiles.service.js'
import { signOut } from '../services/auth.service.js'
import { unblockUser } from '../services/interactions.service.js'
import { uploadHeaderImage } from '../services/media.service.js'

/**
 * Zeigt die Einstellungs-Seite mit Tile-Grid und Popups.
 * @param {object} profile
 * @param {object} session
 * @param {{ navigate: function, openComposer: function, toggleNotif: function, realtimeChannel: object|null, notifChannel: object|null }} ctx
 */
export async function showSettingsPage(profile, session, ctx) {
  const { navigate, openComposer, toggleNotif } = ctx
  applyNavPref()
  document.body.classList.add('has-global-header')
  document.body.classList.remove('profile-page')

  const navPref = getNavPref()
  const profilePrivacy = profile.profile_privacy || 'public'
  const avatarLetter = (profile.display_name || profile.username || '?')[0].toUpperCase()

  updateActiveNav('settings')
  updateShellContent(`
    <div class="settings-wrap">

      <!-- ── User Info ── -->
      <div class="settings-user">
        <div class="settings-user-avatar">${avatarLetter}</div>
        <div class="settings-user-body">
          <div class="settings-user-name">${escapeHtml(profile.display_name || profile.username)}</div>
          <div class="settings-user-email">@${escapeHtml(profile.username)} · ${escapeHtml(session.user.email || '')}</div>
        </div>
      </div>

      <!-- ── Tile Grid ── -->
      <div class="settings-grid">

        <button class="settings-tile" data-action="edit">
          <span class="settings-tile-icon">✎</span>
          <span class="settings-tile-title">Profil bearbeiten</span>
          <span class="settings-tile-desc">Name, Bio, Header, Links</span>
        </button>

        <button class="settings-tile" data-action="privacy">
          <span class="settings-tile-icon">🔒</span>
          <span class="settings-tile-title">Privacy</span>
          <span class="settings-tile-desc">Sichtbarkeit deines Profils</span>
        </button>

        <button class="settings-tile" data-action="blocks">
          <span class="settings-tile-icon">🚫</span>
          <span class="settings-tile-title">Blockierte Nutzer</span>
          <span class="settings-tile-desc">Verwalte blockierte Profile</span>
        </button>

        <button class="settings-tile" data-action="nav">
          <span class="settings-tile-icon">⊞</span>
          <span class="settings-tile-title">Navigation</span>
          <span class="settings-tile-desc">Auto · Sidebar · Bottom</span>
        </button>

      </div>

      <div style="display:flex;justify-content:center;margin-top:32px;">
        <button id="set-logout" class="logout-btn">⏻ Ausloggen</button>
      </div>
    </div>

    <!-- ── Modal Host ── -->
    <div id="settings-modals-host"></div>`)

  // ── Global Header ──
  updateGlobalHeader({
    tone: 'auto',
    title: 'Einstellungen',
    showSearch: true,
    showBack: true,
  })

  wireShellNav(profile, { navigate, openComposer, toggleNotif })

  getUnreadCount(profile.id).then(c => {
    refreshUnreadBadge(c)
    refreshGlobalHeaderBadge(c)
  }).catch(() => {})

  // ── Tile Click Handler ──
  document.querySelectorAll('.settings-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const action = tile.dataset.action
      if (action === 'edit') openEditModal(profile, session, ctx)
      else if (action === 'privacy') openPrivacyModal(profile)
      else if (action === 'blocks') openBlocksModal(profile.id)
      else if (action === 'nav') openNavModal()
    })
  })

  // ── Logout Button ──
  document.getElementById('set-logout')?.addEventListener('click', () => handleLogout(ctx))
}

// ─────────────────────────────────────────────────────────────────
//  Logout
// ─────────────────────────────────────────────────────────────────

async function handleLogout(ctx) {
  if (ctx.realtimeChannel) { await supabase.removeChannel(ctx.realtimeChannel); ctx.realtimeChannel = null }
  if (ctx.notifChannel) { await supabase.removeChannel(ctx.notifChannel); ctx.notifChannel = null }
  await signOut()
  ctx.navigate('/')
}

// ─────────────────────────────────────────────────────────────────
//  Modal-Helper: open / close
// ─────────────────────────────────────────────────────────────────

function _openModal(html) {
  const host = document.querySelector('#settings-modals-host')
  host.innerHTML = html
  document.body.classList.add('no-scroll')
}

function _closeModal() {
  const host = document.querySelector('#settings-modals-host')
  host.innerHTML = ''
  document.body.classList.remove('no-scroll')
}

// ─────────────────────────────────────────────────────────────────
//  Edit Profile Modal
// ─────────────────────────────────────────────────────────────────

function openEditModal(profile, session, ctx) {
  const { navigate } = ctx
  let currentType = profile.header_type || 'color'
  let currentColor = profile.header_color || '#0a0a0a'
  let currentPattern = profile.header_pattern || 'dots'
  let currentImageUrl = profile.header_image_url || null
  let currentImagePos = profile.header_image_position
    ? { ...profile.header_image_position }
    : { x: 50, y: 50, zoom: 1 }

  const colorTiles = ['#ffd6e0','#ffecb3','#d4edda','#cce5ff','#e2d9f3','#ffecd2','#c8e6c9','#b3e5fc','#f8bbd0','#dcedc8']
  const boldTiles = ['#ff4d6d','#ff6b35','#ffd60a','#06d6a0','#118ab2','#7209b7','#3a0ca3','#f72585','#0a0a0a','#ffffff']

  const patterns = [
    { id:'dots', l:'Punkte' },
    { id:'stripes', l:'Streifen' },
    { id:'grid', l:'Gitter' },
    { id:'diagonal', l:'Diagonal' },
    { id:'waves', l:'Wellen' },
    { id:'noise', l:'Noise' },
  ]

  _openModal(`
    <div class="modal-overlay show" id="edit-overlay"></div>
    <div class="modal show" role="dialog" aria-label="Profil bearbeiten">
      <div class="modal-head">
        <span class="modal-title">Profil bearbeiten</span>
        <button class="icon-btn icon-btn-sm" id="edit-close">${iconSvg('x', 16)}</button>
      </div>
      <div class="modal-body">

        <label style="display:block;color:var(--text-mute);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Anzeigename</label>
        <input class="input" id="edit-displayname" type="text" value="${escapeHtml(profile.display_name || '')}" placeholder="${escapeHtml(profile.username)}" style="margin-bottom:14px;" />

        <label style="display:block;color:var(--text-mute);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Bio</label>
        <textarea class="input" id="edit-bio" rows="3" placeholder="Kurze Bio..." style="margin-bottom:14px;resize:vertical;">${escapeHtml(profile.bio || '')}</textarea>

        <label style="display:block;color:var(--text-mute);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Link</label>
        <input class="input" id="edit-link" type="url" value="${escapeHtml(profile.profile_link || '')}" placeholder="https://..." style="margin-bottom:14px;" />

        <label style="display:block;color:var(--text-mute);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL</label>
        <input class="input" id="edit-playlist" type="url" value="${escapeHtml(profile.playlist_url || '')}" placeholder="Spotify / YouTube / Apple Music..." style="margin-bottom:20px;" />

        <label style="display:block;color:var(--text-mute);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Header</label>

        <div class="seg" style="margin-bottom:16px;">
          <button class="seg-btn ${currentType === 'color' ? 'active' : ''}" data-htype="color">Farbe</button>
          <button class="seg-btn ${currentType === 'pattern' ? 'active' : ''}" data-htype="pattern">Muster</button>
          <button class="seg-btn ${currentType === 'image' ? 'active' : ''}" data-htype="image">Foto</button>
        </div>

        <!-- Color Section -->
        <div id="sec-color" style="display:${currentType === 'color' ? 'block' : 'none'};margin-bottom:16px;">
          <p style="color:var(--text-dim);font-size:11px;margin-bottom:8px;">Pastell</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${colorTiles.map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${currentColor === c ? '#fff' : 'transparent'};"></div>`).join('')}
          </div>
          <p style="color:var(--text-dim);font-size:11px;margin-bottom:8px;">Kr\u00e4ftig</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${boldTiles.map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${currentColor === c ? '#fff' : 'transparent'};"></div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="color-wheel" value="${currentColor}" style="width:40px;height:40px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;" />
            <input type="text" id="hex-input" value="${currentColor}" placeholder="#000000" class="input" style="flex:1;" />
            <div id="hex-preview" style="width:40px;height:40px;border-radius:8px;background:${currentColor};border:1px solid var(--border);flex-shrink:0;"></div>
          </div>
        </div>

        <!-- Pattern Section -->
        <div id="sec-pattern" style="display:${currentType === 'pattern' ? 'block' : 'none'};margin-bottom:16px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
            ${patterns.map(p => `
              <div class="pattern-tile" data-pattern="${p.id}" style="height:60px;border-radius:8px;cursor:pointer;border:2px solid ${currentPattern === p.id ? '#fff' : 'var(--border)'};overflow:hidden;position:relative;background:${currentColor};">
                <div style="position:absolute;inset:0;${buildPatternStyle(p.id)}opacity:0.4;"></div>
                <span style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:10px;color:#ccc;">${p.l}</span>
              </div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--text-dim);font-size:11px;">Bg:</span>
            <input type="color" id="pattern-wheel" value="${currentColor}" style="width:36px;height:36px;border:none;background:none;cursor:pointer;padding:0;" />
            <input type="text" id="pattern-hex" value="${currentColor}" class="input" style="flex:1;" />
          </div>
        </div>

        <!-- Image Section -->
        <div id="sec-image" style="display:${currentType === 'image' ? 'block' : 'none'};margin-bottom:16px;">
          <div id="img-preview-wrap" style="position:relative;width:100%;height:140px;background:#1a1a1a;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px;cursor:grab;">
            ${currentImageUrl
              ? `<img id="img-preview" src="${currentImageUrl}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform:translate(${currentImagePos.x - 50}%, ${currentImagePos.y - 50}%) scale(${currentImagePos.zoom});transform-origin:center;" />`
              : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:13px;">Noch kein Foto</div>`}
          </div>
          <input id="header-file" type="file" accept="image/*" style="display:none;" />
          <button id="btn-upload" class="btn btn-block" style="margin-bottom:10px;">📷 Foto ausw\u00e4hlen</button>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--text-dim);font-size:11px;white-space:nowrap;">Zoom:</span>
            <input type="range" id="zoom-slider" min="1" max="3" step="0.05" value="${currentImagePos.zoom}" style="flex:1;accent-color:#fff;" />
            <span id="zoom-val" style="color:var(--text-dim);font-size:11px;white-space:nowrap;">${Math.round(currentImagePos.zoom * 100)}%</span>
          </div>
        </div>

        <button id="btn-save-profile" class="btn btn-primary btn-block">Speichern</button>
        <p id="save-msg" style="color:var(--text-mute);font-size:13px;text-align:center;margin-top:10px;min-height:18px;"></p>
      </div>
    </div>`)

  // ── Close ──
  const close = () => { _closeModal() }
  document.querySelector('#edit-close').onclick = close
  document.querySelector('#edit-overlay').onclick = close

  // ── Header Type ──
  document.querySelectorAll('[data-htype]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.htype
      document.querySelectorAll('[data-htype]').forEach(b => b.classList.toggle('active', b === btn))
      document.querySelector('#sec-color').style.display = currentType === 'color' ? 'block' : 'none'
      document.querySelector('#sec-pattern').style.display = currentType === 'pattern' ? 'block' : 'none'
      document.querySelector('#sec-image').style.display = currentType === 'image' ? 'block' : 'none'
    })
  })

  // ── Color Tiles ──
  document.querySelectorAll('.color-tile').forEach(el => {
    el.addEventListener('click', () => {
      currentColor = el.dataset.color
      document.querySelector('#hex-input').value = currentColor
      document.querySelector('#color-wheel').value = currentColor
      document.querySelector('#hex-preview').style.background = currentColor
      document.querySelectorAll('.color-tile').forEach(x => x.style.borderColor = 'transparent')
      el.style.borderColor = '#fff'
    })
  })

  const hexInput = document.querySelector('#hex-input')
  const colorWheel = document.querySelector('#color-wheel')
  hexInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) {
      currentColor = hexInput.value; colorWheel.value = currentColor
      document.querySelector('#hex-preview').style.background = currentColor
    }
  })
  colorWheel.addEventListener('input', () => {
    currentColor = colorWheel.value; hexInput.value = currentColor
    document.querySelector('#hex-preview').style.background = currentColor
  })

  // ── Pattern Tiles ──
  document.querySelectorAll('.pattern-tile').forEach(el => {
    el.addEventListener('click', () => {
      currentPattern = el.dataset.pattern
      document.querySelectorAll('.pattern-tile').forEach(x => x.style.borderColor = 'var(--border)')
      el.style.borderColor = '#fff'
    })
  })

  const patternWheel = document.querySelector('#pattern-wheel')
  const patternHex = document.querySelector('#pattern-hex')
  patternWheel.addEventListener('input', () => { currentColor = patternWheel.value; patternHex.value = currentColor })
  patternHex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(patternHex.value)) { currentColor = patternHex.value; patternWheel.value = currentColor }
  })

  // ── Image Upload ──
  document.querySelector('#btn-upload').addEventListener('click', () => document.querySelector('#header-file').click())
  document.querySelector('#header-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const btn = document.querySelector('#btn-upload'); btn.textContent = 'Hochladen...'
    const { url, error } = await uploadHeaderImage(file, profile.id)
    if (error) { btn.textContent = '❌ Fehler'; return }
    currentImageUrl = url
    document.querySelector('#img-preview-wrap').innerHTML = `<img id="img-preview" src="${currentImageUrl}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform-origin:center;" />`
    btn.textContent = '✅ Hochgeladen'
    _setupImgDrag(currentImagePos)
  })

  // ── Zoom Slider ──
  document.querySelector('#zoom-slider').addEventListener('input', e => {
    currentImagePos.zoom = parseFloat(e.target.value)
    document.querySelector('#zoom-val').textContent = Math.round(currentImagePos.zoom * 100) + '%'
    const img = document.querySelector('#img-preview')
    if (img) img.style.transform = `translate(${currentImagePos.x - 50}%, ${currentImagePos.y - 50}%) scale(${currentImagePos.zoom})`
  })

  _setupImgDrag(currentImagePos)

  // ── Save ──
  document.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const msg = document.querySelector('#save-msg'); msg.textContent = 'Speichern...'
    const { error } = await updateProfile(profile.id, {
      display_name: document.querySelector('#edit-displayname').value.trim() || null,
      bio: document.querySelector('#edit-bio').value.trim() || null,
      profile_link: document.querySelector('#edit-link').value.trim() || null,
      playlist_url: document.querySelector('#edit-playlist').value.trim() || null,
      header_type: currentType,
      header_color: currentColor,
      header_pattern: currentType === 'pattern' ? currentPattern : null,
      header_image_url: currentType === 'image' ? currentImageUrl : null,
      header_image_position: currentType === 'image' ? currentImagePos : null,
    })
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => { _closeModal(); navigate('/u/' + profile.username) }, 800)
  })
}

// ─────────────────────────────────────────────────────────────────
//  Privacy Modal
// ─────────────────────────────────────────────────────────────────

function openPrivacyModal(profile) {
  const profilePrivacy = profile.profile_privacy || 'public'

  _openModal(`
    <div class="modal-overlay show" id="pv-overlay"></div>
    <div class="modal show" role="dialog" aria-label="Privacy">
      <div class="modal-head">
        <span class="modal-title">Profil-Sichtbarkeit</span>
        <button class="icon-btn icon-btn-sm" id="pv-close">${iconSvg('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-mute);font-size:13px;margin-bottom:16px;">Wer dein Profil und deine Posts sehen darf.</p>
        <div class="seg" id="pv-seg">
          <button class="seg-btn ${profilePrivacy === 'public' ? 'active' : ''}" data-pv="public">🌍 \u00d6ffentlich</button>
          <button class="seg-btn ${profilePrivacy === 'followers' ? 'active' : ''}" data-pv="followers">👥 Follower</button>
          <button class="seg-btn ${profilePrivacy === 'private' ? 'active' : ''}" data-pv="private">🔒 Privat</button>
        </div>
        <p style="color:var(--text-dim);font-size:11px;margin-top:12px;">\u00d6ffentlich = alle sehen dein Profil · Follower = nur wer dir folgt · Privat = nur du</p>
      </div>
      <div class="modal-foot">
        <button class="btn" id="pv-cancel">Abbrechen</button>
        <button class="btn btn-primary" id="pv-save">Speichern</button>
      </div>
    </div>`)

  let currentPv = profilePrivacy

  document.querySelector('#pv-close').onclick = _closeModal
  document.querySelector('#pv-overlay').onclick = _closeModal
  document.querySelector('#pv-cancel').onclick = _closeModal

  document.querySelectorAll('#pv-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPv = btn.dataset.pv
      document.querySelectorAll('#pv-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn))
    })
  })

  document.querySelector('#pv-save').addEventListener('click', async () => {
    const btn = document.querySelector('#pv-save')
    btn.disabled = true; btn.textContent = 'Speichern...'
    const { error } = await updateProfile(profile.id, { profile_privacy: currentPv })
    if (error) { console.error('privacy update', error); btn.disabled = false; btn.textContent = 'Speichern'; return }
    _closeModal()
  })
}

// ─────────────────────────────────────────────────────────────────
//  Navigation Modal
// ─────────────────────────────────────────────────────────────────

function openNavModal() {
  const navPref = getNavPref()

  _openModal(`
    <div class="modal-overlay show" id="nav-overlay"></div>
    <div class="modal show" role="dialog" aria-label="Navigation">
      <div class="modal-head">
        <span class="modal-title">Navigation</span>
        <button class="icon-btn icon-btn-sm" id="nav-close">${iconSvg('x', 16)}</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-mute);font-size:13px;margin-bottom:16px;">Wo soll die Hauptnavigation erscheinen?</p>
        <div class="seg" id="nav-seg">
          <button class="seg-btn ${navPref === 'auto' ? 'active' : ''}" data-nav="auto">Auto</button>
          <button class="seg-btn ${navPref === 'sidebar' ? 'active' : ''}" data-nav="sidebar">Sidebar</button>
          <button class="seg-btn ${navPref === 'bottom' ? 'active' : ''}" data-nav="bottom">Bottom</button>
        </div>
        <p style="color:var(--text-dim);font-size:11px;margin-top:12px;">Auto = Sidebar auf Desktop, Bottom auf Mobil · Sidebar = immer seitlich · Bottom = immer unten</p>
      </div>
      <div class="modal-foot">
        <button class="btn" id="nav-cancel">Abbrechen</button>
        <button class="btn btn-primary" id="nav-save">Speichern</button>
      </div>
    </div>`)

  let currentNav = navPref

  document.querySelector('#nav-close').onclick = _closeModal
  document.querySelector('#nav-overlay').onclick = _closeModal
  document.querySelector('#nav-cancel').onclick = _closeModal

  document.querySelectorAll('#nav-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentNav = btn.dataset.nav
      document.querySelectorAll('#nav-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn))
    })
  })

  document.querySelector('#nav-save').addEventListener('click', () => {
    setNavPref(currentNav)
    _closeModal()
  })
}

// ─────────────────────────────────────────────────────────────────
//  Blocks Modal
// ─────────────────────────────────────────────────────────────────

export async function openBlocksModal(userId) {
  const host = document.querySelector('#settings-modals-host')
  const blocks = await getMyBlocks(userId)

  let rows = '<p style="color:var(--text-mute);font-size:13px;padding:16px;">Niemand blockiert.</p>'
  if (blocks.length) {
    rows = blocks.map(b => {
      const p = b.profile
      return `
        <div class="settings-row" style="cursor:default;">
          <span class="icon">${iconSvg('user', 18)}</span>
          <div class="body">
            <div class="title">@${escapeHtml(p.username)}</div>
            ${p.display_name ? `<div class="desc">${escapeHtml(p.display_name)}</div>` : ''}
          </div>
          <button class="btn" data-unblock="${p.id}">Entblocken</button>
        </div>`
    }).join('')
  }

  host.innerHTML = `
    <div class="modal-overlay show" id="blk-overlay"></div>
    <div class="modal show" role="dialog" aria-label="Blockierte Nutzer">
      <div class="modal-head">
        <span class="modal-title">Blockierte Nutzer</span>
        <button class="icon-btn icon-btn-sm" id="blk-close">${iconSvg('x', 16)}</button>
      </div>
      <div class="modal-body" style="padding:8px;">
        <div class="settings-list">${rows}</div>
      </div>
    </div>`

  document.body.classList.add('no-scroll')
  document.querySelector('#blk-close').onclick = _closeModal
  document.querySelector('#blk-overlay').onclick = _closeModal

  host.querySelectorAll('[data-unblock]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true
      const id = btn.dataset.unblock
      const { error } = await unblockUser(userId, id)
      if (error) { console.error(error); btn.disabled = false; return }
      _closeModal()
      openBlocksModal(userId)
    }
  })
}

// ─────────────────────────────────────────────────────────────────
//  Image Drag (für Edit Modal)
// ─────────────────────────────────────────────────────────────────

function _setupImgDrag(pos) {
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
