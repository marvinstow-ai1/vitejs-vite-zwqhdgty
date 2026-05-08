# Social App Refactor / Roadmap

> **Lebendes Dokument** — Master-Tracking läuft über das gleichnamige GitHub-Issue,
> Detail-Arbeit pro Phase in den jeweiligen Sub-Issues. Diese Datei ist der
> Repo-Spiegel für Offline-Lesbarkeit.

**Status-Legende:** `[x]` erledigt · `[~]` in Arbeit · `[ ]` offen · `[L]` später

---

## Push-Strategie / Branch-Management (WICHTIG)

### Regel: Nie ungeprüft auf Main pushen
- Alle aktiven Feature-Branches erst auf Main mergen, wenn:
  1. 0002 + 0003 appliziert UND verifiziert
  2. Legal-Platzhalter durch echte Daten ersetzt
  3. [YOUR-DOMAIN] in index.html ersetzt
  4. Storage-Buckets images, videos, headers, stories bestätigt
  5. Keine bekannten Crash-Risiken mehr
  6. Vercel Preview Deploy fehlerfrei

### Merge-Reihenfolge wenn bereit
1. RLS-Branch (nach 0002 + 0003 appliziert + verifiziert) — **erledigt** (PR #2 gemerged 2026-05-08)
2. Landing/Legal-Branch (nach Fill-in der Pflichtangaben)
3. Alle weiteren Feature-Branches einzeln reviewen
4. Main = immer deployable, nie broken

### Vor jedem Merge auf Main checken
- [x] 0002 appliziert + alle kritischen Flows getestet
- [x] 0003 appliziert + Storage-Buckets bestätigt
- [ ] [YOUR-DOMAIN] in index.html ersetzt
- [ ] Legal-Seiten: keine Platzhalter mehr
- [ ] /datenschutz: Plausible-Paragraph ergänzt
- [ ] Footer-Links überall vorhanden
- [ ] Keine .env-Secrets im Branch
- [ ] Vercel-Preview-Deploy fehlerfrei
- [ ] Mobile-Ansicht auf echtem Gerät oder DevTools geprüft

---

## Phase 1 — Architektur / Routing

- [x] main.js entlasten und aufteilen
- [x] Routing-Grundlogik herauslösen
- [x] zentrale App-Shell einführen
- [x] Utility-Funktionen auslagern
- [x] Page-Module anlegen (Feed, Profile, Explore, Settings, Board, Auth)
- [x] Single-SPA-Grundstruktur vorbereiten
- [x] offene Produktentscheidung: `/` = Home Feed / Login-Gate
- [x] init() zeigt showLanding() für unauthenticated User
- [ ] prüfen, ob feed.html / explore.html / profile.html entfernt werden sollen

## Phase 2 — Service Layer

- [x] alle Services extrahiert
- [x] echten Feed angebunden
- [x] Composer-Refresh
- [x] Realtime-Like via Service
- [x] doppelte Query-Logik in Pages reduziert
- [x] media.service.js angelegt
- [x] getFollowCounts() ruft supabase.rpc('get_follow_counts') auf
- [x] getProfilePublicStub() in profiles.service.js angelegt
- [x] getFollowers() + getFollowing() in profiles.service.js angelegt
- [x] loadExplorePosts() + loadExplorePostsMoods() in posts.service.js angelegt
- [x] showToast() in utils.js angelegt
- [ ] verbleibende Query-Logik in Pages prüfen
- [ ] Modal-/Overlay-Logik entkoppeln (`openRepostModal`, `openStoryViewer`)
- [ ] gemeinsame modals.js Schicht prüfen

## Phase 3 — RLS / Schema / Permissions ✅ ABGESCHLOSSEN

- [x] Audit + alle Docs angelegt
- [x] Step 1 appliziert: SECURITY DEFINER Helpers + 8 Performance-Indexe
- [x] 0001 / 0002 / 0003 appliziert und verifiziert
- [x] get_follow_counts() SECURITY DEFINER Helper vorbereitet
- [x] get_profile_public_stub() SECURITY DEFINER Helper vorbereitet

### In dieser Phase erledigt (Session 2026-05-08)
- [x] Storage-Buckets geprüft: images, videos, headers, stories, covers vorhanden
- [x] Storage-Uploads pfad-gated (`${userId}/...`) für images/videos/stories/covers
- [x] moodboard-Storage-Policies entfernt (anon insert/update/delete)
- [x] `moodboard_items` und `personal_items` Tabellen gedroppt (Karteileichen)
- [x] alle 12 kritischen Flows manuell getestet (Like, Repost, Follow, Story, …)
- [x] FK `stories.user_id → public.profiles.id` ergänzt (Bug-Fix für `stories?select=*,profiles(username)`-Embed)

### Offen
- [ ] getVisiblePostIds() aus Frontend entfernen (Code-Cleanup, jetzt durch RLS überflüssig)
- [ ] Follower-Counts-Fix verifizieren (get_follow_counts RPC)
- [ ] posts.visibility / boards.visibility / profile_privacy NOT NULL nach Backfill
- [ ] moodboard-Bucket selbst droppen (Policies sind weg, Bucket steht noch leer)

## Phase 4 — Kernfunktionen stabilisieren

- [x] Feed live
- [x] Feed-Interaktionen verkabelt
- [x] Like/Repost RLS-Fehler → Toast statt silent fail
- [x] Privatprofil-Zustand → "Profil ist privat" statt White Screen
- [x] Owner-Profil privat → dunkles Banner mit Link zu Settings
- [x] Follow/Unfollow-Fehler → Toast statt console.error
- [x] Feed leerer Zustand → atmosphärische Meldung + "Filter aufheben" Button
- [x] Follower-/Following-Modal auf Profilseite
- [x] Story-Viewer: leeres Array → "Story nicht verfügbar" statt Crash
- [x] Story-Viewer: null media_url → Overlay statt broken img
- [ ] Feed-Verhalten für eingeloggte User final definieren
- [ ] Explore weiter verfeinern (erster Stand live)
- [ ] Profilseite entkoppeln: Header / Boards / Stories / Reposts / Social Actions
- [ ] Board-Seite modularisieren
- [ ] Story-Workflow bereinigen
- [ ] Repost-Verhalten logisch vereinheitlichen
- [ ] doppelten Follow-/Visibility-Aufwand reduzieren

## Phase 5 — Mobile-first / CSS Cleanup

- [x] Feed-Grid mobile-first
- [x] Touch-Ziele vergrößert
- [x] Shimmer-Animation + Explore-Grid-Klassen in main.css
- [ ] Inline-Styles in main.css auslagern
- [ ] Profile-Header mobile-first vereinfachen
- [ ] Board-Grids mobil abstufen
- [ ] Modals für mobile Nutzung verbessern
- [ ] Bottom-Navigation und Touch-Ziele vereinheitlichen
- [ ] Desktop-lastige Layout-Reste identifizieren
- [ ] Feed-Grid im echten schmalen Viewport testen

## Phase 6 — Produktentscheidungen

- [x] Landing: `/` = Home Feed / Login-Gate
- [x] Social Graph: Follows + Follow-Requests für private Profile
- [x] Messages: nur Placeholder-Route
- [x] /messages Placeholder angelegt und in Router verdrahtet
- [ ] Follow-Request-UI: Pending-State, Withdraw, Accept/Reject
- [ ] Follow-Auto-Accept / Pending-Trigger
- [ ] Messages in Navigation erst zeigen wenn echte Funktion folgt

## Phase 7 — Trusted Actions / Edge Functions

- [x] Kandidaten identifiziert und geplant
- [x] notify.action.js seam angelegt
- [x] Repost-Atomizität geplant
- [x] Story-Expiry geplant
- [x] notifyAction() auf Edge Function `notify` umgestellt (Session 2026-05-08)
- [x] notifications_insert Policy gelöscht (0003)
- [ ] Edge-Function-Source mit deployed v2 synchronisieren (CORS-Handler aktuell nur live, nicht im Repo)
- [ ] Repost-Ablauf serverseitig atomar machen
- [ ] Story-Expiry per pg_cron oder scheduled Edge

## Phase 8 — Cleanup / Tech Debt

- [x] Roadmap im Repo dokumentiert
- [x] analytics.js — trackEvent() Wrapper angelegt
- [ ] getVisiblePostIds() entfernen — jetzt sicher (0002 live)
- [ ] Legacy-Dateien entfernen oder dokumentieren
- [ ] leere / ungenutzte Dateien prüfen (social.js, avatar.js etc.)
- [ ] Page-übergreifende Abhängigkeiten reduzieren
- [ ] zirkuläre Import-Risiken vermeiden
- [ ] main.js weiter verkleinern → nur App-Bootstrap + globaler State
- [ ] Modal-Logik aus feed.page.js in gemeinsame Schicht überführen

## Phase 9 — Fokus Mode

- [L] Fokus Mode als Toggle oder eigener Tab konzipieren
- [L] Entscheiden: privat-personalisiert oder kuratiert-öffentlich?
- [L] Kommentare im Fokus Mode ausblenden (nicht löschen)
- [L] UI extrem reduzieren: keine Badges, weniger Meta, größere Bilder
- [L] Dia-Modus / Lean-back-Modus ausarbeiten
- [L] Regelbasierte Mood-/Need-Erkennung (kein ML, nur Regeln)
- [L] Lieblingsbilder + Lieblingskategorien als Kurationsbasis
- [L] MVP: nur Lieblingsbilder + reduziertes UI — kein Algorithmus zuerst

## Phase 10 — Feature / UX / Design Backlog

### Ready / konkretisieren
- [ ] Feed bildfokussierter, weniger Social-Lärm
- [ ] Meta-Infos im Feed reduzieren (nur bei Interaktion zeigen)
- [ ] Calm UI für Bildkonsum weiterdenken
- [ ] Empty States atmosphärischer gestalten
- [ ] Touch-/Gesture-Ideen sammeln und priorisieren

### Kreative Features (je 1 Claude-Prompt wenn ready)
- [L] Ambient Mode weiterdenken
- [L] Pixel Animation Screensaver / Idle Mode
- [L] Interactive Noise Background
- [L] Cursor Trail (Design offen: Partikel, Pixel, Glitch?)
- [L] Haptic Feedback mobile
- [L] Share-Link pro Item
- [L] Quick-Add via URL
- [L] Daily Mood Check-in (UI-Konzept offen)
- [L] Time-of-Day Theme
- [L] Easter Eggs

### Mascot / Mood Motion System
- [L] Maskottchen als lebendiges Profil-Feature definieren
- [L] Behavior-System: idle, reaction, mood move, special dance
- [L] Mood-Zustände: happy, dreamy, chaotic, locked-in, sad, romantic, sleepy
- [L] Move-Palette pro Mood (User-definierbar)
- [L] Auto-Mode: Maskottchen wählt passend zur Stimmung
- [L] Intensity-Regler: ruhig / normal / extra
- [L] Reaction-Moves für Likes, Follows, Story Views, Guestbook
- [L] Rare/Special-Moves als freischaltbare Belohnungen
- [L] Inspirations-Liste (Fortnite/TikTok), rechtliche Prüfung
- [L] Eigene Original-Emotes statt nur Vorbilder

### Profile as Homepage
- [L] Profil als modulare Homepage
- [L] Profilblöcke: About, Links, Favorites, Boards, Pinned Post, Guestbook
- [L] Reihenfolge der Blöcke pro User anpassbar
- [L] Themes statt freiem CSS
- [L] Mood-/Status-Modul für Profilkopf
- [L] Lieblingsbilder/-Boards prominent
- [L] Guestbook / Profil-Kommentare
- [L] Musik-/Now-Playing-Modul
- [L] Sichtbarkeit pro Profilblock
- [L] Profil-Unterseiten (Start / Gallery / Journal / Links)

### Avatar / Identity Layer
- [L] Tamagotchi-/Pixel-Avatar (Pokémon Gen 1 Stil)
- [L] Avatar als lebendiges App-Element
- [L] Avatar-Reaktionen auf Mood, Aktivität, Tageszeit
- [L] Avatar-Customization

### Research / später
- [L] Mood-Algorithmus (hat vs. braucht)
- [L] Explore eher kuratiert
- [L] Recommender erst regelbasiert
- [L] Welche Features passen zum ruhigen Produktkern?

### Retention / Stickiness
- [L] Daily Mood Check-in
- [L] „Heute auf deinem Profil"-Bereich
- [L] Weekly creative prompts
- [L] Freischaltbare Themes/Frames/Mascot-Moves
- [L] Weekly recap / „while you were away"
- [L] Circles / kleine Vibe-Communities
- [L] Spotlight-Bereich
- [L] Collections / Boards als kuratierbar
- [L] Saisonale Events
- [L] Notifications nur verhaltensbasiert

## Phase 11 — Landing / Legal / Onboarding

### Erledigt
- [x] landing.page.js — atmosphärische Gäste-Landing
- [x] legal.page.js — /impressum, /datenschutz, /nutzungsbedingungen
- [x] router.js + main.js + auth.page.js — alles verdrahtet
- [x] auth.page.js — Legal-Footer, Avatar-Upload, Dark-Aesthetic
- [x] Signup Completed Event in auth.page.js getrackt

### ⚠️ Menschliche Aktion erforderlich (vor Main-Merge)
- [ ] [YOUR NAME] → echter Name
- [ ] [YOUR ADDRESS] → echte Adresse
- [ ] [YOUR EMAIL] → echte Kontaktadresse
- [ ] [YOUR DOMAIN] → echte Domain in legal.page.js
- [ ] [YOUR-DOMAIN] → echte Domain in index.html (Plausible Script)
- [ ] /datenschutz: Absatz zu Plausible Analytics ergänzen

### Tutorial / Guide Experience
- [ ] Eigene Guide-/Tutorial-Seite
- [ ] Kernbereiche: Profil, Feed, Explore, Posting, Interaktionen, Privacy
- [ ] Annotierte Mockup-Screens / Screenshots
- [ ] Kurze Feature-Cards (1 Nutzen + 1 Aktion)
- [ ] Erststart-Onboarding mit 3–5 interaktiven Schritten
- [ ] Replay-Funktion über Help-Button
- [ ] „Was ist neu?" / Feature-Update-Seite
- [ ] Mehr zeigen als Text erklären

### Nice-to-have
- [L] /about Seite
- [L] Onboarding-Screens nach erstem Login
- [L] E-Mail-Bestätigung bei Signup prüfen
- [L] Pre-Launch Waitlist / Invite-only Modus
- [L] Cookie-Banner wenn nötig

## Phase 12 — Admin / Analytics / Marketing Stack

### Erledigt
- [x] Supabase Studio für alle Tabellen, Auth, Storage, Logs
- [x] analytics.js — trackEvent() Wrapper
- [x] Plausible Script Tag in index.html (Domain-Platzhalter noch offen)
- [x] Events getrackt: Signup, Post Created, Like Given, Follow Action, Story Viewed, Explore Opened

### ⚠️ Menschliche Aktion erforderlich
- [ ] [YOUR-DOMAIN] in index.html durch echte Domain ersetzen

### Wenn erste User aktiv
- [ ] Plausible Dashboard beobachten
- [ ] Supabase Logs für DB-Performance beobachten
- [ ] KPIs definieren: DAU, Retention D1/D7/D30, Posts pro User

### Später / wenn Team wächst
- [L] Custom Admin Dashboard
- [L] Role-based Access für Moderation + Support
- [L] Content-Moderation-Queue
- [L] DSGVO-Auskunfts-Export für User-Daten
