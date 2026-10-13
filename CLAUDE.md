# CLAUDE.md

MediaLog — mobil-first, "cinematic" PWA zum Tracken von Serien / Filmen / Anime / Manga / Büchern. See `README.md` for architecture.

## Commands

```bash
npm run dev      # dev server on :5173
npm run build    # tsc -b && vite build  (run before committing)
npm run lint     # oxlint
npm run test     # vitest run
npm run icons    # regenerate PWA icons
```

## Conventions

- **TypeScript is strict** + `verbatimModuleSyntax`: use `import type` for type-only imports.
- **Write path goes through `src/lib/repo.ts`** — never write Dexie directly from components. `repo` writes cache + outbox + event log together.
- **Reads use `useLiveQuery` hooks** (`src/hooks/useData.ts`, `useShow.ts`, `useAiring.ts`).
- Every progress/status/rating/rewatch mutation also appends a row to `events` (append-only; stats + sync depend on it).
- Positions are stored **absolute** (`current_position` = episodes / minutes / pages / chapters). Season↔episode math in `src/lib/progress.ts`.
- Media kinds: `series | movie | anime | manga | book`. Labels/emoji in `src/lib/kinds.ts`.
- UI is German. Dark theme only. Design tokens + cinema layer (grain, stage, ken-burns) in `src/index.css`.
- Per-item accent colour is sampled from the poster (`src/lib/palette.ts`) → CSS var `--scene-accent`.

## Caches (Dexie, never synced)

- `shows` — per-show TMDB data (status, next air, backdrop, logo, season sizes, episodes). `src/lib/shows.ts`; pure rules (freshness, which seasons to refetch, item patching, reactivation) in `src/lib/showLogic.ts` (unit-tested).
- `releases` — anime (AniList airing schedule, one batched call) and manga (MangaDex chapters, matched via the AniList id). `src/lib/releases.ts`; pure rules in `src/lib/releaseLogic.ts`. Calendar rows come from `calendarWindow()` in `airing.ts` (TMDB + releases merged).
- `palettes` — poster URL → dominant hex.

## Keeping data current

- `src/lib/refresh.ts` `refreshAll()` = data sync + air-date refresh. Auto-triggered by `useAutoRefresh` (start, foreground, online, 30 min, followed-set change); `{force:true}` from the buttons.
- Airing shows (TMDB, AniList, MangaDex) are re-checked automatically once a day, ended ones every 14 days (probe only); the manual buttons force it. Refetch is incremental per season.
- The calendar (`airingWindow`) reads the cache only — never fetch from render paths.
- Background jobs must patch via `repo.patchItemFresh` (re-reads the row) so they can't revert a user action.
- Live hooks must key on something that changes on refresh (`fetchedAt`), not row counts.

## Backend

- Supabase migrations in `supabase/migrations/`. Every table: `user_id` + RLS `auth.uid() = user_id`.
- TMDB proxied through the `tmdb-search` edge function (modes: search / detail / show / season / providers / recommendations / trending). Token is a Supabase secret.
- `notify-airing` edge function = cron target (daily is enough) for web push: TMDB series, AniList anime, MangaDex manga. Per-user cursor in `push_subscriptions.last_notified_at` (notify "since last run", no duplicates); quiet 22–07 Europe/Berlin. Fully covered by `src/test/notifyAiring.test.ts` using fakes in `src/test/stubs` (vitest aliases the Deno-style imports).
- Imports: `src/lib/import/` — Letterboxd (ratings) and Netflix (viewing history → items + dated progress events via `repo.importProgressHistory`). Shared helpers: `csv.ts`, `text.ts` (`norm`), `pool.ts`.
- "Weiterschauen" order = `src/lib/ordering.ts` (fresh release first, then the user's own last progress — not `updated_at`).
- App runs in **local-only mode** when `VITE_SUPABASE_*` is unresolvable, or with `localStorage['dev:localOnly']='1'` in dev. Keep that path working.
