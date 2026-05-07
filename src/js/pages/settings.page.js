import { supabase } from '../supabase.js'
import { shellHtml, wireShellNav, applyNavPref, getNavPref, setNavPref, refreshUnreadBadge } from '../shell.js'
import { iconSvg, escapeHtml } from '../utils.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { updateProfile } from '../services/profiles.service.js'
import { signOut } from '../services/auth.service.js'

/**
 * Zeigt die Einstellungs-Seite.
 * @param {object} profile
 * @param {object} session
 * @param {{ navigate: function, openComposer: function, toggleNotif: function, realtimeChannel: object|null, notifChannel: object|null }} ctx
 */
export async function showSettingsPage(profile, session, ctx) {
  const { navigate, openComposer, toggleNotif } = ctx
  applyNavPref()

  const navPref = getNavPref()
  const profilePrivacy = profile.profile_privacy || 'public'

  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${shellHtml('settings', profile)}
      <main class="app-main">
        <header class="topbar">
          <button class="icon-btn icon-btn-sm" id="set-back" aria-label="Zurück">${iconSvg('chevL', 16)}</button>
          <span style="font-size:16px;font-weight:600;">Einstellungen</span>
        </header>

        <div class="settings-wrap">

          <section class="settings-section">
            <h2>Account</h2>
            <div class="settings-list">
              <div class="settings-row" style="cursor:default;">
                <span class="icon">${iconSvg('user', 18)}</span>
                <div class="body">
                  <div class="title">@${escapeHtml(profile.username)}</div>
                  <div class="desc">${escapeHtml(session.user.email || '')}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h2>Profil</h2>
            <div class="settings-list">
              <button class="settings-row" id="set-edit-profile">
                <span class="icon">${iconSvg('edit', 18)}</span>
                <div class="body">
                  <div class="title">Profil bearbeiten</div>
                  <div class="desc">Display-Name, Bio, Header, Links</div>
                </div>
                <span class="chev">${iconSvg('chevR', 14)}</span>
              </button>
            </div>
          </section>

          <section class="settings-section">
            <h2>Privacy</h2>
            <div class="settings-list">
              <div class="settings-row" style="cursor:default;flex-direction:column;align-items:stretch;">
                <div style="display:flex;align-items:center;gap:12px;width:100%;">
                  <span class="icon">${iconSvg('lock', 18)}</span>
                  <div class="body">
                    <div class="title">Profil-Sichtbarkeit</div>
                    <div class="desc">Wer dein Profil und deine Posts sehen darf.</div>
                  </div>
                </div>
                <div class="seg" style="margin-top:12px;" id="privacy-seg">
                  <button class="seg-btn ${profilePrivacy === 'public' ? 'active' : ''}" data-pv="public">🌍 Öffentlich</button>
                  <button class="seg-btn ${profilePrivacy === 'followers' ? 'active' : ''}" data-pv="followers">👥 Follower</button>
                  <button class="seg-btn ${profilePrivacy === 'private' ? 'active' : ''}" data-pv="private">🔒 Privat</button>
                </div>
              </div>
              <button class="settings-row" id="set-blocks">
                <span class="icon">${iconSvg('ban', 18)}</span>
                <div class="body">
                  <div class="title">Blockierte Nutzer</div>
                  <div class="desc">Verwalte, wen du blockiert hast.</div>
                </div>
                <span class="chev">${iconSvg('chevR', 14)}</span>
              </button>
            </div>
          </section>

          <section class="settings-section">
            <h2>Layout</h2>
            <div class="settings-list">
              <div class="settings-row" style="cursor:default;flex-direction:column;align-items:stretch;">
                <div style="display:flex;align-items:center;gap:12px;width:100%;">
                  <span class="icon">${iconSvg('layout', 18)}</span>
                  <div class="body">
                    <div class="title">Navigation</div>
                    <div class="desc">Wo soll die Hauptnavigation erscheinen?</div>
                  </div>
                </div>
                <div class="seg" style="margin-top:12px;" id="nav-seg">
                  <button class="seg-btn ${navPref === 'auto' ? 'active' : ''}" data-nav="auto">Auto</button>
                  <button class="seg-btn ${navPref === 'sidebar' ? 'active' : ''}" data-nav="sidebar">Sidebar</button>
                  <button class="seg-btn ${navPref === 'bottom' ? 'active' : ''}" data-nav="bottom">Bottom</button>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h2>Account</h2>
            <div class="settings-list">
              <button class="settings-row danger" id="set-logout">
                <span class="icon">${iconSvg('logOut', 18)}</span>
                <div class="body">
                  <div class="title">Ausloggen</div>
                </div>
              </button>
            </div>
          </section>

        </div>
      </main>
    </div>

    <div id="blocks-host"></div>
  `

  wireShellNav(profile, { navigate, openComposer, toggleNotif })
  getUnreadCount(profile.id).then(count => refreshUnreadBadge(count)).catch(() => {})

  document.querySelector('#set-back').onclick = () => navigate('/')
  document.querySelector('#set-edit-profile').onclick = () => navigate('/u/' + profile.username + '?edit=1')

  // Privacy
  document.querySelectorAll('#privacy-seg .seg-btn').forEach(btn => {
    btn.onclick = async () => {
      const v = btn.dataset.pv
      document.querySelectorAll('#privacy-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn))
      const { error } = await updateProfile(profile.id, { profile_privacy: v })
      if (error) console.error('privacy update', error)
    }
  })

  // Nav preference
  document.querySelectorAll('#nav-seg .seg-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#nav-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn))
      setNavPref(btn.dataset.nav)
    }
  })

  // Blocks
  document.querySelector('#set-blocks').onclick = () => openBlocksModal(profile.id)

  // Logout
  document.querySelector('#set-logout').onclick = async () => {
    if (ctx.realtimeChannel) { await supabase.removeChannel(ctx.realtimeChannel); ctx.realtimeChannel = null }
    if (ctx.notifChannel) { await supabase.removeChannel(ctx.notifChannel); ctx.notifChannel = null }
    await signOut()
    navigate('/')
  }
}

/**
 * Öffnet das Modal für blockierte Nutzer.
 * @param {string} userId
 */
export async function openBlocksModal(userId) {
  const host = document.querySelector('#blocks-host')
  const { data: blocks } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })

  let rows = '<p style="color:var(--text-mute);font-size:13px;padding:16px;">Niemand blockiert.</p>'
  if (blocks?.length) {
    const ids = blocks.map(b => b.blocked_id)
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', ids)
    const m = Object.fromEntries((profs || []).map(p => [p.id, p]))
    rows = blocks.map(b => {
      const p = m[b.blocked_id]; if (!p) return ''
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
  const close = () => { host.innerHTML = ''; document.body.classList.remove('no-scroll') }
  document.querySelector('#blk-close').onclick = close
  document.querySelector('#blk-overlay').onclick = close

  host.querySelectorAll('[data-unblock]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true
      const id = btn.dataset.unblock
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', id)
      if (error) { console.error(error); btn.disabled = false; return }
      close()
      openBlocksModal(userId)
    }
  })
}
