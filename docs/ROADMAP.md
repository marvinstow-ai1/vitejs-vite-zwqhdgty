# Social App Refactor / Roadmap

## Phase 1 — Architektur / Routing

- [x] main.js entlasten und in kleinere Verantwortungsbereiche aufteilen
- [x] Routing-Grundlogik aus der monolithischen Hauptdatei herauslösen
- [x] zentrale App-Shell für Navigation und Layout einführen
- [x] Utility-Funktionen in eigene Datei auslagern
- [x] erste klare Page-Module anlegen (Feed, Profile, Explore, Settings, Board, Auth)
- [x] Single-SPA-Grundstruktur vorbereiten
- [x] Legacy-HTMLs (`feed.html`, `explore.html`, `profile.html`) entfernt — nur noch `index.html`
- [ ] offene Produktentscheidung festziehen: `/` = Landing, Feed oder Redirect (Phase 6)

## Phase 2 — Service Layer / Datenzugriff

- [x] Supabase-Client-Konfiguration isoliert halten
- [x] Auth-Service ausgelagert
- [x] Profiles-Service angelegt (jetzt inkl. `getRelationshipStatus`, `getMyBlocks`)
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

- [x] komplettes RLS-Audit für alle genutzten Tabellen durchführen → `docs/PHASE3_RLS_AUDIT.md`
- [x] Migrations-Entwurf für RLS + Schema-Härtung → `supabase/migrations/0001_phase3_rls.sql`
- [x] Frontend-Sichtbarkeitslogik klar als UX-Filter markiert (`getVisiblePostIds`)
- [x] Trusted-Action-Seam für Notifications (`services/notify.action.js`) — single point für Phase-7-Migration
- [ ] Migration auf einer Supabase-Branch testen (manuell, nicht durch den Agent)
- [ ] RLS aktivieren, Policy für Policy:
  - [ ] profiles
  - [ ] posts
  - [ ] boards
  - [ ] board_posts
  - [ ] reposts
  - [ ] stories
  - [ ] story_views
  - [ ] friendships
  - [ ] blocks
  - [ ] likes
  - [ ] comments
  - [ ] notifications
- [ ] `posts.visibility` CHECK + Default + NOT NULL aktivieren
- [ ] `reposts.show_on_profile` Default + NOT NULL nach Backfill
- [ ] NULL-/Cascade-Verhalten bei Posts / Boards / Reposts / Zuordnungstabellen prüfen
- [ ] Storage-Bucket-RLS für `images`, `videos`, `headers`, `stories` setzen
- [ ] klären, ob `friendships` zu `follows` migriert oder erweitert werden soll (Phase 6 Antwort)
- [ ] prüfen, ob Reposts + `board_posts` aktuell redundanten Zustand erzeugen
- [ ] Like-/Comment-/Repost-/Board-Insert-Regeln an Post-Sichtbarkeit koppeln (im Migrations-Entwurf)
- [ ] Story-View-Insert-Regeln an Story-Sichtbarkeit koppeln (im Migrations-Entwurf)
- [ ] relevante Indexe für RLS-/Visibility-Queries prüfen (im Migrations-Entwurf)
- [ ] `getVisiblePostIds()` entfernen, sobald RLS scharf
- [ ] Notifications nicht mehr als reine Client-Vertrauenslogik (Phase 7 Edge Function)

## Phase 4 — Kernfunktionen stabilisieren

- [x] echten Feed-Inhalt in `showFeed()`
- [x] `loadFeedPosts()` an Feed-Rendering
- [x] Feed-Interaktionen (Like, Repost, Comment, Profil-Navigation, Mood-Filter)
- [x] Like/Repost RLS-Fehler → Toast statt silent fail
- [x] Privatprofil-Zustand → "Profil ist privat" statt White Screen
- [x] Story-Viewer: leere Liste abgefangen, null media_url guard, unavailable overlay
- [x] Feed leerer Mood-Filter → atmosphärischer Empty State statt generischer Meldung
- [x] Profil-Follow-Fehler → Toast statt console.error
- [x] Eigenes privates Profil → Hinweis-Banner mit Link zu Einstellungen
- [x] Follower-/Following-Liste als Modal (bottom sheet mobile, centered desktop)
  - Clickable Counts in Info-Panel
  - Avatar, Display Name, Username, Follow-Button pro Eintrag
  - Privates Profil → "Nur Follower können die Liste sehen"
