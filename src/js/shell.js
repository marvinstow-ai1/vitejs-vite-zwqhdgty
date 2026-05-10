import { iconSvg } from './utils.js'

// ─── Nav preference ───────────────────────────────────────────────────────────

export function getNavPref() {
  return localStorage.getItem('nav_pref') || 'auto'
}

export function setNavPref(v) {
  localStorage.setItem('nav_pref', v)
  applyNavPref()
}

export function applyNavPref() {
  document.body.dataset.nav = getNavPref()
}

// ─── Global Header ────────────────────────────────────────────────────────────

// Scroll-Listener-Referenz für Cleanup beim Seitenwechsel
let _scrollListener = null

/**
 * Registriert einen Scroll-Listener der beim nächsten updateGlobalHeader-Aufruf
 * automatisch entfernt wird.
 * @param {function} fn
 */
export function registerHeaderScrollListener(fn) {
  if (_scrollListener) {
    window.removeEventListener('scroll', _scrollListener)
  }
  _scrollListener = fn
  window.addEventListener('scroll', fn, { passive: true })
}

/**
 * Aktualisiert den persistenten globalen Header (bereits im DOM via renderShell()).
 *
 * tone: 'light' | 'dark' | 'auto'
 *   - 'light' → dunkle Schrift (Profil mit hellem Header)
 *   - 'dark'  → helle Schrift, fast transparent (Tunnel-Erlebnis)
 *   - 'auto'  → Standard (Feed, Explore, Settings)
 *
 * @param {{
 *   tone?: string,
 *   title?: string|null,
 *   showBack?: boolean,
 *   showSearch?: boolean,
 *   showNotif?: boolean,
 *   showCompose?: boolean,
 *   profileActions?: string|null,
 *   profile?: object|null,
 * }} opts
 */
export function updateGlobalHeader(opts = {}) {
  const {
    tone = 'auto',
    title = null,
    showBack = false,
    showSearch = false,
    showNotif = false,
    showCompose = false,
    profileActions = null,
    profile = null,
  } = opts

  const header = document.querySelector('#global-header')
  if (!header) return

  // Vorherigen Scroll-Listener entfernen (Cleanup beim Seitenwechsel)
  if (_scrollListener) {
    window.removeEventListener('scroll', _scrollListener)
    _scrollListener = null
  }

  // Tone
  header.className = `global-header global-header--${tone}`
  header.dataset.tone = tone

  // Left: Back or Brand + optional title
  const left = header.querySelector('.gh-left')
  left.innerHTML = showBack
    ? `<button class="gh-btn" id="gh-back" aria-label="Zurück">${iconSvg('chevL', 18)}</button>`
    : `<button class="gh-brand" id="gh-brand" aria-label="Home">
         <span class="gh-brand-text">Marvin's Place</span>
       </button>`
  if (title) {
    left.innerHTML += `<span class="gh-title">${title}</span>`
  }

  // Center: Search
  const searchWrap = document.getElementById('gh-search-wrap')
  if (searchWrap) searchWrap.style.display = showSearch ? '' : 'none'

  // Right: Compose, Notif, Profile Actions, Avatar
  const composeBtn = document.getElementById('gh-compose')
  if (composeBtn) composeBtn.style.display = showCompose ? '' : 'none'

  const notifWrap = document.getElementById('gh-notif-wrap')
  if (notifWrap) notifWrap.style.display = showNotif ? '' : 'none'

  const profileActionsEl = document.getElementById('gh-profile-actions')
  if (profileActionsEl) {
    if (profileActions) {
      profileActionsEl.style.display = 'flex'
      profileActionsEl.innerHTML = profileActions
    } else {
      profileActionsEl.style.display = 'none'
      profileActionsEl.innerHTML = ''
    }
  }

  // Avatar immer sichtbar
  const avatarBtn = document.getElementById('gh-profile')
  if (avatarBtn) avatarBtn.style.display = ''

  // Wire back button (history.back ist immer gleich)
  header.querySelector('#gh-back')?.addEventListener('click', () => history.back())

  // Hintergrundbild aktualisieren, wenn ein Profil übergeben wurde
  updateGlobalHeaderBg(profile)
}

