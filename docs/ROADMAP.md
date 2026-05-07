# Social App Refactor / Roadmap

## Phase 1 — Architektur / Routing

- [x] main.js entlasten und in kleinere Verantwortungsbereiche aufteilen
- [x] Routing-Grundlogik aus der monolithischen Hauptdatei herauslösen
- [x] zentrale App-Shell für Navigation und Layout einführen
- [x] Utility-Funktionen in eigene Datei auslagern
- [x] erste klare Page-Module anlegen (Feed, Profile, Explore, Settings, Board, Auth)
- [x] Single-SPA-Grundstruktur vorbereiten
- [x] Legacy-HTMLs (`feed.html`, `explore.html`, `profile.html`) entfernt — nur noch `index.html`
- [x] offene Produktentscheidung festziehen: `/` = **Home Feed** für eingeloggte User, Login-Gate für Gäste (Phase 6)

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
- [ ] Feed-Verhalten für eingeloggte User final definieren
- [ ] Explore von Placeholder zu echter Discovery-Seite ausbauen
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

- [x] Landing-Verhalten (`/`): **Home Feed** (eingeloggt) / Login-Gate (Gast) — bereits Standardverhalten in `init()`
- [x] Social-Graph-Modell: **Follows + Follow-Requests für private Profile** — `friendships.status ∈ {accepted, pending}`, public-Profile auto-accept, `profile_privacy='private'` braucht Annahme durch den Owner
- [x] Messages-Scope: **Placeholder-Route** — `/messages` reserviert, echte DMs später
- [x] `/messages` Placeholder-Route angelegt (`pages/messages.page.js`, Route in `router.js`)
- [ ] Follow-Request-UI im Profil-Header (Pending-State, "Anfrage zurückziehen", Owner-Side "Akzeptieren / Ablehnen") — Folge-Phase, **erst nach RLS-Apply**
- [ ] Follow-Request-Auto-Accept-Logik server-/RLS-seitig festziehen: Insert in `friendships` → wenn Ziel-Profil `public/followers` → `status='accepted'`, sonst `status='pending'` (Trigger oder Edge Function)
- [ ] Messages in Sidebar/Bottombar einblenden, sobald echtes Surface existiert (heute bewusst nicht in Nav)

## Phase 7 — Trusted Actions / Edge Functions

- [ ] Notification-Erstellung als Edge Function (Body von `notifyAction()` ersetzen)
- [ ] Follow/Unfollow/Block-Side-Effects prüfen
- [ ] Repost-Ablauf atomar (`reposts` + `board_posts` + Notification)
- [ ] Story-Publishing / Story-Expiry serverseitig (pg_cron oder Edge)
- [ ] Explore-/Aggregation-Logik serverseitig bewerten

## Phase 8 — Cleanup / Tech Debt

- [ ] `interactions.service.js#createNotification` Re-Export entfernen, sobald keine Aufrufer
- [ ] `getVisiblePostIds()` entfernen, sobald RLS aktiv
- [ ] leere / nicht genutzte Dateien prüfen
- [ ] zirkuläre Import-Risiken vermeiden
- [ ] Modal-Logik aus `feed.page.js` in gemeinsame Schicht
