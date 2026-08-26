# CLAUDE.md

MediaLog — mobil-first PWA zum Tracken von Serien/Filmen/Anime/Büchern. See `README.md` for full architecture.

## Commands

```bash
npm run dev      # dev server on :5173
npm run build    # tsc -b && vite build  (run before committing)
npm run lint     # oxlint
```

## Conventions

- **TypeScript is strict** + `verbatimModuleSyntax`: use `import type` for type-only imports.
- **Write path goes through `src/lib/repo.ts`** — never write Dexie directly from components. `repo` writes cache + outbox + event log together.
- **Reads use `useLiveQuery` hooks** in `src/hooks/useData.ts`.
- New progress/status/rating mutations must also append a row to `events` (append-only log; stats + sync depend on it).
- Positions are stored **absolute** (`current_position` = episodes watched / minutes / pages). Season↔episode conversion lives in `src/lib/progress.ts`.
- UI is German. Dark theme only. Design tokens in `src/index.css` (`@theme`).

## Backend

- Supabase migrations in `supabase/migrations/`. Every table: `user_id` + RLS `auth.uid() = user_id`.
- TMDB calls proxy through the `tmdb-search` edge function (token is a Supabase secret, never in the client).
- App runs in **local-only mode** when `VITE_SUPABASE_*` env is absent (no auth, no sync) — keep that path working.
