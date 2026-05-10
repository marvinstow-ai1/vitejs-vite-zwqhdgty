import { supabase } from '../supabase.js'
import { getSession } from '../services/auth.service.js'
import { getProfileByUsername, updateProfile, getFollowCounts, getRelationshipStatus } from '../services/profiles.service.js'
import { getVisiblePostIds } from '../services/posts.service.js'
import { followUser, unfollowUser, sendFollowRequest, withdrawFollowRequest, blockUser, unblockUser } from '../services/interactions.service.js'
import { notifyAction } from '../services/notify.action.js'
import { uploadHeaderImage } from '../services/media.service.js'
import { getBoardsByUser, getProfileReposts, getUserRepostIds, createBoard, updateBoard } from '../services/boards.service.js'
import { loadProfileStories, getViewedStoryIds } from '../services/stories.service.js'
import { renderBoardPost, wireBoardRepostButtons, wireBoardVideos, loadBoardContent } from './board.page.js'
import { openStoryViewer, openRepostModal } from './feed.page.js'
import { initGridCols } from '../grid-utils.js'
import { renderGridControls } from '../grid-controls.js'
import { escapeHtml, shuffleArray, buildHeaderStyle, buildPatternStyle, buildMusicEmbed, iconSvg, profileHeaderTone } from '../utils.js'
import { updateShellContent, updateActiveNav, wireShellNav, applyNavPref, renderGlobalHeader, setGlobalHeaderTone, registerHeaderScrollListener } from '../shell.js'

/**
 * Zeigt eine Profilseite.
 * @param {string} username
 * @param {{ navigate: function }} ctx
 */