- [x] Explore von Placeholder zu echter Discovery-Seite ausgebaut
  - Öffentliche Posts, nur Bilder/Videos (keine Embeds)
  - Mood-Filter-Bar
  - Masonry Grid, Skeleton-Loader, Empty State
  - Lightbox bei Tap/Klick
  - Pagination (Mehr entdecken)
- [ ] Feed-Verhalten für eingeloggte User final definieren
- [ ] Profilseite weiter entkoppeln (Header / Boards / Stories / Reposts / Social Actions)
- [ ] Board-Seite weiter modularisieren
- [ ] Story-Workflow weiter bereinigen
- [ ] Stories beziehungsbasiert statt global/noisy
- [ ] Repost-Verhalten logisch vereinheitlichen
- [ ] doppelten Follow-/Visibility-Aufwand in Services reduzieren

## Phase 5 — Mobile-first / CSS Cleanup

- [x] mobile-first Feed-Grid in CSS
- [x] größere Touch-Ziele für Feed-Interaktionen
- [ ] Inline-Styles schrittweise in `main.css` auslagern
- [ ] Profile-Header mobile-first vereinfachen
- [ ] Board-Grids mobil sauber abstufen
- [ ] Modals für mobile Nutzung verbessern
- [ ] Bottom-Navigation und Touch-Ziele weiter vereinheitlichen
- [ ] Desktop-lastige Layout-Reste umbauen
- [ ] Feed-Grid im echten schmalen Viewport testen

## Phase 6 — Produktentscheidungen

- [ ] Landing-Verhalten (`/`): Landing | Home Feed | Profil-Redirect
- [ ] Social-Graph-Modell: echte Freundschaften | Follows | Follows + Requests
- [ ] Messages-Scope: jetzt | Placeholder-Route | später

## Phase 7 — Trusted Actions / Edge Functions

- [ ] Notification-Erstellung als Edge Function (Body von `notifyAction()` ersetzen)
- [ ] Follow/Unfollow/Block-Side-Effects prüfen
- [ ] Repost-Ablauf atomar (`reposts` + `board_posts` + Notification)
- [ ] Story-Publishing / Story-Expiry serverseitig (pg_cron oder Edge)
- [ ] Explore-/Aggregation-Logik serverseitig bewerten

## Phase 8 — Cleanup / Tech Debt

- [ ] `interactions.service.js#createNotification` Re-Export entfernen, sobald keine Aufrufer
- [ ] `getVisiblePostIds()` entfernen, sobald RLS aktiv (⚠️ NOCH NICHT entfernt — warte auf 0002 apply)
- [ ] leere / nicht genutzte Dateien prüfen
- [ ] zirkuläre Import-Risiken vermeiden
- [ ] Modal-Logik aus `feed.page.js` in gemeinsame Schicht

## Phase 12 — Analytics / Datenschutz

- [x] `src/js/analytics.js` angelegt — thin Plausible wrapper (`trackEvent()`)
- [x] Plausible Script-Tag in `index.html` eingefügt (domain = `[YOUR-DOMAIN]`)
- [x] Events verdrahtet:
  - Signup Completed → auth.page.js (nach Username-Setup)
  - Post Created → feed.page.js (Composer-Submit)
  - Like Given → feed.page.js (_handleLike)
  - Follow Action → profile.page.js (Follow-Button + Follow-List-Modal)
  - Story Viewed → feed.page.js (openStoryViewer render)
  - Explore Opened → explore.page.js (showExplorePage)
- [ ] `[YOUR-DOMAIN]` in index.html ersetzen (menschliche Aktion)
- [ ] /datenschutz um Plausible-Paragraph ergänzen (menschliche Aktion — legal.page.js fehlt noch)
- [ ] Cookie-Banner prüfen (Plausible braucht keinen — DSGVO-konform ohne Cookies)