/**
 * Aktualisiert das Hintergrundbild im Global Header basierend auf dem Profil.
 * @param {object|null} profile
 */
export function updateGlobalHeaderBg(profile) {
  const bg = document.querySelector('#gh-bg')
  const img = document.querySelector('#gh-bg-img')
  if (!bg || !img) return

  if (profile?.header_image_url && profile?.header_type === 'image') {
    bg.style.display = 'block'
    img.src = profile.header_image_url
  } else {
    bg.style.display = 'none'
  }
}

/**
 * Rendert den globalen Header (für Standalone-Seiten ohne Shell, z.B. board.page.js).
 * Entfernt den bestehenden Header und erstellt einen neuen.
 *
 * @param {object} profile
 * @param {{ navigate: function }} callbacks
 * @param {{ tone?: string, title?: string, showBack?: boolean }} opts
 */
export function renderGlobalHeader(profile, callbacks, opts = {}) {
  const { tone = 'auto', title = null, showBack = false } = opts
  const { navigate } = callbacks

  // Vorherigen Scroll-Listener entfernen
  if (_scrollListener) {
    window.removeEventListener('scroll', _scrollListener)
    _scrollListener = null
  }

  // Bestehenden Header entfernen
  document.querySelector('#global-header')?.remove()

  const el = document.createElement('header')
  el.id = 'global-header'
  el.className = `global-header global-header--${tone}`
  el.dataset.tone = tone

  const u = profile?.username

  el.innerHTML = `
    <div class="gh-left">
      ${showBack
        ? `<button class="gh-btn" id="gh-back" aria-label="Zurück">${iconSvg('chevL', 18)}</button>`
        : `<button class="gh-brand" id="gh-brand" aria-label="Home">
             <span class="gh-brand-text">Marvin's Place</span>
           </button>`
      }
      ${title ? `<span class="gh-title">${title}</span>` : ''}
    </div>
    <div class="gh-center"></div>
    <div class="gh-right">
      ${u ? `
        <button class="gh-avatar-btn" id="gh-profile" aria-label="Profil">
          <span class="gh-avatar-letter">${(profile.display_name || u)[0].toUpperCase()}</span>
        </button>
      ` : ''}
    </div>
  `

  document.body.prepend(el)

  el.querySelector('#gh-back')?.addEventListener('click', () => history.back())
  el.querySelector('#gh-brand')?.addEventListener('click', () => navigate('/'))
  el.querySelector('#gh-profile')?.addEventListener('click', () => { if (u) navigate('/u/' + u) })

  return el
}

/**
 * Aktualisiert den Notification-Badge im globalen Header.
 * @param {number} count
 */
export function refreshGlobalHeaderBadge(count = 0) {
  const badge = document.querySelector('#gh-notif-badge')
  if (!badge) return
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}

/**
 * Setzt den Tone des globalen Headers (z.B. nach Scroll-Event auf Profilseite).
 * @param {'light'|'dark'|'auto'} tone
 */
export function setGlobalHeaderTone(tone) {
  const el = document.querySelector('#global-header')
  if (!el) return
  el.className = `global-header global-header--${tone}`
  el.dataset.tone = tone
}

// ─── Unread badge ─────────────────────────────────────────────────────────────

/**
 * Aktualisiert den Notification-Badge in Sidebar und Bottombar.
 * @param {number} count
 */
export function refreshUnreadBadge(count = 0) {
  const sb = document.querySelector('#nav-badge-notif')
  const bb = document.querySelector('#nav-dot-notif')
  if (sb) {
    if (count > 0) {
      sb.textContent = count > 99 ? '99+' : String(count)
      sb.classList.remove('hidden')
    } else {
      sb.classList.add('hidden')
    }
  }
  if (bb) bb.classList.toggle('show', count > 0)
}

