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

/**
 * Verdrahtet alle Nav-Buttons in Shell.
 * Benötigt navigate() und openComposerModal() als Callbacks,
 * um zirkuläre Imports zu vermeiden.
 *
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, toggleNotif: function }} callbacks
 */
export function wireShellNav(profile, { navigate, openComposer, toggleNotif }) {
  const u = profile?.username
  document.querySelectorAll('[data-nav-key]').forEach(el => {
    const key = el.dataset.navKey
    el.addEventListener('click', () => {
      if (key === 'home' || key === 'brand') navigate('/')
      else if (key === 'explore') navigate('/explore')
      else if (key === 'profile') { if (u) navigate('/u/' + u) }
      else if (key === 'settings') navigate('/settings')
      else if (key === 'post') openComposer(profile)
      else if (key === 'notif') toggleNotif(profile)
    })
  })
}
