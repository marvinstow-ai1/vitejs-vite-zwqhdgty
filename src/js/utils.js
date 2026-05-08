// ─── Icons (lucide-stroke style) ──────────────────────────────────────────────

export const ICONS = {
  home: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  chevR: '<polyline points="9 18 15 12 9 6"/>',
  chevL: '<polyline points="15 18 9 12 15 6"/>',
}

export function iconSvg(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
}

// ─── String helpers ───────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'Gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

export function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Media helpers ────────────────────────────────────────────────────────────

export function detectMediaType(url) {
  if (!url) return 'image'
  const clean = url.split('?')[0].toLowerCase()
  if (/\.(mp4|webm|mov|ogg)$/.test(clean)) return 'video'
  if (/\.(gif)$/.test(clean)) return 'gif'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  return 'image'
}

export function getYouTubeEmbedUrl(url) {
  const listId = url.match(/list=([^&\s]+)/)?.[1]
  const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
  if (listId) return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=0`
  if (videoId) return `https://www.youtube.com/embed/${videoId}`
  return null
}

export function renderMediaEl(mediaUrl, mediaType, opts = {}) {
  const { width = '100%', maxHeight = '', cursor = 'pointer', classes = '', dataset = '' } = opts
  const style = `width:${width};display:block;${maxHeight ? `max-height:${maxHeight};object-fit:cover;` : ''}${cursor ? `cursor:${cursor};` : ''}`
  if (mediaType === 'video' || mediaType === 'gif') {
    return `<video src="${mediaUrl}" ${classes ? `class="${classes}"` : ''} ${dataset} style="${style}" autoplay loop muted playsinline onerror="this.style.display='none'"></video>`
  }
  if (mediaType === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(mediaUrl)
    if (!embedUrl) return ''
    return `<div style="position:relative;width:100%;padding-bottom:56.25%;background:#000;"><iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`
  }
  if (mediaType === 'instagram') {
    return `<div style="padding:12px;background:#111;border-radius:8px;text-align:center;"><a href="${mediaUrl}" target="_blank" rel="noopener" style="color:#4d9fff;font-size:13px;text-decoration:none;">📷 Instagram öffnen →</a></div>`
  }
  return `<img src="${mediaUrl}" alt="" ${classes ? `class="${classes}"` : ''} ${dataset} style="${style}" onerror="this.style.display='none'" />`
}

// ─── Profile header helpers ───────────────────────────────────────────────────

export function buildHeaderStyle(profile) {
  if (profile.header_type === 'image' && profile.header_image_url) return `background:${profile.header_color || '#111'};`
  return `background:${profile.header_color || '#0a0a0a'};`
}

export function buildPatternStyle(pattern) {
  const p = {
    dots: 'background-image:radial-gradient(circle,#fff 1px,transparent 1px);background-size:16px 16px;',
    stripes: 'background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%);background-size:8px 8px;',
    grid: 'background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:20px 20px;',
    diagonal: 'background-image:repeating-linear-gradient(-45deg,#fff 0,#fff 1px,transparent 0,transparent 6px);background-size:8px 8px;',
    waves: 'background-image:repeating-radial-gradient(circle at 0 0,transparent 0,#fff 20px),repeating-linear-gradient(#ffffff33,#ffffff33);',
    noise: 'background-image:url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.4\'/%3E%3C/svg%3E");background-size:200px 200px;',
  }
  return p[pattern] || p.dots
}

// ─── Toast notification ───────────────────────────────────────────────────────

/**
 * Shows a brief toast message at the bottom of the screen.
 * @param {string} message
 * @param {'error'|'success'|'info'} type
 */
export function showToast(message, type = 'error') {
  const existing = document.querySelector('#app-toast')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.id = 'app-toast'
  const bg = type === 'success' ? 'rgba(6,214,160,0.95)' : type === 'info' ? 'rgba(77,159,255,0.95)' : 'rgba(255,77,109,0.95)'
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:${bg};color:#fff;font-size:13px;font-weight:500;padding:10px 20px;border-radius:24px;white-space:nowrap;pointer-events:none;max-width:calc(100vw - 40px);text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.5);`
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 300)
  }, 2700)
}

export function buildMusicEmbed(url) {
  if (!url) return ''
  if (url.includes('spotify.com')) {
    return `<iframe src="${url.replace('open.spotify.com/', 'open.spotify.com/embed/')}" width="100%" height="80" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" style="display:block;"></iframe>`
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const listId = url.match(/list=([^&\s]+)/)?.[1]
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
    const embedUrl = listId
      ? `https://www.youtube.com/embed/videoseries?list=${listId}`
      : `https://www.youtube.com/embed/${videoId}`
    return `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allow="autoplay;encrypted-media" style="display:block;"></iframe>`
  }
  if (url.includes('music.apple.com')) {
    return `<iframe src="${url.replace('music.apple.com', 'embed.music.apple.com')}" width="100%" height="150" frameborder="0" allow="autoplay;*;encrypted-media;*" style="display:block;"></iframe>`
  }
  return `<p style="padding:16px;color:#555;font-size:13px;">Playlist-URL nicht erkannt.</p>`
}
