import { shellHtml, wireShellNav, applyNavPref } from '../shell.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { refreshUnreadBadge } from '../shell.js'

/**
 * Zeigt die Explore-Seite (aktuell Placeholder).
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, toggleNotif: function }} nav
 */
export function showExplorePage(profile, nav) {
  applyNavPref()
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${shellHtml('explore', profile)}
      <main class="app-main">
        <header class="topbar">
          <span style="font-size:16px;font-weight:600;">Explore</span>
        </header>
        <div style="max-width:640px;margin:0 auto;padding:40px 24px;text-align:center;color:var(--text-mute);font-size:14px;">
          Explore-Feed kommt bald — hier siehst du dann öffentliche Posts von Leuten, denen du noch nicht folgst.
        </div>
      </main>
    </div>`

  wireShellNav(profile, nav)
  getUnreadCount(profile.id)
    .then(count => refreshUnreadBadge(count))
    .catch(() => {})
}
