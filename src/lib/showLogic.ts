import { totalEpisodes } from './progress'
import type { EpisodeMeta, Item, SeasonMeta, ShowCache } from './types'

/** Airing shows are re-checked often so weekly releases stay accurate. */
export const AIRING_FRESH_MS = 4 * 60 * 60 * 1000
/** Ended shows barely change. */
export const ENDED_FRESH_MS = 14 * 24 * 60 * 60 * 1000
/** A finished show whose next episode aired this recently counts as "new". */
export const REACTIVATE_WINDOW_DAYS = 45

/** TMDB gives a bare date, AniList / MangaDex a full timestamp. */
export const hasTime = (airDate: string): boolean => airDate.length > 10

/** "YYYY-MM-DD" in the viewer's timezone; bare dates are taken as they are. */
export function localDayKey(airDate: string): string {
  if (!hasTime(airDate)) return airDate
  const d = new Date(airDate)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Legacy caches (before `full` existed) always carried episodes. */
export const hasEpisodes = (c: Pick<ShowCache, 'full' | 'episodes'>): boolean =>
  c.full ?? c.episodes.length > 0

export const isAiring = (c: Pick<ShowCache, 'inProduction' | 'nextAir'>): boolean =>
  c.inProduction || !!c.nextAir

export function isFresh(c: ShowCache, wantFull: boolean, now = Date.now()): boolean {
  if (wantFull && !hasEpisodes(c)) return false
  const age = now - Date.parse(c.fetchedAt)
  return age < (isAiring(c) ? AIRING_FRESH_MS : ENDED_FRESH_MS)
}

/**
 * Which seasons need their episode list (re)fetched?
 * Everything on first load; afterwards only seasons whose size changed, the
 * ones around the next/last aired episode (dates and titles get edited), and
 * the newest season while the show is in production.
 */
export function planSeasonFetch(
  cached: ShowCache | undefined,
  seasons: SeasonMeta[],
  ctx: { nextSeason?: number | null; lastSeason?: number | null; inProduction: boolean },
): number[] {
  const want = seasons.filter((s) => s.number > 0).map((s) => s.number)
  if (!cached || !hasEpisodes(cached)) return want

  const have = new Map<number, number>()
  for (const e of cached.episodes) have.set(e.season, (have.get(e.season) ?? 0) + 1)
  const latest = Math.max(0, ...want)

  return want.filter((n) => {
    const expected = seasons.find((s) => s.number === n)?.episodeCount ?? 0
    if ((have.get(n) ?? 0) !== expected) return true
    if (n === ctx.nextSeason || n === ctx.lastSeason) return true
    return ctx.inProduction && n === latest
  })
}

/** Keep cached episodes for untouched seasons, swap in the freshly fetched ones. */
export function mergeEpisodes(
  cached: EpisodeMeta[] | undefined,
  fetched: EpisodeMeta[],
  refetchedOk: number[],
  validSeasons: number[],
): EpisodeMeta[] {
  const replaced = new Set(refetchedOk)
  const valid = new Set(validSeasons)
  const kept = (cached ?? []).filter((e) => !replaced.has(e.season) && valid.has(e.season))
  return [...kept, ...fetched].sort((a, b) => a.season - b.season || a.number - b.number)
}

export function seasonsDiffer(a: SeasonMeta[] | undefined, b: SeasonMeta[]): boolean {
  const norm = (list: SeasonMeta[] | undefined) =>
    (list ?? [])
      .filter((s) => s.number > 0)
      .map((s) => `${s.number}:${s.episodeCount}`)
      .sort()
      .join(',')
  return norm(a) !== norm(b)
}

/** season/number of the n-th (1-based, absolute) episode, using only real seasons. */
export function episodeAtAbsolute(
  seasons: SeasonMeta[],
  episodes: EpisodeMeta[],
  absolute: number,
): EpisodeMeta | null {
  let remaining = absolute
  for (const s of [...seasons]
    .filter((x) => x.number > 0 && x.episodeCount > 0)
    .sort((a, b) => a.number - b.number)) {
    if (remaining <= s.episodeCount) {
      return episodes.find((e) => e.season === s.number && e.number === remaining) ?? null
    }
    remaining -= s.episodeCount
  }
  return null
}

/**
 * The last few episodes the user has watched, oldest first, with their
 * summaries — spoiler-safe by construction (nothing past the user's position).
 */
export function recapEpisodes(
  item: Pick<Item, 'current_position' | 'metadata'>,
  episodes: EpisodeMeta[],
  count = 2,
): EpisodeMeta[] {
  const seasons = item.metadata.seasons ?? []
  const out: EpisodeMeta[] = []
  for (let abs = item.current_position; abs > 0 && out.length < count; abs--) {
    const ep = episodeAtAbsolute(seasons, episodes, abs)
    if (ep?.overview?.trim()) out.unshift(ep)
    else if (abs <= item.current_position - count - 2) break // don't dig forever
  }
  return out
}

type ShowFields = Pick<ShowCache, 'backdrop' | 'logo' | 'tagline' | 'episodes'> & {
  seasons?: SeasonMeta[]
}

/**
 * What should change on the user's item given fresh show data?
 * - fill in backdrop / logo / tagline once
 * - keep season sizes + total in step with TMDB (new episodes, new seasons)
 * - bring a finished show back to "watching" once a new episode has aired
 */
export function planItemUpdate(
  item: Item,
  show: ShowFields,
  now = Date.now(),
): { patch: Partial<Item>; reactivated: boolean } {
  const patch: Partial<Item> = {}
  const meta = { ...item.metadata }
  let metaChanged = false

  if (!item.backdrop_url && show.backdrop) patch.backdrop_url = show.backdrop
  if (!meta.logo_url && show.logo) {
    meta.logo_url = show.logo
    metaChanged = true
  }
  if (!meta.tagline && show.tagline) {
    meta.tagline = show.tagline
    metaChanged = true
  }

  let seasonsForLookup = item.metadata.seasons ?? []
  let caughtUpBefore = false
  const incoming = show.seasons ?? []

  if (incoming.length && seasonsDiffer(item.metadata.seasons, incoming)) {
    const oldTotal = totalEpisodes(item)
    caughtUpBefore = oldTotal != null && item.current_position >= oldTotal
    meta.seasons = incoming
    metaChanged = true
    seasonsForLookup = incoming
    const newTotal = incoming.reduce((n, s) => n + s.episodeCount, 0)
    if (newTotal > 0 && item.total_units !== newTotal) patch.total_units = newTotal
  }

  let reactivated = false
  if (item.status === 'done') {
    const total = incoming.length
      ? incoming.reduce((n, s) => n + s.episodeCount, 0)
      : (totalEpisodes(item) ?? 0)
    if (total > item.current_position) {
      const next = episodeAtAbsolute(seasonsForLookup, show.episodes, item.current_position + 1)
      const aired = next?.airDate ? Date.parse(next.airDate) : NaN
      if (Number.isFinite(aired) && aired <= now) {
        const ageDays = (now - aired) / 864e5
        if (caughtUpBefore || ageDays <= REACTIVATE_WINDOW_DAYS) {
          patch.status = 'watching'
          patch.finished_at = null
          reactivated = true
        }
      }
    }
  }

  if (metaChanged) patch.metadata = meta
  return { patch, reactivated }
}
