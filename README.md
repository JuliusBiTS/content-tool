# MediaLog

Ein schneller, mobil-first Fortschritts-Tracker für **Serien, Filme, Anime und Bücher**.
Kerngedanke: unterwegs mit **einem Tap** loggen, wo man gerade steht.

- **PWA** (installierbar, offline-fähig) – Vite + React + TypeScript
- **Local-first**: schreibt zuerst in IndexedDB (Dexie), synchronisiert im Hintergrund zu Supabase
- **Append-only Event-Log** → konfliktfreier Sync + Statistik (Heatmap, Streak) quasi gratis
- **Metadaten**: TMDB (Serien/Filme, via Edge-Function-Proxy), AniList (Anime), OpenLibrary (Bücher)
- **Multi-User-ready**: jede Zeile hat `user_id`, Row Level Security ab Tag 1 (aktuell Single-User)

## Stack

| Bereich | Wahl |
|---|---|
| Frontend | Vite 8, React 19, TypeScript, Tailwind v4 |
| PWA | `vite-plugin-pwa` (Workbox) |
| Lokaler Cache | Dexie (IndexedDB) + Outbox-Queue |
| Backend | Supabase (Postgres, Auth, RLS) |
| Metadaten-Proxy | Supabase Edge Function `tmdb-search` (Deno) |
| Hosting | Cloudflare Pages |

## Setup

### 1. Abhängigkeiten

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus dem Supabase-Dashboard
(**Project Settings → API**) eintragen. Ohne diese Werte startet die App im
**Local-only-Modus** (kein Login, kein Sync) – praktisch zum Entwickeln.

### 3. Supabase

```bash
supabase login
supabase link --project-ref <REFERENCE_ID>
supabase db push                       # Schema + RLS
supabase functions deploy tmdb-search  # TMDB-Proxy
supabase secrets set TMDB_TOKEN=<TMDB v4 Read Access Token>
```

TMDB-Token: [themoviedb.org](https://www.themoviedb.org) → Settings → API →
**API Read Access Token** (der lange `eyJ…`-String).

### 4. Entwickeln

```bash
npm run dev      # http://localhost:5173
npm run build    # Production-Build nach dist/
npm run lint
npm run icons     # PWA-Icons neu generieren (scripts/gen-icons.mjs)
```

## Deploy (Cloudflare Pages)

1. **Workers & Pages → Create → Pages → Connect to Git** → `JuliusBiTS/content-tool`
2. Build command `npm run build`, Output `dist`
3. Env-Variablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` setzen
4. Nach dem ersten Deploy die `*.pages.dev`-URL in
   **Supabase → Authentication → URL Configuration → Redirect URLs** eintragen

## Architektur

```
src/
  lib/
    types.ts        Domänentypen
    supabase.ts     Client (+ hasSupabaseConfig-Flag für Local-only)
    db.ts           Dexie: items, events, outbox, meta
    auth.tsx        AuthProvider (Supabase-Session oder lokale User-ID)
    repo.ts         Schreibpfad: Dexie + Outbox + Event-Log
    sync.ts         Sync-Engine: Outbox pushen, Deltas pullen (Cursor je Tabelle)
    progress.ts     Fortschrittslogik (abs. Folge ↔ Staffel/Episode, Labels)
    search.ts       Provider-Dispatch + Detail-Resolve
    tmdb.ts / anilist.ts / openlibrary.ts
  hooks/useData.ts  useLiveQuery-Hooks auf Dexie
  components/        ContinueCard (Kern-"+1"), AddSheet, QuickPositionSheet, …
  pages/            Home, Library, Stats, ItemDetail, Profile, Login
supabase/
  migrations/       Schema + RLS
  functions/tmdb-search/
```

### Sync-Modell

- Jeder Schreibvorgang: sofort nach Dexie **und** als Op in die `outbox`.
- `sync.ts` draint die Outbox der Reihe nach zu Supabase (`upsert` für Inserts,
  `update` für Patches), danach Delta-Pull über `updated_at` / `created_at`-Cursor.
- Events sind append-only → keine Konflikte. Scalar-Felder auf `items`:
  last-write-wins (Server-`updated_at`-Trigger).
- Beim Pull werden Zeilen mit offenen Outbox-Ops nicht überschrieben.
