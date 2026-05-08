# Social App Refactor / Roadmap

## Phase 1 — Architektur / Routing

- [x] main.js entlasten und in kleinere Verantwortungsbereiche aufteilen
- [x] Routing-Grundlogik aus der monolithischen Hauptdatei herauslösen
- [x] zentrale App-Shell für Navigation und Layout einführen
- [x] Utility-Funktionen in eigene Datei auslagern
- [x] erste klare Page-Module anlegen (Feed, Profile, Explore, Settings, Board, Auth)
- [x] Single-SPA-Grundstruktur vorbereiten
- [x] Legacy-HTMLs (`feed.html`, `explore.html`, `profile.html`) entfernt — nur noch `index.html`
- [x] offene Produktentscheidung: `/` = Landing für Gäste, Feed für eingeloggte User

## Phase 2 — Service Layer / Datenzugriff

- [x] Supabase-Client-Konfiguration isoliert halten
- [x] Auth-Service ausgelagert
- [x] Profiles-Service angelegt (inkl. `getRelationshipStatus`, `getMyBlocks`, `getFollowCounts`, `getProfilePublicStub`)
- [x] Posts-Service angelegt
- [x] Interactions-Service angelegt
- [x] Notifications-Service angelegt
- [x] Stories-Service angelegt
- [x] Boards-Service angelegt
- [x] direkte Query-Logik aus `main.js` weitgehend entfernt
- [x] echten Feed über den Service-Layer angebunden
- [x] Composer-Refresh nach erfolgreichem Post über Service-/Page-Struktur
- [x] Realtime-Like-Update über Service-Funktion
- [x] Composer-Insert geht jetzt über `insertPost()`
- [x] Profilseiten-Beziehungsabfrage in `getRelationshipStatus()` konsolidiert
- [x] Settings-Blocklisten-Lookup in `getMyBlocks()` konsolidiert
- [x] Board-Repost-Lookup nutzt `getBoardsByUser()` statt direkter Query
- [x] Storage-/Upload-Logik aus Pages in `media.service.js` ausgelagert (composer + header)
- [ ] Modal-/Overlay-Logik entkoppeln (`openRepostModal`, `openStoryViewer`, `openCommentsModal`)
- [ ] gemeinsame UI-/Modal-Schicht prüfen (`modals.js` oder ähnliches)

## Phase 3 — RLS / Schema / Permissions

- [x] komplettes RLS-Audit für alle genutzten Tabellen → `docs/PHASE3_RLS_AUDIT.md`
- [x] Step 1 appliziert: SECURITY DEFINER Helpers + 8 Performance-Indexe (`0001_phase3_rls.sql`)
- [x] `0002_phase3_strict_policies.sql` erstellt — enthält alle RLS-Policies + 2 neue SECURITY DEFINER Helper (`get_follow_counts`, `get_profile_public_stub`)
- [x] `0003_phase3_storage_policies.sql` erstellt — Storage-Policies für images, videos, headers, stories
- [x] Follower-Counts-Fix: `getFollowCounts()` nutzt jetzt `get_follow_counts()` RPC statt owner-scoped Query
- [x] Private-Profil-Fix: `profile.page.js` unterscheidet via `getProfilePublicStub()` zwischen "nicht gefunden" und "privat/followers-only"
- [x] Feed-Interaktion-Fix: Like/Repost zeigen Toast bei RLS-Fehler statt silent fail
- [ ] **0002 menschlich reviewen + im Supabase SQL Editor applizieren** ← nächster Schritt
- [ ] **0003 menschlich reviewen + applizieren** (Storage-Buckets images/videos/headers/stories bestätigen)
- [ ] `getVisiblePostIds()` entfernen, sobald RLS scharf
- [ ] `posts.visibility` / `boards.visibility` / `profile_privacy` nach Backfill auf NOT NULL
- [ ] ungenutzte moodboard-Bucket-Policies entfernen (falls vorhanden)
- [ ] Notifications nicht mehr als reine Client-Vertrauenslogik → Phase 7 Edge Function

## Phase 4 — Kernfunktionen stabilisieren

- [x] echten Feed-Inhalt in `showFeed()`
- [x] `loadFeedPosts()` an Feed-Rendering
- [x] Feed-Interaktionen (Like, Repost, Comment, Profil-Navigation, Mood-Filter)
- [x] Private Profilseite zeigt Lock-State statt White Screen
- [x] Story-Viewer non-owner: leere Viewer-Liste kein Crash (war bereits sicher via `|| []` + isOwn-Guard)
- [ ] Feed-Verhalten für eingeloggte User final definieren
- [ ] Explore von Placeholder zu echter Discovery-Seite ausbauen
- [ ] Profilseite weiter entkoppeln (Header / Boards / Stories / Reposts / Social Actions)
- [ ] Board-Seite weiter modularisieren
- [ ] Follow-Request-UI (Pending-State, Withdraw, Accept/Reject)
- [ ] Repost-Verhalten logisch vereinheitlichen