// ─── Shell HTML ───────────────────────────────────────────────────────────────

/**
 * Gibt das HTML für Sidebar + Bottombar zurück.
 * @param {string} active — aktiver Nav-Key
 * @param {object|null} profile
 */
export function shellHtml(active, profile) {
  const u = profile?.username
  const items = [
    { key: 'home',    label: 'Feed',    icon: 'home',    href: '/' },
    { key: 'explore', label: 'Explore', icon: 'compass', href: '/explore' },
    { key: 'post',    label: 'Posten',  icon: 'plus',    fab: true },
    { key: 'notif',   label: 'Inbox',   icon: 'bell',    badge: true },
    { key: 'profile', label: 'Profil',  icon: 'user',    href: u ? `/u/${u}` : '/' },
  ]

  const sidebarItems = items.map(it => {
    if (it.fab) {
      return `<button class="nav-item" data-nav-key="${it.key}" style="background:rgba(255,255,255,.08);">${iconSvg(it.icon)}<span>${it.label}</span></button>`
    }
    const cls = active === it.key ? 'nav-item active' : 'nav-item'
    const badge = it.badge
      ? `<span class="nav-badge hidden" id="nav-badge-${it.key}"></span>`
      : ''
    return `<button class="${cls}" data-nav-key="${it.key}">${iconSvg(it.icon)}<span>${it.label}</span>${badge}</button>`
  }).join('')

  const bottomItems = items.map(it => {
    const cls = ['bottombar-btn']
    if (active === it.key) cls.push('active')
    if (it.fab) cls.push('fab')
    const dot = it.badge
      ? `<span class="nav-dot" id="nav-dot-${it.key}"></span>`
      : ''
    return `<button class="${cls.join(' ')}" data-nav-key="${it.key}" aria-label="${it.label}">${iconSvg(it.icon, 22)}${dot}</button>`
  }).join('')

  return `
    <aside class="sidebar">
      <div class="sidebar-brand" data-nav-key="brand">Marvin's Place</div>
      ${sidebarItems}
      <div class="sidebar-spacer"></div>
      <button class="nav-item" data-nav-key="settings">${iconSvg('settings')}<span>Einstellungen</span></button>
    </aside>
    <nav class="bottombar" aria-label="Navigation">${bottomItems}</nav>
  `
}

// ─── Shell wiring ─────────────────────────────────────────────────────────────

let _navListeners = []

/**
 * Verdrahtet alle Nav-Buttons in Shell + Global Header.
 * Entfernt vorherige Listener, sodass mehrfacher Aufruf sicher ist.
 * Benötigt navigate() und openComposerModal() als Callbacks,
 * um zirkuläre Imports zu vermeiden.
 *
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, toggleNotif: function }} callbacks
 */
export function wireShellNav(profile, { navigate, openComposer, toggleNotif }) {
  const u = profile?.username

  // Alte Listener entfernen (wichtig bei persistentem DOM)
  _navListeners.forEach(({ el, fn }) => el.removeEventListener('click', fn))
  _navListeners = []

  document.querySelectorAll('[data-nav-key]').forEach(el => {
    const key = el.dataset.navKey
    const fn = () => {
      if (key === 'home' || key === 'brand') navigate('/')
      else if (key === 'explore') navigate('/explore')
      else if (key === 'profile') { if (u) navigate('/u/' + u) }
      else if (key === 'settings') navigate('/settings')
      else if (key === 'post') openComposer(profile)
      else if (key === 'notif') toggleNotif(profile)
    }
    el.addEventListener('click', fn)
    _navListeners.push({ el, fn })
  })

  // ── Global Header Buttons verdrahten ───────────────────────────────────────

  const wireHeaderBtn = (sel, fn) => {
    const el = document.querySelector(sel)
    if (el) {
      el.addEventListener('click', fn)
      _navListeners.push({ el, fn })
    }
  }

  wireHeaderBtn('#gh-brand', () => navigate('/'))
  wireHeaderBtn('#gh-profile', () => { if (u) navigate('/u/' + u) })
  wireHeaderBtn('#gh-compose', () => openComposer(profile))
  wireHeaderBtn('#gh-notif', () => toggleNotif(profile))
}

