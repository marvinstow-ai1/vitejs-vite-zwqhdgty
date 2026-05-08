import '../css/main.css'
import { applyNavPref } from './shell.js'
import { navigate, handleRoute, registerHandlers } from './router.js'
import { getSession } from './services/auth.service.js'
import { getProfileById } from './services/profiles.service.js'
import { showLogin, showUsernameSetup } from './pages/auth.page.js'
import { showFeed, openComposerModal, openStoryViewer, setupRealtimeLikes } from './pages/feed.page.js'
import { showProfilePage } from './pages/profile.page.js'
import { showExplorePage } from './pages/explore.page.js'
import { showSettingsPage } from './pages/settings.page.js'
import { showBoardPage } from './pages/board.page.js'
import { openRepostModal } from './pages/feed.page.js'
import { showLanding } from './pages/landing.page.js'
import { showImpressum, showDatenschutz, showNutzungsbedingungen } from './pages/legal.page.js'

// ─── App-level state ──────────────────────────────────────────────────────────

let currentProfile = null
let realtimeChannel = null
let notifChannel = null

// ─── Nav callbacks (passed to pages to avoid circular imports) ────────────────

function getNavCallbacks() {
  return {
    navigate,
    openComposer: (profile) => openComposerModal(profile, navigate),
    toggleNotif: (_profile) => {
      // Feed-page handles its own notif panel; on other pages navigate home
      const dd = document.querySelector('#notif-dropdown')
      if (dd) {
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block'
      } else {
        navigate('/')
      }
    },
    onNotifChannelReady: (ch) => { notifChannel = ch },
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const session = await getSession()
  if (!session) {
    // Show atmospheric landing for guests; CTA leads to the login/signup page.
    showLanding(() => showLogin(init))
    return
  }

  const profile = await getProfileById(session.user.id)
  if (!profile?.username) {
    showUsernameSetup(session.user.id, init)
    return
  }

  currentProfile = profile
  await showFeed(profile, {
    ...getNavCallbacks(),
    onNotifChannelReady: (ch) => { notifChannel = ch },
  })

  setupRealtimeLikes(profile.id, (ch) => { realtimeChannel = ch })
}

// ─── Route handlers ───────────────────────────────────────────────────────────

registerHandlers({
  init,

  async profile(username) {
    await showProfilePage(username, { navigate })
  },

  async explore() {
    if (!currentProfile) {
      const session = await getSession()
      if (!session) { showLanding(() => showLogin(init)); return }
      currentProfile = await getProfileById(session.user.id)
      if (!currentProfile?.username) { init(); return }
    }
    showExplorePage(currentProfile, getNavCallbacks())
  },

  async settings() {
    const session = await getSession()
    if (!session) { showLanding(() => showLogin(init)); return }
    if (!currentProfile) {
      currentProfile = await getProfileById(session.user.id)
    }
    if (!currentProfile) { showLanding(() => showLogin(init)); return }
    await showSettingsPage(currentProfile, session, {
      ...getNavCallbacks(),
      realtimeChannel,
      notifChannel,
    })
  },

  async board(username, boardId) {
    await showBoardPage(username, boardId, {
      navigate,
      openRepostModal: (boards, cb) => openRepostModal(boards, cb),
    })
  },

  messages() {
    const app = document.querySelector('#app')
    app.innerHTML = `<div style="background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;">
      <p style="color:#444;font-size:14px;">Nachrichten — bald verfügbar.</p>
      <button onclick="history.back()" style="padding:8px 20px;background:transparent;color:#555;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:13px;">Zurück</button>
    </div>`
  },

  legal(page) {
    if (page === 'impressum') showImpressum()
    else if (page === 'datenschutz') showDatenschutz()
    else if (page === 'nutzungsbedingungen') showNutzungsbedingungen()
  },
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────

applyNavPref()
handleRoute()
