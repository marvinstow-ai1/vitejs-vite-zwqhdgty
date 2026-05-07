# Social App Refactor / Roadmap

## Phase 1 — Architektur / Routing

- [x] main.js entlasten und in kleinere Verantwortungsbereiche aufteilen
- [x] Routing-Grundlogik aus der monolithischen Hauptdatei herauslösen
- [x] zentrale App-Shell für Navigation und Layout einführen
- [x] Utility-Funktionen in eigene Datei auslagern
- [x] erste klare Page-Module anlegen (Feed, Profile, Explore, Settings, Board, Auth)
- [x] Single-SPA-Grundstruktur vorbereiten
- [x] Legacy-HTMLs (`feed.html`, `explore.html`, `profile.html`) entfernt — nur noch `index.html`
- [x] Landing-Verhalten festgezogen: `/` = Home Feed für eingeloggte User, Login-Gate für Gäste

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
- [x] Trusted-Action-Seam für Notifications (`services/notify.action.js`)
- [x] Live-State-Audit gegen tatsächlichen Stand der Supabase-Datenbank
- [x] Apply-Plan dokumentiert (`docs/PHASE3_APPLY_PLAN.md`)
- [x] Verification-Pass dokumentiert (`docs/PHASE3_VERIFICATION.md`)
- [x] Step 1 angewendet: SECURITY-DEFINER-Helper (`is_following`, `is_blocked_either_way`, `can_view_post`) + RLS-Performance-Indexe → `phase3_visibility_helpers_and_indexes`
- [x] Strikte Policies paste-ready vorbereitet → `supabase/migrations/0002_phase3_strict_policies.sql`
- [x] Storage-Bucket-Lücke identifiziert (Upload-Policies ohne Pfadprüfung) → `supabase/migrations/0003_phase3_storage_policies.sql`
- [ ] Step 2 anwenden: `0002_phase3_strict_policies.sql` durch Mensch reviewen + applizieren
  - schließt Lücken in: `profiles`, `board_posts`, `reposts`, `likes`, `comments`, `story_views`, `notifications` (INSERT)
  - bereits strikt (kein Handlungsbedarf): `posts_select_visibility`, `stories_select_visibility`, `boards`, `friendships` (own), `blocks_*_own`, `notifications` (SELECT/UPDATE/DELETE)
- [ ] Step 3 anwenden: `0003_phase3_storage_policies.sql` (Pfad-Prefix-Check für Uploads)
- [ ] Frontend-Sichtbarkeitslogik final entfernen (`getVisiblePostIds()`) — nach Step 2
- [ ] Profilseite: graceful "Profil ist privat"-Zustand wenn `getProfileByUsername()` nach Step 2 `null` liefert
- [ ] Follower-Counts auf fremden Profilen reparieren (eigenständiger Follow-up — durch `friendships`-SELECT-Policy heute auf 0/0 limitiert)
- [ ] `posts.visibility` / `boards.visibility` / `profile_privacy` `NOT NULL` aktivieren nach Backfill
- [ ] `moodboard`-Bucket-Permissive-Policies entfernen, falls nicht mehr in Benutzung

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

- [x] Landing-Verhalten (`/`): Home Feed für eingeloggte User, Login-Gate für Gäste
- [x] Social-Graph-Modell: Follows + Follow-Requests für private Profile
- [x] Messages-Scope: nur Placeholder-Route bei `/messages`
- [ ] Follow-Request-UI (Pending / Withdraw / Accept-Reject) ergänzen
- [ ] Auto-Accept-Trigger für öffentliche Profile DB-seitig
- [ ] Messages-Navigation erst zeigen, wenn echte Funktion folgt

## Phase 7 — Trusted Actions / Edge Functions

- [ ] Notification-Erstellung als Edge Function (Body von `notifyAction()` ersetzen) — danach `notifications_insert`-Policy entfernen
- [ ] Follow/Unfollow/Block-Side-Effects prüfen
- [ ] Repost-Ablauf atomar (`reposts` + `board_posts` + Notification)
- [ ] Story-Publishing / Story-Expiry serverseitig (pg_cron oder Edge)
- [ ] Explore-/Aggregation-Logik serverseitig bewerten

## Phase 8 — Cleanup / Tech Debt

- [ ] `interactions.service.js#createNotification` Re-Export entfernen, sobald keine Aufrufer
- [ ] `getVisiblePostIds()` entfernen, sobald RLS Step 2 aktiv
- [ ] leere / nicht genutzte Dateien prüfen
- [ ] zirkuläre Import-Risiken vermeiden
- [ ] Modal-Logik aus `feed.page.js` in gemeinsame Schicht
