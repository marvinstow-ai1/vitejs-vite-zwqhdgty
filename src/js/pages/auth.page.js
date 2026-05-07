import { signIn, signUp } from '../services/auth.service.js'
import { setUsername } from '../services/profiles.service.js'

/**
 * Zeigt die Login/Registrierungs-Seite.
 * @param {function} onSuccess — Callback nach erfolgreichem Login
 */
export function showLogin(onSuccess) {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;">
      <div style="width:100%;max-width:360px;padding:40px 24px;">
        <h1 style="color:#fff;font-size:24px;font-weight:500;margin-bottom:8px;">Marvin's Place</h1>
        <p style="color:#666;font-size:14px;margin-bottom:32px;">Melde dich an</p>
        <input id="email" type="email" placeholder="Email" style="display:block;width:100%;padding:12px;margin-bottom:12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <input id="password" type="password" placeholder="Passwort" style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-login" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:10px;">Einloggen</button>
        <button id="btn-signup" style="width:100%;padding:12px;background:transparent;color:#fff;border:1px solid #333;border-radius:8px;font-size:14px;cursor:pointer;">Registrieren</button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>`

  document.querySelector('#btn-login').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    const msg = document.querySelector('#msg')
    if (!email || !password) { msg.textContent = 'Email und Passwort eingeben'; return }
    msg.textContent = 'Lädt...'
    const { error } = await signIn(email, password)
    if (error) { msg.textContent = error.message; return }
    onSuccess()
  })

  document.querySelector('#btn-signup').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()
    const msg = document.querySelector('#msg')
    msg.textContent = 'Lädt...'
    const { error } = await signUp(email, password)
    if (error) { msg.textContent = error.message; return }
    msg.textContent = 'Bestätigungsmail gesendet!'
  })
}

/**
 * Zeigt die Username-Setup-Seite für neue User.
 * @param {string} userId
 * @param {function} onSuccess — Callback nach erfolgreichem Setzen
 */
export function showUsernameSetup(userId, onSuccess) {
  document.querySelector('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;">
      <div style="width:100%;max-width:360px;padding:40px 24px;">
        <h2 style="color:#fff;font-size:20px;font-weight:500;margin-bottom:8px;">Wähle deinen Username</h2>
        <p style="color:#666;font-size:14px;margin-bottom:32px;">Einmalig — kann später geändert werden</p>
        <input id="username" type="text" placeholder="username" style="display:block;width:100%;padding:12px;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;" />
        <button id="btn-save" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Weiter</button>
        <p id="msg" style="color:#888;font-size:13px;margin-top:16px;text-align:center;"></p>
      </div>
    </div>`

  document.querySelector('#btn-save').addEventListener('click', async () => {
    const username = document.querySelector('#username').value.trim().toLowerCase()
    const msg = document.querySelector('#msg')
    if (username.length < 3) { msg.textContent = 'Mindestens 3 Zeichen'; return }
    if (!/^[a-z0-9_]+$/.test(username)) { msg.textContent = 'Nur Buchstaben, Zahlen und _ erlaubt'; return }
    msg.textContent = 'Speichern...'
    const { error } = await setUsername(userId, username)
    if (error) {
      msg.textContent = error.code === '23505' ? 'Username bereits vergeben' : error.message
      return
    }
    onSuccess()
  })
}