export async function showProfilePage(username, ctx) {
  const { navigate } = ctx

  // Body-Klassen für globalen Header
  document.body.classList.add('has-global-header', 'profile-page')
  applyNavPref()

  updateActiveNav('profile')
  updateShellContent(`<div style="background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;"><div class="spinner-wrap"><div class="spinner"></div></div></div>`)

  const session = await getSession()
  const currentUserId = session?.user?.id || null
  const profile = await getProfileByUsername(username)

  if (!profile) {
    updateShellContent(`<div style="background:#0a0a0a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;">
      <p style="color:#555;font-size:14px;">Profil nicht gefunden</p>
      <button onclick="history.back()" style="padding:8px 20px;background:transparent;color:#666;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:13px;">Zurück</button>
    </div>`)
    return
  }

  const isOwner = currentUserId === profile.id
  const profilePrivacy = profile.profile_privacy || 'public'
  // followState: 'none' | 'pending' | 'accepted'
  let followState = 'none'
  let iBlocked = false, iAmBlocked = false

  if (currentUserId && !isOwner) {
    const rel = await getRelationshipStatus(currentUserId, profile.id)
    if (rel.followStatus === 'accepted') followState = 'accepted'
    else if (rel.followStatus === 'pending') followState = 'pending'
    iBlocked = rel.iBlocked
    iAmBlocked = rel.iAmBlocked
  }
  // Abwärtskompatibilität: following = true wenn accepted
  let following = followState === 'accepted'

  if (iAmBlocked) {
    updateShellContent(`<div style="background:#0a0a0a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;">
      <div style="font-size:42px;">🚫</div>
      <p style="color:#555;font-size:14px;text-align:center;">Profil nicht verfügbar.</p>
      <button onclick="history.back()" style="padding:8px 20px;background:transparent;color:#666;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:13px;">Zurück</button>
    </div>`)
    return
  }

  const canSeeBoard = !iBlocked && (isOwner || profilePrivacy === 'public' || (profilePrivacy === 'followers' && followState === 'accepted'))

  const { data: ownPosts } = await supabase
    .from('posts')
    .select('id, media_url, mood, media_type, visibility, user_id')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  const { followerCount, followingCount } = await getFollowCounts(profile.id)
  const boards = await getBoardsByUser(profile.id)

  let repostedPosts = []
  if (canSeeBoard) {
    repostedPosts = await getProfileReposts(profile.id)
  }

  let viewerRepostedSet = new Set()
  if (currentUserId && !isOwner) {
    viewerRepostedSet = await getUserRepostIds(currentUserId)
  }

  let boardPosts = []
  if (canSeeBoard) {
    const merged = [...(ownPosts || []), ...repostedPosts]
    const seen = new Set()
    const dedup = merged.filter(p => p && !seen.has(p.id) && (seen.add(p.id), true))
    const visibleIds = await getVisiblePostIds(dedup, currentUserId)
    boardPosts = dedup.filter(p => visibleIds.has(p.id))
  }

  let profileStories = []
  if (canSeeBoard) {
    profileStories = await loadProfileStories(profile.id)
  }
  const hasStories = profileStories.length > 0
  let profileViewedSet = new Set()
  if (hasStories && currentUserId) {
    profileViewedSet = await getViewedStoryIds(currentUserId, profileStories.map(s => s.id))
  }
  const hasUnseenStories = hasStories && profileStories.some(s => !profileViewedSet.has(s.id))

  const shuffled = profile.pinned_board_mood
    ? boardPosts.filter(p => p.mood === profile.pinned_board_mood)
    : shuffleArray(boardPosts)

  // Tone für globalen Header bestimmen
  const tone = profileHeaderTone(profile)

  const headerStyle = buildHeaderStyle(profile)

  // Textfarbe im Hero abhängig vom Tone
  const heroTextColor = tone === 'light' ? 'rgba(0,0,0,0.85)' : '#fff'
  const heroTextShadow = tone === 'light' ? '0 1px 4px rgba(255,255,255,0.4)' : '0 2px 8px rgba(0,0,0,0.8)'
  const heroBioColor = tone === 'light' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)'
  const heroPrivacyColor = tone === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'
  const heroBtnBg = tone === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'
  const heroBtnColor = tone === 'light' ? '#111' : '#fff'
  const heroBtnBorder = tone === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'

  updateShellContent(`
    <div style="background:#0a0a0a;min-height:100vh;color:#fff;">

      <!-- Hero Header (kein padding-top — globaler Header überlagert) -->
      <div style="position:relative;width:100%;height:300px;overflow:hidden;${headerStyle}">
        ${profile.header_type === 'image' && profile.header_image_url
          ? `<img src="${profile.header_image_url}" alt="" style="position:absolute;width:100%;height:100%;object-fit:cover;transform:translate(${(profile.header_image_position?.x || 50) - 50}%, ${(profile.header_image_position?.y || 50) - 50}%) scale(${profile.header_image_position?.zoom || 1});transform-origin:center;" />`
          : ''}
        ${profile.header_type === 'pattern'
          ? `<div style="position:absolute;inset:0;${buildPatternStyle(profile.header_pattern)}opacity:0.25;"></div>`
          : ''}
        <!-- Gradient-Overlay unten für sanften Übergang -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,transparent,#0a0a0a);pointer-events:none;z-index:1;"></div>
        <div style="position:absolute;top:64px;left:20px;z-index:2;max-width:65%;display:flex;align-items:flex-start;gap:12px;">
          ${hasStories ? `
            <div id="profile-story-ring" style="width:52px;height:52px;border-radius:50%;padding:2px;background:${hasUnseenStories ? 'linear-gradient(135deg,#ff4d6d,#ffd60a,#06d6a0)' : 'rgba(255,255,255,0.4)'};cursor:pointer;flex-shrink:0;">
              <div style="width:100%;height:100%;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;border:2px solid #0a0a0a;">${(profile.username || '?')[0].toUpperCase()}</div>
            </div>` : ''}
          <div style="min-width:0;">
            <div style="font-size:22px;font-weight:700;color:${heroTextColor};text-shadow:${heroTextShadow};">${escapeHtml(profile.display_name || profile.username)}</div>
            ${profile.bio ? `<div style="font-size:13px;color:${heroBioColor};margin-top:6px;line-height:1.4;text-shadow:${heroTextShadow};">${escapeHtml(profile.bio)}</div>` : ''}
            ${profilePrivacy !== 'public' ? `<div style="margin-top:8px;font-size:11px;color:${heroPrivacyColor};">${profilePrivacy === 'private' ? '🔒 Privates Profil' : '👥 Nur Follower'}</div>` : ''}
          </div>
        </div>
        <div style="position:absolute;top:60px;right:14px;z-index:2;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:60%;">
          ${isOwner
            ? `<button id="btn-edit" class="icon-btn icon-btn-sm" aria-label="Profil bearbeiten" style="background:${heroBtnBg};color:${heroBtnColor};border-color:${heroBtnBorder};">${iconSvg('edit', 14)}</button>
               <button id="btn-settings-link" class="icon-btn icon-btn-sm" aria-label="Einstellungen" style="background:${heroBtnBg};color:${heroBtnColor};border-color:${heroBtnBorder};">${iconSvg('settings', 14)}</button>`
            : currentUserId ? `
              ${!iBlocked ? `<button id="btn-follow" data-state="${followState}" style="padding:6px 14px;background:${followState === 'accepted' ? 'transparent' : followState === 'pending' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'};color:${followState === 'accepted' ? '#fff' : followState === 'pending' ? '#888' : '#000'};border:1px solid ${followState === 'pending' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)'};border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;">${followState === 'accepted' ? 'Folgst du' : followState === 'pending' ? 'Angefragt' : 'Folgen'}</button>` : ''}
              <button id="btn-block" class="icon-btn icon-btn-sm" aria-label="${iBlocked ? 'Entblocken' : 'Blockieren'}" style="background:${heroBtnBg};color:${iBlocked ? 'var(--danger)' : heroBtnColor};border-color:${heroBtnBorder};">${iconSvg('ban', 14)}</button>
            ` : ''
          }
        </div>
        <button id="btn-info" style="position:absolute;bottom:20px;left:16px;z-index:2;padding:6px 14px;background:${heroBtnBg};color:${heroBtnColor};border:1px solid ${heroBtnBorder};border-radius:20px;cursor:pointer;font-size:12px;backdrop-filter:blur(8px);">
          @${profile.username} · ${boardPosts.length} Posts · ${followerCount} Follower
        </button>
        ${profile.playlist_url ? `<button id="btn-music" style="position:absolute;bottom:20px;right:16px;z-index:2;width:42px;height:42px;background:${heroBtnBg};color:${heroBtnColor};border:1px solid ${heroBtnBorder};border-radius:50%;cursor:pointer;font-size:20px;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;">🎵</button>` : ''}
      </div>

      <!-- Info Panel -->
      <div id="info-panel" style="display:none;background:#111;border-bottom:1px solid #222;padding:16px 20px;">
        <div style="display:flex;gap:24px;font-size:13px;color:#666;">
          <span><strong style="color:#fff;">${boardPosts.length}</strong> Posts</span>
          <span><strong style="color:#fff;">${followerCount}</strong> Follower</span>
          <span><strong style="color:#fff;">${followingCount}</strong> Following</span>
        </div>
        ${profile.profile_link ? `<a href="${escapeHtml(profile.profile_link)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;color:#4d9fff;text-decoration:none;">🔗 ${escapeHtml(profile.profile_link)}</a>` : ''}
      </div>

      <!-- Musik Panel -->
      <div id="music-panel" style="display:none;"></div>

      ${!canSeeBoard ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:16px;">
          <div style="font-size:48px;">🔒</div>
          <p style="color:#555;font-size:14px;text-align:center;max-width:280px;">${
            followState === 'pending'
              ? 'Deine Anfrage ist ausstehend. Sobald sie angenommen wird, siehst du dieses Profil.'
              : profilePrivacy === 'private'
                ? 'Dieses Profil ist privat.'
                : 'Nur Follower können dieses Board sehen.'
          }</p>
          ${followState === 'pending' ? `<button id="btn-withdraw-lock" style="padding:8px 20px;background:transparent;color:#666;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:13px;">Anfrage zurückziehen</button>` : ''}
        </div>
      ` : `
        <!-- Boards Tabs -->
        <div style="border-bottom:1px solid #1a1a1a;">
          <div style="display:flex;overflow-x:auto;scrollbar-width:none;padding:0 12px;">
            <button class="board-tab active-board-tab" data-board="all" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid #fff;color:#fff;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Alle Posts</button>
            ${boards.map(b => {
              const visIcon = b.visibility === 'private' ? ' 🔒' : b.visibility === 'followers' ? ' 👥' : ''
              return `<button class="board-tab" data-board="${b.id}" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;color:#555;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">${escapeHtml(b.title)}${visIcon}</button>`
            }).join('')}
            ${isOwner ? `<button id="btn-new-board" style="padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;color:#444;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">+ Board</button>` : ''}
          </div>
        </div>

        <!-- Board Content -->
        <div id="board-content">
          <div class="grid-controls" id="profile-grid-controls"></div>
          <div class="unified-grid" id="profile-grid">
            ${shuffled.map(post => renderBoardPost(post, isOwner, { viewerId: currentUserId, viewerReposted: viewerRepostedSet.has(post.id) })).join('')}
            ${!shuffled.length ? `<p style="color:#333;font-size:14px;padding:40px;grid-column:1/-1;">Noch keine Posts.</p>` : ''}
          </div>
        </div>
      `}
      </div>

    <!-- Edit Modal -->
    <div id="edit-modal" style="display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.92);overflow-y:auto;">
      <div style="max-width:500px;margin:0 auto;padding:24px 16px 80px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <h2 style="color:#fff;font-size:18px;font-weight:500;margin:0;">Profil editieren</h2>
          <button id="edit-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;">×</button>
        </div>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Anzeigename</label>
        <input id="edit-displayname" type="text" value="${escapeHtml(profile.display_name || '')}" placeholder="${profile.username}" style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Bio</label>
        <textarea id="edit-bio" rows="3" placeholder="Kurze Bio..." style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;resize:vertical;">${escapeHtml(profile.bio || '')}</textarea>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Link</label>
        <input id="edit-link" type="url" value="${escapeHtml(profile.profile_link || '')}" placeholder="https://..." style="display:block;width:100%;padding:10px 12px;margin-bottom:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL</label>
        <input id="edit-playlist" type="url" value="${escapeHtml(profile.playlist_url || '')}" placeholder="Spotify / YouTube / Apple Music..." style="display:block;width:100%;padding:10px 12px;margin-bottom:24px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Profil-Sichtbarkeit</label>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          ${['public', 'followers', 'private'].map(v => `
            <button class="privacy-btn" data-privacy="${v}" style="flex:1;padding:12px 8px;border-radius:10px;border:2px solid ${profilePrivacy === v ? '#fff' : '#2a2a2a'};background:${profilePrivacy === v ? '#fff' : '#1a1a1a'};color:${profilePrivacy === v ? '#000' : '#555'};cursor:pointer;font-size:13px;text-align:center;line-height:1.4;">
              ${v === 'public' ? '🌍' : v === 'followers' ? '👥' : '🔒'}<br><span style="font-size:11px;">${v === 'public' ? 'Öffentlich' : v === 'followers' ? 'Follower' : 'Privat'}</span>
            </button>`).join('')}
        </div>
        <p style="color:#444;font-size:11px;margin-bottom:24px;">Öffentlich = alle sehen dein Board · Follower = nur wer dir folgt · Privat = nur du</p>
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Header</label>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="htype-btn" data-type="color" style="flex:1;padding:8px;background:${(profile.header_type || 'color') === 'color' ? '#fff' : '#1a1a1a'};color:${(profile.header_type || 'color') === 'color' ? '#000' : '#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Farbe</button>
          <button class="htype-btn" data-type="pattern" style="flex:1;padding:8px;background:${profile.header_type === 'pattern' ? '#fff' : '#1a1a1a'};color:${profile.header_type === 'pattern' ? '#000' : '#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Muster</button>
          <button class="htype-btn" data-type="image" style="flex:1;padding:8px;background:${profile.header_type === 'image' ? '#fff' : '#1a1a1a'};color:${profile.header_type === 'image' ? '#000' : '#666'};border:1px solid #333;border-radius:8px;cursor:pointer;font-size:12px;">Foto</button>
        </div>
        <div id="sec-color" style="display:${(profile.header_type || 'color') === 'color' ? 'block' : 'none'};margin-bottom:20px;">
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Pastell</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ffd6e0','#ffecb3','#d4edda','#cce5ff','#e2d9f3','#ffecd2','#c8e6c9','#b3e5fc','#f8bbd0','#dcedc8'].map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color === c ? '#fff' : 'transparent'};"></div>`).join('')}
          </div>
          <p style="color:#555;font-size:11px;margin-bottom:8px;">Kräftig</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            ${['#ff4d6d','#ff6b35','#ffd60a','#06d6a0','#118ab2','#7209b7','#3a0ca3','#f72585','#0a0a0a','#ffffff'].map(c => `<div class="color-tile" data-color="${c}" style="width:32px;height:32px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${profile.header_color === c ? '#fff' : 'transparent'};"></div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="color-wheel" value="${profile.header_color || '#0a0a0a'}" style="width:40px;height:40px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;" />
            <input type="text" id="hex-input" value="${profile.header_color || '#0a0a0a'}" placeholder="#000000" style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;outline:none;" />
            <div id="hex-preview" style="width:40px;height:40px;border-radius:8px;background:${profile.header_color || '#0a0a0a'};border:1px solid #333;"></div>
          </div>
        </div>
        <div id="sec-pattern" style="display:${profile.header_type === 'pattern' ? 'block' : 'none'};margin-bottom:20px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
            ${[{id:'dots',l:'Punkte'},{id:'stripes',l:'Streifen'},{id:'grid',l:'Gitter'},{id:'diagonal',l:'Diagonal'},{id:'waves',l:'Wellen'},{id:'noise',l:'Noise'}].map(p => `
              <div class="pattern-tile" data-pattern="${p.id}" style="height:60px;border-radius:8px;cursor:pointer;border:2px solid ${profile.header_pattern === p.id ? '#fff' : '#2a2a2a'};overflow:hidden;position:relative;background:${profile.header_color || '#111'};">
                <div style="position:absolute;inset:0;${buildPatternStyle(p.id)}opacity:0.4;"></div>
                <span style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:10px;color:#ccc;">${p.l}</span>
              </div>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#555;font-size:11px;">Bg:</span>
            <input type="color" id="pattern-wheel" value="${profile.header_color || '#0a0a0a'}" style="width:36px;height:36px;border:none;background:none;cursor:pointer;padding:0;" />
            <input type="text" id="pattern-hex" value="${profile.header_color || '#0a0a0a'}" style="flex:1;padding:8px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:12px;outline:none;" />
          </div>
        </div>
        <div id="sec-image" style="display:${profile.header_type === 'image' ? 'block' : 'none'};margin-bottom:20px;">
          <div id="img-preview-wrap" style="position:relative;width:100%;height:140px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:10px;cursor:grab;">
            ${profile.header_image_url
              ? `<img id="img-preview" src="${profile.header_image_url}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform:translate(${(profile.header_image_position?.x || 50) - 50}%, ${(profile.header_image_position?.y || 50) - 50}%) scale(${profile.header_image_position?.zoom || 1});transform-origin:center;" />`
              : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#444;font-size:13px;">Noch kein Foto</div>`}
          </div>
          <input id="header-file" type="file" accept="image/*" style="display:none;" />
          <button id="btn-upload" style="width:100%;padding:10px;background:#1a1a1a;color:#888;border:1px solid #2a2a2a;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:10px;">📷 Foto auswählen</button>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#555;font-size:11px;white-space:nowrap;">Zoom:</span>
            <input type="range" id="zoom-slider" min="1" max="3" step="0.05" value="${profile.header_image_position?.zoom || 1}" style="flex:1;accent-color:#fff;" />
            <span id="zoom-val" style="color:#555;font-size:11px;white-space:nowrap;">${Math.round((profile.header_image_position?.zoom || 1) * 100)}%</span>
          </div>
        </div>
        <button id="btn-save-profile" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Speichern</button>
        <p id="save-msg" style="color:#666;font-size:13px;text-align:center;margin-top:10px;"></p>
      </div>
    </div>

    <!-- Board Modal -->
    <div id="board-modal" style="display:none;position:fixed;inset:0;z-index:250;background:rgba(0,0,0,0.92);align-items:center;justify-content:center;">
      <div style="background:#111;border:1px solid #222;border-radius:16px;width:100%;max-width:420px;padding:24px;margin:16px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span id="board-modal-title" style="color:#fff;font-size:15px;font-weight:500;">Neues Board</span>
          <button id="board-modal-close" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <input type="hidden" id="board-edit-id" value="" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Name *</label>
        <input id="board-title" type="text" placeholder="z.B. Chill Vibes, Dark Aesthetic..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Beschreibung</label>
        <input id="board-desc" type="text" placeholder="Kurze Beschreibung..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Mood Filter (optional)</label>
        <input id="board-mood" type="text" placeholder="z.B. chill, dark, neon..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Playlist URL (optional)</label>
        <input id="board-playlist" type="url" placeholder="Spotify / YouTube..." style="display:block;width:100%;padding:10px 12px;margin-bottom:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <label style="display:block;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Sichtbarkeit</label>
        <div style="display:flex;gap:6px;margin-bottom:20px;">
          <button class="board-vis-btn" data-vis="public" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #fff;background:#fff;color:#000;font-size:11px;cursor:pointer;text-align:center;">🌍<br>Öffentlich</button>
          <button class="board-vis-btn" data-vis="followers" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #2a2a2a;background:#1a1a1a;color:#555;font-size:11px;cursor:pointer;text-align:center;">👥<br>Follower</button>
          <button class="board-vis-btn" data-vis="private" style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid #2a2a2a;background:#1a1a1a;color:#555;font-size:11px;cursor:pointer;text-align:center;">🔒<br>Privat</button>
        </div>
        <button id="board-save" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Board erstellen</button>
        <p id="board-msg" style="color:#555;font-size:12px;text-align:center;margin-top:10px;min-height:16px;"></p>
      </div>
    </div>`)

  // ── Globaler Header (Profil-Modus) ───────────────────────────────────────────
  renderGlobalHeader(profile, { navigate }, {
    tone,
    showBack: true,
  })

  // ── Shell-Navigation verdrahten (Sidebar + Bottombar) ────────────────────────
  wireShellNav(profile, {
    navigate: ctx.navigate,
    openComposer: ctx.openComposer,
    toggleNotif: ctx.toggleNotif,
  })

  // Scroll-Listener: Header-Tone dynamisch anpassen
  // Wenn der Hero-Bereich verlassen wird → 'auto' (Standard-Glasmorphismus)
  const heroEl = app.querySelector('div[style*="height:300px"]')
  const _onProfileScroll = () => {
    const heroBottom = heroEl ? heroEl.getBoundingClientRect().bottom : 0
    if (heroBottom <= 52) {
      setGlobalHeaderTone('auto')
    } else {
      setGlobalHeaderTone(tone)
    }
  }
  // Registriert und entfernt automatisch beim nächsten Seitenwechsel
  registerHeaderScrollListener(_onProfileScroll)
  // Initial setzen
  setGlobalHeaderTone(tone)

  // ── Basic Listeners ──────────────────────────────────────────────────────────
  document.querySelector('#btn-settings-link')?.addEventListener('click', () => navigate('/settings'))
  document.querySelector('#btn-info').addEventListener('click', () => {
    const p = document.querySelector('#info-panel')
    p.style.display = p.style.display === 'none' ? 'block' : 'none'
  })
  document.querySelector('#btn-music')?.addEventListener('click', () => {
    const p = document.querySelector('#music-panel')
    if (p.style.display === 'none') { p.style.display = 'block'; p.innerHTML = buildMusicEmbed(profile.playlist_url) }
    else { p.style.display = 'none'; p.innerHTML = '' }
  })

  // ── Follow ───────────────────────────────────────────────────────────────────
  const _applyFollowBtn = (btn, state) => {
    btn.dataset.state = state
    if (state === 'accepted') {
      btn.textContent = 'Folgst du'
      btn.style.background = 'transparent'
      btn.style.color = '#fff'
      btn.style.border = '1px solid rgba(255,255,255,0.4)'
    } else if (state === 'pending') {
      btn.textContent = 'Angefragt'
      btn.style.background = 'rgba(255,255,255,0.08)'
      btn.style.color = '#888'
      btn.style.border = '1px solid rgba(255,255,255,0.2)'
    } else {
      btn.textContent = 'Folgen'
      btn.style.background = 'rgba(255,255,255,0.9)'
      btn.style.color = '#000'
      btn.style.border = '1px solid rgba(255,255,255,0.4)'
    }
  }

  document.querySelector('#btn-follow')?.addEventListener('click', async () => {
    const btn = document.querySelector('#btn-follow')
    if (!currentUserId) return
    btn.disabled = true
    const state = btn.dataset.state || followState

    if (state === 'accepted') {
      // Entfolgen
      const { error } = await unfollowUser(currentUserId, profile.id)
      if (error) { console.error('unfollow failed', error); btn.disabled = false; return }
      followState = 'none'; following = false
      _applyFollowBtn(btn, 'none')
    } else if (state === 'pending') {
      // Anfrage zurückziehen
      const { error } = await withdrawFollowRequest(currentUserId, profile.id)
      if (error) { console.error('withdraw failed', error); btn.disabled = false; return }
      followState = 'none'; following = false
      _applyFollowBtn(btn, 'none')
    } else {
      // Folgen — bei privatem Profil → pending, sonst direkt accepted
      if (profilePrivacy === 'private' || profilePrivacy === 'followers') {
        const { error } = await sendFollowRequest(currentUserId, profile.id)
        if (error) { console.error('follow request failed', error); btn.disabled = false; return }
        followState = 'pending'
        _applyFollowBtn(btn, 'pending')
      } else {
        const { error } = await followUser(currentUserId, profile.id)
        if (error) { console.error('follow failed', error); btn.disabled = false; return }
        followState = 'accepted'; following = true
        _applyFollowBtn(btn, 'accepted')
        notifyAction(profile.id, currentUserId, 'follow').catch(e => console.error('follow notif failed', e))
      }
    }
    btn.disabled = false
  })

  // Anfrage zurückziehen vom Lock-Screen
  document.querySelector('#btn-withdraw-lock')?.addEventListener('click', async () => {
    const btn = document.querySelector('#btn-withdraw-lock')
    btn.disabled = true; btn.textContent = '...'
    const { error } = await withdrawFollowRequest(currentUserId, profile.id)
    if (error) { console.error('withdraw failed', error); btn.disabled = false; btn.textContent = 'Anfrage zurückziehen'; return }
    followState = 'none'; following = false
    // Seite neu laden damit Lock-Screen aktualisiert wird
    showProfilePage(profile.username, ctx)
  })

  // ── Block ────────────────────────────────────────────────────────────────────
  document.querySelector('#btn-block')?.addEventListener('click', async () => {
    if (!currentUserId) return
    const btn = document.querySelector('#btn-block')
    btn.disabled = true
    if (iBlocked) {
      const { error } = await unblockUser(currentUserId, profile.id)
      if (error) { console.error('unblock failed', error); btn.disabled = false; return }
      showProfilePage(profile.username, ctx)
    } else {
      if (!confirm(`@${profile.username} blockieren? Ihr werdet euch gegenseitig nicht mehr sehen.`)) { btn.disabled = false; return }
      const { error } = await blockUser(currentUserId, profile.id)
      if (error && error.code !== '23505') { console.error('block failed', error); btn.disabled = false; return }
      navigate('/')
    }
  })

  // ── Story Ring ───────────────────────────────────────────────────────────────
  document.querySelector('#profile-story-ring')?.addEventListener('click', () => {
    if (!profileStories.length) return
    openStoryViewer(profileStories, currentUserId, profileViewedSet, () => showProfilePage(profile.username, ctx))
  })

  // ── Board Tabs ───────────────────────────────────────────────────────────────
  if (canSeeBoard) {
    document.querySelectorAll('.board-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.board-tab').forEach(t => {
          t.style.borderBottom = '2px solid transparent'; t.style.color = '#555'
        })
        tab.style.borderBottom = '2px solid #fff'; tab.style.color = '#fff'
        const boardId = tab.dataset.board
        const content = document.querySelector('#board-content')
        if (boardId === 'all') {
          content.innerHTML = `<div class="grid-controls" id="profile-grid-controls"></div><div class="unified-grid" id="profile-grid">${shuffled.map(post => renderBoardPost(post, isOwner, { viewerId: currentUserId, viewerReposted: viewerRepostedSet.has(post.id) })).join('') || '<p style="color:#333;font-size:14px;padding:40px;grid-column:1/-1;">Noch keine Posts.</p>'}</div>`
          wireBoardRepostButtons(currentUserId, (bds, cb) => openRepostModal(bds, cb))
          wireBoardVideos(content)
          initGridCols('#profile-grid')
          renderGridControls(document.querySelector('#profile-grid-controls'), '#profile-grid')
        } else {
          content.innerHTML = `<div class="spinner-wrap" style="padding:24px;"><div class="spinner"></div></div>`
          await loadBoardContent(boardId, content, isOwner, currentUserId, boards, profile.username, {
            navigate,
            openRepostModal: (bds, cb) => openRepostModal(bds, cb),
          })
        }
      })
    })

    wireBoardRepostButtons(currentUserId, (bds, cb) => openRepostModal(bds, cb))
    wireBoardVideos(document.querySelector('#board-content'))

    // Unified Grid initialisieren (für "Alle Posts"-Tab)
    initGridCols('#profile-grid')
    renderGridControls(document.querySelector('#profile-grid-controls'), '#profile-grid')

    document.querySelector('#btn-new-board')?.addEventListener('click', () => _openBoardModal(null, currentUserId, profile.username, navigate))
  }

  if (!isOwner) return

  // ── Edit Modal ───────────────────────────────────────────────────────────────
  let currentType = profile.header_type || 'color'
  let currentColor = profile.header_color || '#0a0a0a'
  let currentPattern = profile.header_pattern || 'dots'
  let currentImageUrl = profile.header_image_url || null
  let currentImagePos = profile.header_image_position ? { ...profile.header_image_position } : { x: 50, y: 50, zoom: 1 }
  let currentPrivacy = profilePrivacy

  document.querySelector('#btn-edit')?.addEventListener('click', () => {
    document.querySelector('#edit-modal').style.display = 'block'
  })
  document.querySelector('#edit-close')?.addEventListener('click', () => {
    document.querySelector('#edit-modal').style.display = 'none'
  })
  if (isOwner && new URLSearchParams(location.search).get('edit') === '1') {
    document.querySelector('#edit-modal').style.display = 'block'
    history.replaceState({}, '', '/u/' + profile.username)
  }

  document.querySelectorAll('.privacy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPrivacy = btn.dataset.privacy
      document.querySelectorAll('.privacy-btn').forEach(b => {
        b.style.border = '2px solid #2a2a2a'; b.style.background = '#1a1a1a'; b.style.color = '#555'
      })
      btn.style.border = '2px solid #fff'; btn.style.background = '#fff'; btn.style.color = '#000'
    })
  })

  document.querySelectorAll('.htype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type
      document.querySelectorAll('.htype-btn').forEach(b => { b.style.background = '#1a1a1a'; b.style.color = '#666' })
      btn.style.background = '#fff'; btn.style.color = '#000'
      document.querySelector('#sec-color').style.display = currentType === 'color' ? 'block' : 'none'
      document.querySelector('#sec-pattern').style.display = currentType === 'pattern' ? 'block' : 'none'
      document.querySelector('#sec-image').style.display = currentType === 'image' ? 'block' : 'none'
    })
  })

  document.querySelectorAll('.color-tile').forEach(k => {
    k.addEventListener('click', () => {
      currentColor = k.dataset.color
      document.querySelector('#hex-input').value = currentColor
      document.querySelector('#color-wheel').value = currentColor
      document.querySelector('#hex-preview').style.background = currentColor
      document.querySelectorAll('.color-tile').forEach(x => x.style.borderColor = 'transparent')
      k.style.borderColor = '#fff'
    })
  })

  const hexInput = document.querySelector('#hex-input')
  const colorWheel = document.querySelector('#color-wheel')
  hexInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) {
      currentColor = hexInput.value; colorWheel.value = currentColor
      document.querySelector('#hex-preview').style.background = currentColor
    }
  })
  colorWheel.addEventListener('input', () => {
    currentColor = colorWheel.value; hexInput.value = currentColor
    document.querySelector('#hex-preview').style.background = currentColor
  })

  document.querySelectorAll('.pattern-tile').forEach(k => {
    k.addEventListener('click', () => {
      currentPattern = k.dataset.pattern
      document.querySelectorAll('.pattern-tile').forEach(x => x.style.borderColor = '#2a2a2a')
      k.style.borderColor = '#fff'
    })
  })

  const patternWheel = document.querySelector('#pattern-wheel')
  const patternHex = document.querySelector('#pattern-hex')
  patternWheel.addEventListener('input', () => { currentColor = patternWheel.value; patternHex.value = currentColor })
  patternHex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(patternHex.value)) { currentColor = patternHex.value; patternWheel.value = currentColor }
  })

  document.querySelector('#btn-upload').addEventListener('click', () => document.querySelector('#header-file').click())
  document.querySelector('#header-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const btn = document.querySelector('#btn-upload'); btn.textContent = 'Hochladen...'
    const { url, error } = await uploadHeaderImage(file, currentUserId)
    if (error) { btn.textContent = '❌ Fehler'; return }
    currentImageUrl = url
    document.querySelector('#img-preview-wrap').innerHTML = `<img id="img-preview" src="${currentImageUrl}" style="position:absolute;width:100%;height:100%;object-fit:cover;user-select:none;transform-origin:center;" />`
    btn.textContent = '✅ Hochgeladen'
    _setupImgDrag(currentImagePos)
  })

  document.querySelector('#zoom-slider').addEventListener('input', e => {
    currentImagePos.zoom = parseFloat(e.target.value)
    document.querySelector('#zoom-val').textContent = Math.round(currentImagePos.zoom * 100) + '%'
    const img = document.querySelector('#img-preview')
    if (img) img.style.transform = `translate(${currentImagePos.x - 50}%, ${currentImagePos.y - 50}%) scale(${currentImagePos.zoom})`
  })

  _setupImgDrag(currentImagePos)

  document.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const msg = document.querySelector('#save-msg'); msg.textContent = 'Speichern...'
    const { error } = await updateProfile(currentUserId, {
      display_name: document.querySelector('#edit-displayname').value.trim() || null,
      bio: document.querySelector('#edit-bio').value.trim() || null,
      profile_link: document.querySelector('#edit-link').value.trim() || null,
      playlist_url: document.querySelector('#edit-playlist').value.trim() || null,
      profile_privacy: currentPrivacy,
      header_type: currentType,
      header_color: currentColor,
      header_pattern: currentType === 'pattern' ? currentPattern : null,
      header_image_url: currentType === 'image' ? currentImageUrl : null,
      header_image_position: currentType === 'image' ? currentImagePos : null,
    })
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => showProfilePage(profile.username, ctx), 800)
  })
}

// ─── Board Modal ──────────────────────────────────────────────────────────────

function _openBoardModal(board, currentUserId, username, navigate) {
  const modal = document.querySelector('#board-modal')
  modal.style.display = 'flex'
  document.querySelector('#board-modal-title').textContent = board ? 'Board bearbeiten' : 'Neues Board'
  document.querySelector('#board-save').textContent = board ? 'Speichern' : 'Board erstellen'
  document.querySelector('#board-edit-id').value = board?.id || ''
  document.querySelector('#board-title').value = board?.title || ''
  document.querySelector('#board-desc').value = board?.description || ''
  document.querySelector('#board-mood').value = board?.mood || ''
  document.querySelector('#board-playlist').value = board?.playlist_url || ''
  document.querySelector('#board-msg').textContent = ''

  let boardVis = board?.visibility || 'public'
  const updateVisBtns = () => {
    document.querySelectorAll('.board-vis-btn').forEach(b => {
      const on = b.dataset.vis === boardVis
      b.style.border = `2px solid ${on ? '#fff' : '#2a2a2a'}`
      b.style.background = on ? '#fff' : '#1a1a1a'
      b.style.color = on ? '#000' : '#555'
    })
  }
  updateVisBtns()
  document.querySelectorAll('.board-vis-btn').forEach(b => {
    b.addEventListener('click', () => { boardVis = b.dataset.vis; updateVisBtns() })
  })

  document.querySelector('#board-modal-close').onclick = () => { modal.style.display = 'none' }

  const saveBtn = document.querySelector('#board-save')
  const newSaveBtn = saveBtn.cloneNode(true)
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn)
  newSaveBtn.addEventListener('click', async () => {
    const title = document.querySelector('#board-title').value.trim()
    const msg = document.querySelector('#board-msg')
    if (!title) { msg.textContent = 'Name fehlt'; return }
    msg.textContent = 'Speichern...'
    const editId = document.querySelector('#board-edit-id').value
    const payload = {
      title,
      description: document.querySelector('#board-desc').value.trim() || null,
      mood: document.querySelector('#board-mood').value.trim().replace(/^#+/, '').toLowerCase() || null,
      playlist_url: document.querySelector('#board-playlist').value.trim() || null,
      visibility: boardVis,
    }
    let error
    if (editId) {
      ({ error } = await updateBoard(editId, payload))
    } else {
      ({ error } = await createBoard(currentUserId, payload))
    }
    if (error) { msg.textContent = '❌ ' + error.message; return }
    msg.textContent = '✅ Gespeichert!'
    setTimeout(() => { modal.style.display = 'none'; navigate('/u/' + username) }, 600)
  })
}

// ─── Img Drag ─────────────────────────────────────────────────────────────────

function _setupImgDrag(pos) {
  const wrap = document.querySelector('#img-preview-wrap')
  if (!wrap) return
  let dragging = false, sx, sy, spx, spy
  const onStart = (x, y) => { dragging = true; sx = x; sy = y; spx = pos.x; spy = pos.y; wrap.style.cursor = 'grabbing' }
  const onMove = (x, y) => {
    if (!dragging) return
    pos.x = Math.max(0, Math.min(100, spx - (x - sx) / wrap.offsetWidth * 100))
    pos.y = Math.max(0, Math.min(100, spy - (y - sy) / wrap.offsetHeight * 100))
    const img = document.querySelector('#img-preview')
    if (img) img.style.transform = `translate(${pos.x - 50}%, ${pos.y - 50}%) scale(${pos.zoom})`
  }
  const onEnd = () => { dragging = false; wrap.style.cursor = 'grab' }
  wrap.addEventListener('mousedown', e => onStart(e.clientX, e.clientY))
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
  window.addEventListener('mouseup', onEnd)
  wrap.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY))
  window.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY) } }, { passive: false })
  window.addEventListener('touchend', onEnd)
}