// ─── Shell Rendering (einmalig) ───────────────────────────────────────────────

let _shellRendered = false

/**
 * Rendert die Shell (Global Header + Sidebar + Bottombar + <main>) einmalig.
 * Wird nur ausgeführt, wenn noch keine .app-shell im DOM existiert.
 * @param {string} activeKey — aktiver Nav-Key (z.B. 'home')
 * @param {object|null} profile
 */
export function renderShell(activeKey, profile) {
  if (_shellRendered && document.querySelector('.app-shell')) return
  _shellRendered = true

  const u = profile?.username
  const initial = u ? (profile.display_name || u)[0].toUpperCase() : 'M'

  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      <!-- Persistenter Global Header -->
      <header id="global-header" class="global-header global-header--auto">
        <div id="gh-bg" class="gh-background" style="display:none;">
          <img id="gh-bg-img" src="" alt="" style="width:100%;height:100%;object-fit:cover;">
          <div class="gh-bg-fade"></div>
        </div>
        <div class="gh-left">
          <button class="gh-brand" id="gh-brand" aria-label="Home">
            <span class="gh-brand-text">Marvin's Place</span>
          </button>
          <span class="gh-title" id="gh-title" style="display:none;"></span>
        </div>
        <div class="gh-center">
          <div class="gh-search-wrap" id="gh-search-wrap" style="display:none;">
            <span class="gh-search-icon">${iconSvg('search', 15)}</span>
            <input id="gh-search-input" class="gh-search-input" type="text" placeholder="Suchen…" autocomplete="off" />
            <div id="gh-search-dropdown" class="gh-search-dropdown" style="display:none;"></div>
          </div>
        </div>
        <div class="gh-right" id="gh-right">
          <button class="gh-btn gh-compose" id="gh-compose" style="display:none;" aria-label="Posten">${iconSvg('plus', 18)}</button>
          <div id="gh-notif-wrap" style="position:relative;display:none;">
            <button class="gh-btn" id="gh-notif" aria-label="Benachrichtigungen">
              ${iconSvg('bell', 18)}
              <span id="gh-notif-badge" class="gh-notif-badge hidden"></span>
            </button>
          </div>
          <div id="gh-profile-actions" style="display:none;align-items:center;gap:6px;"></div>
          <button class="gh-avatar-btn" id="gh-profile" aria-label="Profil" style="display:none;">
            <span class="gh-avatar-letter" id="gh-avatar-letter">${initial}</span>
          </button>
        </div>
      </header>
      ${shellHtml(activeKey, profile)}
      <main class="app-main" id="app-main"></main>
    </div>
  `
}

/**
 * Ersetzt nur den Inhalt von <main id="app-main">.
 * Die Shell (Header + Sidebar + Bottombar) bleibt erhalten.
 * @param {string} html
 */
export function updateShellContent(html) {
  const main = document.querySelector('#app-main')
  if (!main) return

  // Transition-Klasse setzen (sofortiger visueller Fade-out)
  main.classList.add('app-main-transitioning')

  // DOM SOFORT setzen (kein setTimeout!)
  main.innerHTML = html

  // Nach einem Frame die Transition rückgängig machen → Fade-in
  requestAnimationFrame(() => {
    main.classList.remove('app-main-transitioning')
  })
}

/**
 * Aktualisiert die active-Klasse in der Navigation.
 * @param {string} activeKey
 */
export function updateActiveNav(activeKey) {
  document.querySelectorAll('[data-nav-key]').forEach(el => {
    el.classList.toggle('active', el.dataset.navKey === activeKey)
  })
}
