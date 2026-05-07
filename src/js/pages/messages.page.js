import { shellHtml, wireShellNav, applyNavPref, refreshUnreadBadge } from '../shell.js'
import { getUnreadCount } from '../services/notifications.service.js'

/**
 * Placeholder page for direct messages.
 * Real DMs are deferred (Phase 6 decision: placeholder route only).
 * Schema, realtime, read-state and storage-RLS for messages all need a
 * dedicated phase before this becomes a real surface.
 *
 * @param {object} profile
 * @param {{ navigate: function, openComposer: function, toggleNotif: function }} nav
 */
export function showMessagesPage(profile, nav) {
  applyNavPref()
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${shellHtml('messages', profile)}
      <main class="app-main">
        <header class="topbar">
          <span style="font-size:16px;font-weight:600;">Nachrichten</span>
        </header>
        <div style="max-width:640px;margin:0 auto;padding:40px 24px;text-align:center;color:var(--text-mute);font-size:14px;line-height:1.5;">
          <div style="font-size:32px;margin-bottom:12px;">✉︎</div>
          <div style="font-weight:600;color:var(--text);margin-bottom:6px;">Direktnachrichten kommen später.</div>
          <div>Wir bauen erst die Sichtbarkeits-Regeln und Follow-Requests sauber, bevor DMs dazukommen.</div>
        </div>
      </main>
    </div>`

  wireShellNav(profile, nav)
  getUnreadCount(profile.id)
    .then(count => refreshUnreadBadge(count))
    .catch(() => {})
}
