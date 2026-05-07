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
  if (!session) { showLogin(init); return }

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
    // Ensure we have a profile for the shell
    if (!currentProfile) {
      const session = await getSession()
      if (!session) { showLogin(init); return }
      currentProfile = await getProfileById(session.user.id)
      if (!currentProfile?.username) { init(); return }
    }
    showExplorePage(currentProfile, getNavCallbacks())
  },

  async settings() {
    const session = await getSession()
    if (!session) { showLogin(init); return }
    if (!currentProfile) {
      currentProfile = await getProfileById(session.user.id)
    }
    if (!currentProfile) { showLogin(init); return }
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
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────

applyNavPref()
handleRoute()
