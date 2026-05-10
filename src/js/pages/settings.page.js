import { supabase } from '../supabase.js'
import { updateShellContent, updateActiveNav, wireShellNav, applyNavPref, getNavPref, setNavPref, refreshUnreadBadge, renderGlobalHeader, refreshGlobalHeaderBadge } from '../shell.js'
import { iconSvg, escapeHtml } from '../utils.js'
import { getUnreadCount } from '../services/notifications.service.js'
import { updateProfile, getMyBlocks } from '../services/profiles.service.js'
import { signOut } from '../services/auth.service.js'
import { unblockUser } from '../services/interactions.service.js'

/**
 * Zeigt die Einstellungs-Seite.
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

  updateActiveNav('settings')
  updateShellContent(`
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

    <div id="blocks-host"></div>`)

  // Globaler Header
  renderGlobalHeader(profile, { navigate, openComposer, toggleNotif }, {
    tone: 'auto',
    title: 'Einstellungen',
    showBack: true,
  })
  document.querySelector('#gh-back')?.addEventListener('click', () => navigate('/'))

  wireShellNav(profile, { navigate, openComposer, toggleNotif })

  getUnreadCount(profile.id).then(c => {
    refreshUnreadBadge(c)
    refreshGlobalHeaderBadge(c)
  }).catch(() => {})

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
  const close = () => { host.innerHTML = ''; document.body.classList.remove('no-scroll') }
  document.querySelector('#blk-close').onclick = close
  document.querySelector('#blk-overlay').onclick = close

  host.querySelectorAll('[data-unblock]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true
      const id = btn.dataset.unblock
      const { error } = await unblockUser(userId, id)
      if (error) { console.error(error); btn.disabled = false; return }
      close()
      openBlocksModal(userId)
    }
  })
}
