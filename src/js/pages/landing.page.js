import { navigate } from '../router.js'
import { legalFooterHtml } from './legal.page.js'

// Curated gradient blocks stand in for real image previews.
// When real content exists these could be replaced with a live mosaic query.
const PREVIEW_MOODS = [
  { bg: 'linear-gradient(135deg,#1a0a2e,#3a1060)', mood: 'dark' },
  { bg: 'linear-gradient(135deg,#0a1628,#1a3a5c)', mood: 'blue' },
  { bg: 'linear-gradient(135deg,#2e0a0a,#5c1a1a)', mood: 'red' },
  { bg: 'linear-gradient(135deg,#0a2e1a,#1a5c3a)', mood: 'forest' },
  { bg: 'linear-gradient(135deg,#1a1a0a,#3a3a0a)', mood: 'warm' },
  { bg: 'linear-gradient(135deg,#2e1a0a,#5c3a1a)', mood: 'amber' },
  { bg: 'linear-gradient(135deg,#0a2e2e,#1a4a4a)', mood: 'teal' },
  { bg: 'linear-gradient(135deg,#2e0a2e,#5c1a5c)', mood: 'purple' },
  { bg: 'linear-gradient(135deg,#0a0a0a,#2a2a2a)', mood: 'noir' },
  { bg: 'linear-gradient(135deg,#1a0a1a,#4a1a4a)', mood: 'violet' },
  { bg: 'linear-gradient(135deg,#2e2e0a,#5c5c1a)', mood: 'gold' },
  { bg: 'linear-gradient(135deg,#0a1a2e,#1a2e5c)', mood: 'navy' },
]

/**
 * Shows the guest landing page for unauthenticated visitors.
 * @param {function} onSignIn — called when the user clicks the CTA
 */
export function showLanding(onSignIn) {
  const app = document.querySelector('#app')
  app.innerHTML = `
    <div style="background:#0a0a0a;min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;">

      <!-- Nav -->
      <nav style="position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:linear-gradient(#0a0a0aee,transparent);">
        <span style="color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Marvin's Place</span>
        <button id="cta-nav" style="padding:8px 20px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:20px;cursor:pointer;font-size:13px;font-weight:500;backdrop-filter:blur(8px);">Anmelden</button>
      </nav>

      <!-- Hero -->
      <div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 24px 60px;min-height:100vh;">

        <!-- Mosaic background -->
        <div aria-hidden="true" style="position:absolute;inset:0;overflow:hidden;opacity:0.35;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;height:100%;transform:rotate(-4deg) scale(1.15);transform-origin:center;">
            ${PREVIEW_MOODS.map((m, i) => `
              <div style="background:${m.bg};aspect-ratio:1;border-radius:4px;animation:moodPulse ${3 + (i % 4) * 0.5}s ease-in-out infinite alternate;animation-delay:${i * 0.2}s;"></div>
            `).join('')}
          </div>
        </div>
        <!-- Fade overlay -->
        <div aria-hidden="true" style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 50%,transparent 0%,#0a0a0a 75%);"></div>

        <!-- Content -->
        <div style="position:relative;z-index:2;text-align:center;max-width:480px;">
          <p style="color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:16px;">Ein ruhiger Ort für Bilder</p>
          <h1 style="color:#fff;font-size:clamp(32px,8vw,52px);font-weight:700;line-height:1.1;margin-bottom:20px;letter-spacing:-.02em;">Kuratiere deine<br>visuelle Welt.</h1>
          <p style="color:rgba(255,255,255,0.5);font-size:15px;line-height:1.6;margin-bottom:36px;max-width:360px;margin-inline:auto;">
            Teile Bilder und Videos. Erstelle Boards. Folge Leuten, deren Stil dich interessiert. Kein Algorithmus-Lärm.
          </p>
          <button id="cta-hero" style="display:inline-flex;align-items:center;gap:10px;padding:14px 32px;background:#fff;color:#000;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:-.01em;">
            Jetzt starten
            <span style="font-size:18px;line-height:1;">→</span>
          </button>
          <p style="color:rgba(255,255,255,0.2);font-size:12px;margin-top:16px;">Kostenlos · Keine Werbung</p>
        </div>
      </div>

      <!-- Features strip (minimal, 3 items only) -->
      <section style="padding:48px 24px;background:#0d0d0d;border-top:1px solid #1a1a1a;">
        <div style="max-width:640px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:32px;">
          ${[
            { icon: '🖼', title: 'Boards', desc: 'Sammel Posts in thematischen Boards, öffentlich oder privat.' },
            { icon: '👁', title: 'Stories', desc: 'Teile flüchtige Momente — verschwinden nach 24 Stunden.' },
            { icon: '🔒', title: 'Privatsphäre', desc: 'Wähle für jeden Post, wer ihn sehen darf.' },
          ].map(f => `
            <div>
              <div style="font-size:28px;margin-bottom:10px;">${f.icon}</div>
              <div style="color:#ddd;font-size:14px;font-weight:500;margin-bottom:6px;">${f.title}</div>
              <div style="color:#555;font-size:13px;line-height:1.5;">${f.desc}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- CTA bottom -->
      <section style="padding:64px 24px;text-align:center;">
        <h2 style="color:#fff;font-size:22px;font-weight:600;margin-bottom:16px;">Bereit?</h2>
        <p style="color:#555;font-size:14px;margin-bottom:28px;">Konto anlegen dauert eine Minute.</p>
        <button id="cta-bottom" style="padding:13px 30px;background:#fff;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Jetzt registrieren</button>
      </section>

      ${legalFooterHtml()}
    </div>

    <style>
      @keyframes moodPulse {
        from { opacity: .6; }
        to   { opacity: 1; }
      }
    </style>`

  const signIn = () => onSignIn()
  app.querySelector('#cta-nav').addEventListener('click', signIn)
  app.querySelector('#cta-hero').addEventListener('click', signIn)
  app.querySelector('#cta-bottom').addEventListener('click', signIn)

  app.querySelectorAll('[data-nav]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.nav) })
  })
}
