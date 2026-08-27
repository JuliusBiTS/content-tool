import { supabase } from './supabase'
import { db } from './db'
import { patchItemFields } from './repo'
import { realSeasons } from './progress'
import type { EpisodeMeta, Item, ShowCache } from './types'

const IMG = 'https://image.tmdb.org/t/p'
const img = (path: string | null | undefined, size: string) =>
  path ? `${IMG}/${size}${path}` : null

const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const AIRING_FRESH_MS = 12 * 60 * 60 * 1000

/** numeric TMDB tv id, or null for non-TMDB / movie items */
export function tvId(item: Item): number | null {
  if (item.source !== 'tmdb' || !item.source_id?.startsWith('tv:')) return null
  const n = Number(item.source_id.slice(3))
  return Number.isFinite(n) ? n : null
}

async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('tmdb-search', { body })
  if (error) throw error
  return data as T
}

interface TmdbShow {
  status: string | null
  in_production: boolean
  tagline: string | null
  backdrop_path: string | null
  number_of_seasons: number
  next_episode_to_air: {
    season_number: number
    episode_number: number
    name: string
    air_date: string | null
  } | null
  seasons: { season_number: number }[]
  images?: { logos?: { file_path: string; iso_639_1: string | null }[] }
}

interface TmdbSeason {
  episodes: {
    season_number: number
    episode_number: number
    name: string
    overview: string
    air_date: string | null
    runtime: number | null
    still_path: string | null
  }[]
}

function pickLogo(show: TmdbShow): string | null {
  const logos = show.images?.logos ?? []
  const byLang = (l: string | null) => logos.find((x) => x.iso_639_1 === l)
  const chosen = byLang('de') ?? byLang('en') ?? byLang(null) ?? logos[0]
  return img(chosen?.file_path ?? null, 'w500')
}

async function fetchShow(id: number): Promise<ShowCache> {
  const show = await callFn<TmdbShow>({ mode: 'show', id })
  const seasonNums = (show.seasons ?? [])
    .map((s) => s.season_number)
    .filter((n) => n > 0)

  const seasons = await Promise.all(
    seasonNums.map((n) =>
      callFn<TmdbSeason>({ mode: 'season', id, season: n }).catch(() => null),
    ),
  )

  const episodes: EpisodeMeta[] = []
  for (const s of seasons) {
    for (const e of s?.episodes ?? []) {
      episodes.push({
        season: e.season_number,
        number: e.episode_number,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date || null,
        runtime: e.runtime ?? null,
        still: img(e.still_path, 'w300'),
      })
    }
  }

  return {
    tmdbId: id,
    status: show.status ?? null,
    inProduction: !!show.in_production,
    backdrop: img(show.backdrop_path, 'w1280'),
    logo: pickLogo(show),
    tagline: show.tagline || null,
    nextAir: show.next_episode_to_air
      ? {
          season: show.next_episode_to_air.season_number,
          number: show.next_episode_to_air.episode_number,
          name: show.next_episode_to_air.name,
          airDate: show.next_episode_to_air.air_date || null,
        }
      : null,
    episodes,
    fetchedAt: new Date().toISOString(),
  }
}

const inflight = new Map<number, Promise<ShowCache | null>>()

/** Cached show data; refetches when stale. Safe to call often. */
export async function getShow(item: Item, force = false): Promise<ShowCache | null> {
  const id = tvId(item)
  if (id == null) return null

  const cached = await db.shows.get(id)
  if (cached && !force) {
    const age = Date.now() - Date.parse(cached.fetchedAt)
    const limit = cached.inProduction ? AIRING_FRESH_MS : FRESH_MS
    if (age < limit) {
      void backfillItem(item, cached)
      return cached
    }
  }

  if (inflight.has(id)) return inflight.get(id)!
  const p = (async () => {
    try {
      const fresh = await fetchShow(id)
      await db.shows.put(fresh)
      await backfillItem(item, fresh)
      return fresh
    } catch (e) {
      console.warn('[shows] fetch failed', e)
      return cached ?? null
    } finally {
      inflight.delete(id)
    }
  })()
  inflight.set(id, p)
  return p
}

/** Copy backdrop / logo / tagline onto the item so they sync + show instantly next time. */
async function backfillItem(item: Item, show: ShowCache): Promise<void> {
  const metaPatch: Record<string, string> = {}
  const needBackdrop = !item.backdrop_url && !!show.backdrop
  if (!item.metadata.logo_url && show.logo) metaPatch.logo_url = show.logo
  if (!item.metadata.tagline && show.tagline) metaPatch.tagline = show.tagline

  if (needBackdrop || Object.keys(metaPatch).length) {
    await patchItemFields(item, {
      ...(needBackdrop ? { backdrop_url: show.backdrop } : {}),
      metadata: { ...item.metadata, ...metaPatch },
    })
  }
}

function absoluteOf(item: Item, season: number, number: number): number {
  let abs = 0
  for (const s of realSeasons(item)) {
    if (s.number < season) abs += s.episodeCount
    else if (s.number === season) return abs + number
  }
  return abs + number
}

export interface NextEpisode {
  season: number
  number: number
  name: string | null
  still: string | null
  runtime: number | null
  airDate: string | null
  /** true when it hasn't aired yet */
  upcoming: boolean
}

/** The episode the user would watch next, enriched from cache if available. */
export function nextEpisode(item: Item, show: ShowCache | null): NextEpisode | null {
  if (item.kind !== 'series' && item.kind !== 'anime') return null
  const nextAbs = item.current_position + 1

  // map absolute → season/number via known season sizes
  const seasons = realSeasons(item)
  let remaining = nextAbs
  let season = seasons[0]?.number ?? 1
  let number = nextAbs
  for (const s of seasons) {
    if (remaining <= s.episodeCount) {
      season = s.number
      number = remaining
      break
    }
    remaining -= s.episodeCount
  }

  const ep = show?.episodes.find((e) => e.season === season && e.number === number)
  const air = ep?.airDate ? Date.parse(ep.airDate) : NaN
  return {
    season,
    number,
    name: ep?.name ?? null,
    still: ep?.still ?? null,
    runtime: ep?.runtime ?? null,
    airDate: ep?.airDate ?? null,
    upcoming: Number.isFinite(air) && air > Date.now(),
  }
}

export interface AiringEntry {
  item: Item
  episode: EpisodeMeta
  /** absolute episode index, for "already watched?" checks */
  absolute: number
  airDate: string
  watched: boolean
}

/**
 * Episodes of the given shows airing within [−daysBack, +daysAhead] days.
 * Sorted by air date ascending.
 */
export async function airingWindow(
  items: Item[],
  daysBack = 10,
  daysAhead = 21,
): Promise<AiringEntry[]> {
  const now = Date.now()
  const lo = now - daysBack * 864e5
  const hi = now + daysAhead * 864e5

  const rows: AiringEntry[] = []
  for (const item of items) {
    const id = tvId(item)
    if (id == null) continue
    const show = await getShow(item)
    if (!show) continue
    for (const ep of show.episodes) {
      if (!ep.airDate) continue
      const t = Date.parse(ep.airDate)
      if (!Number.isFinite(t) || t < lo || t > hi) continue
      const absolute = absoluteOf(item, ep.season, ep.number)
      rows.push({
        item,
        episode: ep,
        absolute,
        airDate: ep.airDate,
        watched: item.current_position >= absolute,
      })
    }
  }
  return rows.sort((a, b) => a.airDate.localeCompare(b.airDate))
}
