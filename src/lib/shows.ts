import { supabase } from './supabase'
import { db } from './db'
import { patchItemFresh, recordEvent } from './repo'
import { realSeasons } from './progress'
import {
  isAiring,
  isFresh,
  mergeEpisodes,
  planItemUpdate,
  planSeasonFetch,
} from './showLogic'
import type { EpisodeMeta, Item, SeasonMeta, ShowCache } from './types'

const IMG = 'https://image.tmdb.org/t/p'
const img = (path: string | null | undefined, size: string) =>
  path ? `${IMG}/${size}${path}` : null

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

interface TmdbEp {
  season_number: number
  episode_number: number
  name: string
  air_date: string | null
}

interface TmdbShow {
  status: string | null
  in_production: boolean
  tagline: string | null
  backdrop_path: string | null
  next_episode_to_air: TmdbEp | null
  last_episode_to_air: TmdbEp | null
  seasons: { season_number: number; name: string; episode_count: number }[]
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

const toAir = (e: TmdbEp | null) =>
  e
    ? {
        season: e.season_number,
        number: e.episode_number,
        name: e.name,
        airDate: e.air_date || null,
      }
    : null

/**
 * One show payload (1 request) + only the seasons that actually need a refresh.
 * `probe` skips the episode lists for shows that are not airing.
 */
async function fetchShow(
  id: number,
  cached: ShowCache | undefined,
  probe: boolean,
): Promise<ShowCache> {
  const show = await callFn<TmdbShow>({ mode: 'show', id })

  const seasons: SeasonMeta[] = (show.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      number: s.season_number,
      name: s.name || `Staffel ${s.season_number}`,
      episodeCount: s.episode_count,
    }))

  const nextAir = toAir(show.next_episode_to_air)
  const lastAir = toAir(show.last_episode_to_air)
  const base = {
    tmdbId: id,
    status: show.status ?? null,
    inProduction: !!show.in_production,
    backdrop: img(show.backdrop_path, 'w1280'),
    logo: pickLogo(show),
    tagline: show.tagline || null,
    nextAir,
    lastAir,
    seasons,
    fetchedAt: new Date().toISOString(),
  }

  if (probe && !isAiring(base)) {
    return { ...base, episodes: cached?.episodes ?? [], full: cached?.full ?? false }
  }

  const refetch = planSeasonFetch(cached, seasons, {
    nextSeason: nextAir?.season,
    lastSeason: lastAir?.season,
    inProduction: base.inProduction,
  })

  const results = await Promise.all(
    refetch.map((n) =>
      callFn<TmdbSeason>({ mode: 'season', id, season: n })
        .then((r) => ({ n, r }))
        .catch(() => null),
    ),
  )

  const ok: number[] = []
  const fetched: EpisodeMeta[] = []
  for (const res of results) {
    if (!res) continue
    ok.push(res.n)
    for (const e of res.r.episodes ?? []) {
      fetched.push({
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
    ...base,
    episodes: mergeEpisodes(
      cached?.episodes,
      fetched,
      ok,
      seasons.map((s) => s.number),
    ),
    full: true,
  }
}

/** Never let a lightweight probe overwrite a full episode list. */
async function saveShow(fresh: ShowCache): Promise<ShowCache> {
  return db.transaction('rw', db.shows, async () => {
    const cur = await db.shows.get(fresh.tmdbId)
    const merged =
      cur && (cur.full ?? cur.episodes.length > 0) && !fresh.full
        ? { ...fresh, episodes: cur.episodes, full: true }
        : fresh
    await db.shows.put(merged)
    return merged
  })
}

const inflight = new Map<string, Promise<ShowCache | null>>()

export interface GetShowOptions {
  /** ignore freshness (still only refetches what changed) */
  force?: boolean
  /** lightweight check — no episode lists unless the show is airing */
  probe?: boolean
}

/** Cached show data; refetches when stale. Safe to call often. */
export async function getShow(
  item: Item,
  opts: GetShowOptions = {},
): Promise<ShowCache | null> {
  const id = tvId(item)
  if (id == null) return null
  const probe = !!opts.probe

  const cached = await db.shows.get(id)
  if (cached && !opts.force && isFresh(cached, !probe)) {
    void syncItemFromShow(item.id, cached)
    return cached
  }

  const key = `${id}:${probe ? 'p' : 'f'}`
  const running = inflight.get(key)
  if (running) return running

  const p = (async () => {
    try {
      const fresh = await saveShow(await fetchShow(id, cached, probe))
      await syncItemFromShow(item.id, fresh)
      return fresh
    } catch (e) {
      console.warn('[shows] fetch failed', e)
      return cached ?? null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

/**
 * Keep the user's item in step with TMDB: artwork, season sizes / total, and
 * pull a finished show back to "watching" when a new episode has aired.
 * Re-reads the row so it never reverts a fresh user action.
 */
export async function syncItemFromShow(itemId: string, show: ShowCache): Promise<void> {
  let reactivated = false
  const updated = await patchItemFresh(itemId, (cur) => {
    const plan = planItemUpdate(cur, show)
    reactivated = plan.reactivated
    return plan.patch
  })
  if (updated && reactivated) {
    await recordEvent(updated, 'status', null, null, 'watching')
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
 * Episodes of the given shows airing within [−daysBack, +daysAhead] days,
 * sorted by air date. Reads the local cache only — keeping that cache fresh
 * is the refresher's job (see airing.ts), so this is instant and offline-safe.
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
    const show = await db.shows.get(id)
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
