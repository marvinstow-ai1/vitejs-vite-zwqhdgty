import { navigate } from '../router.js'

// ─── Shared footer ─────────────────────────────────────────────────────────────

export function legalFooterHtml() {
  return `
    <footer style="border-top:1px solid #1a1a1a;padding:32px 24px;margin-top:64px;">
      <div style="max-width:640px;margin:0 auto;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between;">
        <span style="color:#333;font-size:12px;">© ${new Date().getFullYear()} Marvin's Place</span>
        <nav style="display:flex;gap:20px;flex-wrap:wrap;">
          <a href="/impressum" data-nav="/impressum" style="color:#444;font-size:12px;text-decoration:none;">Impressum</a>
          <a href="/datenschutz" data-nav="/datenschutz" style="color:#444;font-size:12px;text-decoration:none;">Datenschutz</a>
          <a href="/nutzungsbedingungen" data-nav="/nutzungsbedingungen" style="color:#444;font-size:12px;text-decoration:none;">Nutzungsbedingungen</a>
        </nav>
      </div>
    </footer>`
}

function wireLegalNav(container) {
  container.querySelectorAll('[data-nav]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.nav) })
  })
}

// ─── Base shell for legal pages ────────────────────────────────────────────────

function legalShell(title, content) {
  const app = document.querySelector('#app')
  app.innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;color:#ccc;font-family:inherit;">
      <div style="max-width:640px;margin:0 auto;padding:24px 20px 0;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:40px;">
          <button id="back-btn" style="background:none;border:1px solid #222;color:#555;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px;">← Zurück</button>
          <a href="/" data-nav="/" style="color:#555;font-size:13px;text-decoration:none;">Marvin's Place</a>
        </div>
        <h1 style="color:#fff;font-size:24px;font-weight:600;margin-bottom:32px;">${title}</h1>
        <div style="line-height:1.7;font-size:14px;color:#999;">
          ${content}
        </div>
      </div>
      ${legalFooterHtml()}
    </div>`
  document.querySelector('#back-btn').addEventListener('click', () => history.back())
  wireLegalNav(app)
}

// ─── Impressum ─────────────────────────────────────────────────────────────────

export function showImpressum() {
  legalShell('Impressum', `
    <p style="color:#666;font-size:12px;margin-bottom:24px;padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:8px;">
      ⚠️ Platzhalter — vor dem ersten echten Nutzer durch echte Angaben ersetzen.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">Angaben gemäß § 5 TMG</h2>
    <p>
      <strong style="color:#ddd;">[YOUR NAME]</strong><br>
      [STRASSE HAUSNUMMER]<br>
      [PLZ] [STADT]<br>
      Deutschland
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">Kontakt</h2>
    <p>
      E-Mail: <a href="mailto:[YOUR EMAIL]" style="color:#4d9fff;">[YOUR EMAIL]</a>
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">Verantwortlich für den Inhalt (§ 55 Abs. 2 RStV)</h2>
    <p>
      [YOUR NAME]<br>
      [STRASSE HAUSNUMMER]<br>
      [PLZ] [STADT]
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">Haftungsausschluss</h2>
    <p>
      Die Inhalte dieser Seite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
      Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden.
      Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach
      den allgemeinen Gesetzen verantwortlich.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">Urheberrecht</h2>
    <p>
      Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem
      deutschen Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Die Vervielfältigung,
      Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts
      bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
    </p>
  `)
}

// ─── Datenschutz ───────────────────────────────────────────────────────────────

export function showDatenschutz() {
  legalShell('Datenschutzerklärung', `
    <p style="color:#666;font-size:12px;margin-bottom:24px;padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:8px;">
      ⚠️ Platzhalter — vor dem ersten echten Nutzer durch rechtsgeprüfte Angaben ersetzen. E-Mail-Adresse ergänzen.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">1. Verantwortlicher</h2>
    <p>
      Verantwortlich für die Datenverarbeitung auf dieser Website ist:<br><br>
      <strong style="color:#ddd;">[YOUR NAME]</strong><br>
      [ADRESSE]<br>
      E-Mail: [YOUR EMAIL]
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">2. Welche Daten wir speichern</h2>
    <p>
      Beim Anlegen eines Accounts speichern wir:
    </p>
    <ul style="padding-left:20px;margin:8px 0;">
      <li>E-Mail-Adresse (für Login und Kontakt)</li>
      <li>Username und optionaler Anzeigename</li>
      <li>Von dir hochgeladene Bilder, Videos und Dateien</li>
      <li>Von dir erstellte Beiträge, Reposts, Likes, Kommentare und Stories</li>
      <li>Follows und Blocks zwischen Nutzerkonten</li>
    </ul>
    <p>
      Ohne Account (Gast) werden keine personenbezogenen Daten gespeichert.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">3. Dienstleister / Auftragsverarbeiter</h2>

    <h3 style="color:#bbb;font-size:14px;font-weight:500;margin:16px 0 6px;">Supabase</h3>
    <p>
      Datenbank, Authentifizierung und Dateispeicherung werden von
      <strong style="color:#ddd;">Supabase, Inc.</strong> (San Francisco, USA) bereitgestellt.
      Supabase ist EU-DSGVO-konform und bietet Data Processing Agreements (DPA) an.
      Mehr Informationen: <a href="https://supabase.com/privacy" target="_blank" rel="noopener" style="color:#4d9fff;">supabase.com/privacy</a>
    </p>

    <h3 style="color:#bbb;font-size:14px;font-weight:500;margin:16px 0 6px;">Vercel</h3>
    <p>
      Das Hosting dieser Website erfolgt über
      <strong style="color:#ddd;">Vercel, Inc.</strong> (San Francisco, USA).
      Beim Aufruf der Website werden serverseitig temporäre Zugriffslogs erzeugt (IP-Adresse,
      User-Agent, Zeitstempel). Diese werden von Vercel gemäß ihrer Datenschutzrichtlinie verarbeitet.
      Mehr Informationen: <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener" style="color:#4d9fff;">vercel.com/legal/privacy-policy</a>
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">4. Cookies / Lokaler Speicher</h2>
    <p>
      Supabase speichert nach dem Login ein Session-Token im
      <code style="background:#1a1a1a;padding:1px 6px;border-radius:4px;font-size:13px;">localStorage</code>
      deines Browsers. Dieses Token ist technisch notwendig für die Authentifizierung
      und wird nicht für Tracking verwendet. Es verfällt automatisch.
      Darüber hinaus werden keine Tracking-Cookies gesetzt.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">5. Deine Rechte</h2>
    <p>
      Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung
      deiner personenbezogenen Daten. Wende dich dazu an: <a href="mailto:[YOUR EMAIL]" style="color:#4d9fff;">[YOUR EMAIL]</a>
    </p>
    <p>
      Du hast außerdem das Recht, eine Beschwerde bei der zuständigen Datenschutzbehörde einzureichen.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">6. Kontolöschung</h2>
    <p>
      Zur Löschung deines Kontos und aller gespeicherten Daten wende dich bitte direkt an
      <a href="mailto:[YOUR EMAIL]" style="color:#4d9fff;">[YOUR EMAIL]</a>.
      (Self-service-Löschung ist in Planung.)
    </p>
  `)
}

// ─── Nutzungsbedingungen ───────────────────────────────────────────────────────

export function showNutzungsbedingungen() {
  legalShell('Nutzungsbedingungen', `
    <p style="color:#666;font-size:12px;margin-bottom:24px;padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:8px;">
      ⚠️ Platzhalter — vor dem ersten echten Nutzer durch rechtsgeprüfte Bedingungen ersetzen.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">1. Geltungsbereich</h2>
    <p>
      Diese Nutzungsbedingungen gelten für die Nutzung von <strong style="color:#ddd;">Marvin's Place</strong>
      unter der Adresse [YOUR DOMAIN]. Betreiber ist [YOUR NAME], [ADRESSE].
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">2. Registrierung</h2>
    <p>
      Für die Nutzung der meisten Funktionen ist ein Konto erforderlich. Die Registrierung
      erfordert eine gültige E-Mail-Adresse und ein Passwort. Du bist für die Sicherheit
      deiner Zugangsdaten selbst verantwortlich.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">3. Erlaubte Inhalte</h2>
    <p>Du darfst auf dieser Plattform nur Inhalte veröffentlichen, für die du die notwendigen Rechte besitzt.</p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">4. Verbotene Inhalte</h2>
    <p>Folgende Inhalte sind ausdrücklich verboten:</p>
    <ul style="padding-left:20px;margin:8px 0;">
      <li>Inhalte, die gegen geltendes Recht verstoßen (Strafrecht, Urheberrecht, etc.)</li>
      <li>Pornografische oder sexuell explizite Inhalte</li>
      <li>Gewaltverherrlichende, rassistische oder diskriminierende Inhalte</li>
      <li>Spam, Werbung oder automatisierte Masseninhalte</li>
      <li>Inhalte, die andere Nutzer belästigen, bedrohen oder verleumden</li>
      <li>Persönliche Daten Dritter ohne deren Einwilligung</li>
    </ul>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">5. Folgen bei Verstößen</h2>
    <p>
      Bei Verstoß gegen diese Bedingungen behalten wir uns vor, Inhalte zu entfernen und Konten
      ohne vorherige Ankündigung zu sperren oder zu löschen.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">6. Haftungsausschluss</h2>
    <p>
      Der Betreiber übernimmt keine Haftung für Inhalte, die von Nutzern veröffentlicht werden.
      Die Plattform wird ohne Gewähr auf Verfügbarkeit oder Fehlerfreiheit bereitgestellt.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">7. Änderungen</h2>
    <p>
      Diese Nutzungsbedingungen können jederzeit geändert werden. Wesentliche Änderungen werden
      per E-Mail kommuniziert.
    </p>

    <h2 style="color:#ddd;font-size:16px;font-weight:500;margin:24px 0 8px;">8. Anwendbares Recht</h2>
    <p>Es gilt deutsches Recht.</p>

    <p style="margin-top:32px;color:#555;font-size:13px;">Stand: ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p>
  `)
}
