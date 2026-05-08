import { signIn, signUp } from '../services/auth.service.js'
import { navigate } from '../router.js'
import { supabase } from '../supabase.js'
import { uploadHeaderImage } from '../services/media.service.js'

function _legalFooter() {
  return `
    <div style="margin-top:36px;padding-top:16px;border-top:1px solid #161616;display:flex;justify-content:center;gap:20px;flex-wrap:wrap;">
      <a href="/impressum"           id="link-impressum"   style="color:#2e2e2e;font-size:11px;text-decoration:none;">Impressum</a>
      <a href="/datenschutz"         id="link-datenschutz" style="color:#2e2e2e;font-size:11px;text-decoration:none;">Datenschutz</a>
      <a href="/nutzungsbedingungen" id="link-nutzung"     style="color:#2e2e2e;font-size:11px;text-decoration:none;">Nutzungsbedingungen</a>
    </div>`
}

function _wireLegalLinks() {
  document.querySelector('#link-impressum')?.addEventListener('click', e => { e.preventDefault(); navigate('/impressum') })
  document.querySelector('#link-datenschutz')?.addEventListener('click', e => { e.preventDefault(); navigate('/datenschutz') })
  document.querySelector('#link-nutzung')?.addEventListener('click', e => { e.preventDefault(); navigate('/nutzungsbedingungen') })
}

/**
 * Zeigt die Login/Registrierungs-Seite.
 * @param {function} onSuccess — Callback nach erfolgreichem Login
 */
export function showLogin(onSuccess) {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;padding:24px;box-sizing:border-box;">
      <div style="width:100%;max-width:360px;">
        <div style="text-align:center;margin-bottom:36px;">
          <h1 style="color:#fff;font-size:22px;font-weight:600;margin-bottom:6px;letter-spacing:-.01em;">Marvin's Place</h1>
          <p style="color:#444;font-size:13px;">Melde dich an oder erstelle ein Konto</p>
        </div>
        <input id="email" type="email" placeholder="E-Mail" autocomplete="email"
          style="display:block;width:100%;padding:12px;margin-bottom:10px;background:#111;border:1px solid #222;border-radius:10px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <input id="password" type="password" placeholder="Passwort" autocomplete="current-password"
          style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#111;border:1px solid #222;border-radius:10px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;" />
        <button id="btn-login"  style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;">Einloggen</button>
        <button id="btn-signup" style="width:100%;padding:12px;background:transparent;color:#888;border:1px solid #222;border-radius:10px;font-size:14px;cursor:pointer;">Registrieren</button>
        <p id="msg" style="color:#666;font-size:13px;margin-top:16px;text-align:center;min-height:18px;"></p>
        ${_legalFooter()}
      </div>
    </div>`

  _wireLegalLinks()

  const msg = document.querySelector('#msg')

  document.querySelector('#btn-login').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    if (!email || !password) { msg.textContent = 'E-Mail und Passwort eingeben'; return }
    msg.textContent = 'Lädt...'
    const { error } = await signIn(email, password)
    if (error) { msg.textContent = error.message; return }
    onSuccess()
  })

  document.querySelector('#btn-signup').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    if (!email || !password) { msg.textContent = 'E-Mail und Passwort eingeben'; return }
    if (password.length < 6) { msg.textContent = 'Passwort: mindestens 6 Zeichen'; return }
    msg.textContent = 'Lädt...'
    const { error } = await signUp(email, password)
    if (error) { msg.textContent = error.message; return }
    msg.style.color = '#06d6a0'
    msg.textContent = '✅ Bestätigungsmail gesendet — bitte E-Mail prüfen.'
  })

  document.querySelector('#password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.querySelector('#btn-login').click()
  })
}

/**
 * Zeigt die Username-Setup-Seite für neue User.
 * Includes optional profile picture upload.
 * @param {string} userId
 * @param {function} onSuccess — Callback nach erfolgreichem Setzen
 */
export function showUsernameSetup(userId, onSuccess) {
  let avatarUrl = null

  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;padding:24px;box-sizing:border-box;">
      <div style="width:100%;max-width:360px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h2 style="color:#fff;font-size:20px;font-weight:600;margin-bottom:6px;">Dein Profil einrichten</h2>
          <p style="color:#444;font-size:13px;">Einmal wählen — kann später geändert werden</p>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:28px;gap:10px;">
          <div id="avatar-preview" style="width:72px;height:72px;border-radius:50%;background:#1a1a1a;border:2px dashed #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:28px;color:#444;cursor:pointer;overflow:hidden;flex-shrink:0;">👤</div>
          <label for="avatar-file" style="color:#444;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;">Profilbild wählen (optional)</label>
          <input id="avatar-file" type="file" accept="image/*" style="display:none;" />
        </div>

        <input id="username" type="text" placeholder="username" autocomplete="off" autocapitalize="none"
          style="display:block;width:100%;padding:12px;margin-bottom:8px;background:#111;border:1px solid #222;border-radius:10px;color:#fff;font-size:14px;box-sizing:border-box;outline:none;letter-spacing:.01em;" />
        <p style="color:#2e2e2e;font-size:12px;margin-bottom:20px;line-height:1.5;">Buchstaben, Zahlen und _ · Mindestens 3 Zeichen</p>
        <button id="btn-save" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Weiter →</button>
        <p id="msg" style="color:#666;font-size:13px;margin-top:16px;text-align:center;min-height:18px;"></p>
        ${_legalFooter()}
      </div>
    </div>`

  _wireLegalLinks()

  const msg = document.querySelector('#msg')
  const avatarPreview = document.querySelector('#avatar-preview')
  const avatarFile = document.querySelector('#avatar-file')

  avatarPreview.addEventListener('click', () => avatarFile.click())

  avatarFile.addEventListener('change', async () => {
    const file = avatarFile.files[0]
    if (!file) return
    msg.style.color = '#666'
    msg.textContent = 'Bild wird hochgeladen...'
    const { url, error } = await uploadHeaderImage(file, userId)
    if (error || !url) { msg.textContent = 'Upload fehlgeschlagen'; return }
    avatarUrl = url
    avatarPreview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`
    msg.textContent = ''
  })

  document.querySelector('#btn-save').addEventListener('click', async () => {
    const username = document.querySelector('#username').value.trim().toLowerCase()
    msg.style.color = '#666'
    if (username.length < 3) { msg.textContent = 'Mindestens 3 Zeichen'; return }
    if (!/^[a-z0-9_]+$/.test(username)) { msg.textContent = 'Nur Buchstaben, Zahlen und _ erlaubt'; return }
    msg.textContent = 'Speichern...'
    const updates = { username }
    if (avatarUrl) updates.avatar_url = avatarUrl
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (error) {
      msg.textContent = error.code === '23505' ? 'Username bereits vergeben' : error.message
      return
    }
    onSuccess()
  })

  document.querySelector('#username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.querySelector('#btn-save').click()
  })
}