## Phase 5 — Mobile-first / CSS Cleanup

- [x] mobile-first Feed-Grid in CSS
- [x] größere Touch-Ziele für Feed-Interaktionen
- [ ] Inline-Styles schrittweise in `main.css` auslagern
- [ ] Profile-Header mobile-first vereinfachen
- [ ] Board-Grids mobil sauber abstufen
- [ ] Modals für mobile Nutzung verbessern
- [ ] Bottom-Navigation und Touch-Ziele weiter vereinheitlichen
- [ ] Feed-Grid im echten schmalen Viewport testen

## Phase 6 — Produktentscheidungen

- [x] Landing-Verhalten (`/`): Landing für Gäste, Feed für eingeloggte User
- [x] Social-Graph-Modell: Follows + Follow-Requests für private Profile
- [x] Messages: Placeholder-Route `/messages` angelegt
- [ ] Follow-Request-UI implementieren
- [ ] Follow-Auto-Accept / Pending-Trigger für private Profile

## Phase 7 — Trusted Actions / Edge Functions

- [x] `notify.action.js` Seam angelegt (single point für spätere Edge-Function-Migration)
- [x] Repost-Atomizität geplant
- [x] Story-Expiry geplant
- [ ] Notification-Erstellung als Edge Function (Body von `notifyAction()` ersetzen, `notifications_insert` Policy löschen)
- [ ] Repost-Ablauf atomar (`reposts` + `board_posts` + Notification in einer DB Function / Edge Function)
- [ ] Story-Expiry serverseitig (pg_cron oder scheduled Edge Function)

## Phase 8 — Cleanup / Tech Debt

- [x] Roadmap im Repo dokumentiert
- [ ] `getVisiblePostIds()` entfernen, sobald RLS aktiv
- [ ] `interactions.service.js#createNotification` Re-Export entfernen, sobald keine Aufrufer mehr
- [ ] leere / nicht genutzte Dateien prüfen
- [ ] zirkuläre Import-Risiken vermeiden
- [ ] Modal-Logik aus `feed.page.js` in gemeinsame Schicht

## Phase 9 — Fokus Mode

- [ ] Fokus Mode als Toggle oder eigener Tab konzipieren
- [ ] Kommentare im Fokus Mode ausblenden
- [ ] UI extrem reduzieren, größere Bilder
- [ ] Dia-Modus / Lean-back-Modus ausarbeiten
- [ ] Regelbasierte Mood-/Need-Erkennung (kein ML)
- [ ] Lieblingsbilder + Kategorien als Basis

## Phase 10 — Feature / UX / Design Backlog

### Ready / konkretisieren
- [ ] Feed bildfokussierter, weniger Lärm
- [ ] Meta-Infos im Feed reduzieren
- [ ] Calm UI weiterdenken
- [ ] Empty States atmosphärischer

### Kreative Features
- [ ] Ambient Mode weiterdenken
- [ ] Pixel Screensaver / Idle Mode
- [ ] Cursor Trail
- [ ] Haptic Feedback mobile
- [ ] Share-Link pro Item
- [ ] Daily Mood Check-in

### Avatar / Identity Layer
- [ ] Tamagotchi-/Pixel-Avatar weiterdenken
- [ ] Avatar-Reaktionen auf Mood, Aktivität, Tageszeit

## Phase 11 — Landing / Legal / Onboarding

### Pflicht
- [x] Gäste-Landing gestaltet: atmosphärisch, Mood-Mosaic, minimaler Text, starke CTA
- [x] `/impressum` — Pflichtangaben mit Platzhaltern [YOUR NAME], [YOUR ADDRESS] etc.
- [x] `/datenschutz` — Supabase, Vercel, localStorage-Session, Rechte, Kontolöschung
- [x] `/nutzungsbedingungen` — Regeln, verbotene Inhalte, Haftungsausschluss
- [x] Footer mit Legal-Links auf Landing, Login, Username-Setup, Impressum, Datenschutz, Nutzungsbedingungen
- [x] Login-Seite konsistent mit Landing-Ästhetik (dunkles Minimal-Design)
- [x] Signup-Flow: Username + optionales Profilbild
- [ ] **Platzhalter [YOUR NAME], [YOUR ADDRESS], [YOUR EMAIL], [YOUR DOMAIN] vor Main-Merge ersetzen**
- [ ] Cookie-Banner prüfen (derzeit nur localStorage-Session, kein Tracking → vermutlich kein Banner nötig)

### Nice-to-have
- [ ] /about Seite
- [ ] Onboarding-Screens nach erstem Login
- [ ] E-Mail-Bestätigung bei Signup prüfen (Supabase Email Auth)
- [ ] Pre-Launch Waitlist oder Invite-only Zugangsmodus
