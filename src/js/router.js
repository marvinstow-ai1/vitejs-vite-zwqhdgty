// ─── Router ───────────────────────────────────────────────────────────────────
// Zentraler SPA-Router. Page-Handler werden von main.js registriert,
// um zirkuläre Imports zu vermeiden.

/** @type {{ [route: string]: function }} */
const handlers = {}

/**
 * Registriert Page-Handler.
 * @param {object} map — { init, feed, profile, board, explore, settings }
 */
export function registerHandlers(map) {
  Object.assign(handlers, map)
}

/**
 * Navigiert zu einem Pfad und löst handleRoute() aus.
 * @param {string} path
 */
export function navigate(path) {
  window.history.pushState({}, '', path)
  handleRoute()
}

/**
 * Wertet den aktuellen Pfad aus und ruft den passenden Handler auf.
 */
export function handleRoute() {
  const path = window.location.pathname
  const boardMatch = path.match(/^\/u\/([a-z0-9_]+)\/board\/([a-z0-9-]+)$/i)
  const profileMatch = path.match(/^\/u\/([a-z0-9_]+)$/i)

  if (path === '/settings') {
    handlers.settings?.()
  } else if (path === '/explore') {
    handlers.explore?.()
  } else if (boardMatch) {
    handlers.board?.(boardMatch[1], boardMatch[2])
  } else if (profileMatch) {
    handlers.profile?.(profileMatch[1])
  } else {
    handlers.init?.()
  }
}

// Popstate (Browser-Zurück/Vor)
window.addEventListener('popstate', handleRoute)
