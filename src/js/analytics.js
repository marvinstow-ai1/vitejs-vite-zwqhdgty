/**
 * Thin wrapper around Plausible analytics.
 * Safe to call even when Plausible is blocked or not loaded.
 * Add the Plausible script tag to index.html to enable tracking.
 */
export function trackEvent(name, props) {
  try {
    if (typeof window.plausible === 'function') {
      window.plausible(name, props ? { props } : undefined)
    }
  } catch (_) {
    // Never surface analytics errors to users
  }
}
