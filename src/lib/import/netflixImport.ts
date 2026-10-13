import { db } from '../db'
import { getTmdbDetail, getTvSeasonEpisodes, searchTmdb, type MediaDetail } from '../tmdb'
import { addFromSearch, importFilm, importProgressHistory } from '../repo'
import { tmdbToResolved } from '../search'
import { queueSync } from '../sync'
import { groupNetflix, resolveProgress, type MovieWatch, type NetflixRow, type ResolvedProgress, type ShowWatch } from './netflix'
import { mapWithConcurrency } from './pool'
import { norm } from './text'
import type { Item, ItemStatus, SearchResult } from '../types'

/** Not finished and untouched this long → "pausiert" instead of "schaue". */
const PAUSED_AFTER_DAYS = 120

export interface PlannedShow {
  watch: ShowWatch
  match: SearchResult
  /** exact title hit; otherwise the user should double-check */
  confident: boolean
  detail: MediaDetail
  progress: ResolvedProgress
  status: ItemStatus
  /** library item this would update, if the show is already there */
  existing: Item | null
  selected: boolean
}

export interface PlannedMovie {
  watch: MovieWatch
  match: SearchResult
  confident: boolean
  exists: boolean
  selected: boolean
}

export interface NetflixPlan {
  shows: PlannedShow[]
  movies: PlannedMovie[]
  /** titles TMDB could not place */
  unmatched: string[]
}

/** Best search hit of the right kind; exact title match = confident. */
export function pickMatch(
  title: string,
  results: SearchResult[],
  kind: 'series' | 'movie',
): { match: SearchResult; confident: boolean } | null {
  const pool = results.filter((r) => r.kind === kind)
  if (!pool.length) return null
  const t = norm(title)
  const exact = pool.find(
    (r) => norm(r.title) === t || (r.original_title != null && norm(r.original_title) === t),
  )
  return exact ? { match: exact, confident: true } : { match: pool[0], confident: false }
}

export function showStatus(position: number, total: number, lastDate: string | null, now = Date.now()): ItemStatus {
  if (total > 0 && position >= total) return 'done'
  if (lastDate && now - Date.parse(lastDate) > PAUSED_AFTER_DAYS * 864e5) return 'paused'
  return 'watching'
}

/** 20:00 local on the viewing day — the CSV only has the date. */
export function dateToIso(date: string | null): string {
  if (!date) return new Date().toISOString()
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 20, 0, 0).toISOString()
}

/** Look everything up on TMDB and work out what an import would do — writes nothing. */
export async function analyzeNetflix(
  rows: NetflixRow[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<NetflixPlan> {
  const { shows, movies } = groupNetflix(rows)
  const library = (await db.items.toArray()).filter((i) => !i.deleted_at)
  const bySource = new Map(library.filter((i) => i.source === 'tmdb' && i.source_id).map((i) => [i.source_id!, i]))
  const titles = new Set(library.map((i) => norm(i.title)))

  let done = 0
  const total = shows.length + movies.length
  const tick = () => onProgress(++done, total)
  const unmatched: string[] = []

  const plannedShows = await mapWithConcurrency(
    shows,
    3,
    async (watch): Promise<PlannedShow | null> => {
      try {
        const hit = pickMatch(watch.title, await searchTmdb(watch.title), 'series')
        if (!hit) {
          unmatched.push(watch.title)
          return null
        }
        const detail = await getTmdbDetail(hit.match.source_id)
        const id = hit.match.source_id.slice(3)
        const needed = [...new Set(watch.entries.map((e) => e.season))].filter((n) =>
          detail.seasons.some((s) => s.number === n),
        )
        const episodes = new Map<number, { number: number; name: string }[]>()
        await Promise.all(
          needed.map(async (n) => episodes.set(n, await getTvSeasonEpisodes(id, n).catch(() => []))),
        )

        const progress = resolveProgress(watch.entries, detail.seasons, episodes)
        if (progress.position <= 0) {
          unmatched.push(watch.title)
          return null
        }
        const total = detail.seasons.reduce((n, s) => n + s.episodeCount, 0)
        const existing = bySource.get(hit.match.source_id) ?? null
        const ahead = !existing || progress.position > existing.current_position
        return {
          watch,
          match: hit.match,
          confident: hit.confident,
          detail,
          progress,
          status: showStatus(progress.position, total, watch.lastDate),
          existing,
          selected: hit.confident && ahead,
        }
      } catch (e) {
        console.warn('[netflix] show failed', watch.title, e)
        unmatched.push(watch.title)
        return null
      }
    },
    tick,
  )

  const plannedMovies = await mapWithConcurrency(
    movies,
    5,
    async (watch): Promise<PlannedMovie | null> => {
      try {
        const hit = pickMatch(watch.title, await searchTmdb(watch.title), 'movie')
        if (!hit) {
          unmatched.push(watch.title)
          return null
        }
        const exists = bySource.has(hit.match.source_id) || titles.has(norm(hit.match.title)) || titles.has(norm(watch.title))
        return { watch, match: hit.match, confident: hit.confident, exists, selected: hit.confident && !exists }
      } catch (e) {
        console.warn('[netflix] movie failed', watch.title, e)
        unmatched.push(watch.title)
        return null
      }
    },
    tick,
  )

  return {
    shows: plannedShows.filter((s): s is PlannedShow => !!s),
    movies: plannedMovies.filter((m): m is PlannedMovie => !!m),
    unmatched,
  }
}

export interface NetflixResult {
  showsAdded: number
  showsUpdated: number
  moviesAdded: number
  failed: string[]
}

/** Apply the selected part of the plan. */
export async function runNetflixImport(
  plan: NetflixPlan,
  opts: { userId: string; onProgress?: (done: number, total: number) => void },
): Promise<NetflixResult> {
  const shows = plan.shows.filter((s) => s.selected)
  const movies = plan.movies.filter((m) => m.selected)
  const result: NetflixResult = { showsAdded: 0, showsUpdated: 0, moviesAdded: 0, failed: [] }
  const total = shows.length + movies.length
  let done = 0

  for (const s of shows) {
    try {
      const steps = s.progress.steps.map((x) => ({ to: x.to, at: dateToIso(x.date) }))
      if (s.existing) {
        await importProgressHistory(s.existing, steps, s.status)
        result.showsUpdated++
      } else {
        const item = await addFromSearch(s.match, {
          userId: opts.userId,
          status: 'planned',
          resolved: tmdbToResolved(s.detail),
        })
        await importProgressHistory(item, steps, s.status)
        result.showsAdded++
      }
    } catch (e) {
      console.warn('[netflix] import failed', s.watch.title, e)
      result.failed.push(s.watch.title)
    }
    opts.onProgress?.(++done, total)
  }

  for (const m of movies) {
    try {
      await importFilm({
        userId: opts.userId,
        title: m.match.title,
        year: m.match.year,
        posterUrl: m.match.poster_url,
        source: 'tmdb',
        sourceId: m.match.source_id,
        status: 'done',
        rating: null,
        watchedAt: m.watch.date ? dateToIso(m.watch.date) : null,
      })
      result.moviesAdded++
    } catch (e) {
      console.warn('[netflix] film failed', m.watch.title, e)
      result.failed.push(m.watch.title)
    }
    opts.onProgress?.(++done, total)
  }

  queueSync(300)
  return result
}
