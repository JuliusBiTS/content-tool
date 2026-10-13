import { describe, expect, it } from 'vitest'
import {
  AIRING_FRESH_MS,
  ENDED_FRESH_MS,
  isFresh,
  mergeEpisodes,
  planItemUpdate,
  planSeasonFetch,
  seasonsDiffer,
} from './showLogic'
import type { EpisodeMeta, Item, SeasonMeta, ShowCache } from './types'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 864e5).toISOString().slice(0, 10)
const daysAhead = (d: number) => new Date(NOW + d * 864e5).toISOString().slice(0, 10)

const ep = (season: number, number: number, airDate: string | null = null): EpisodeMeta => ({
  season,
  number,
  name: `S${season}E${number}`,
  overview: '',
  airDate,
  runtime: 45,
  still: null,
})

const seasons = (...counts: number[]): SeasonMeta[] =>
  counts.map((c, i) => ({ number: i + 1, name: `S${i + 1}`, episodeCount: c }))

const eps = (...counts: number[]): EpisodeMeta[] =>
  counts.flatMap((c, i) => Array.from({ length: c }, (_, n) => ep(i + 1, n + 1)))

const cache = (over: Partial<ShowCache> = {}): ShowCache => ({
  tmdbId: 1,
  status: 'Returning Series',
  inProduction: true,
  backdrop: null,
  logo: null,
  tagline: null,
  nextAir: null,
  episodes: [],
  full: true,
  fetchedAt: new Date(NOW).toISOString(),
  ...over,
})

const item = (over: Partial<Item> = {}): Item =>
  ({
    id: 'i1',
    user_id: 'u',
    kind: 'series',
    title: 'Show',
    sort_title: 'show',
    poster_url: null,
    backdrop_url: 'bd',
    source: 'tmdb',
    source_id: 'tv:1',
    status: 'watching',
    rating: null,
    current_position: 0,
    total_units: 18,
    metadata: { seasons: seasons(9, 9), logo_url: 'l', tagline: 't' },
    started_at: null,
    finished_at: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...over,
  }) as Item

describe('isFresh', () => {
  it('airing shows go stale after 4h', () => {
    const c = cache({ fetchedAt: new Date(NOW - AIRING_FRESH_MS - 1000).toISOString() })
    expect(isFresh(c, true, NOW)).toBe(false)
    expect(isFresh(cache({ fetchedAt: new Date(NOW - 3600e3).toISOString() }), true, NOW)).toBe(true)
  })

  it('ended shows stay fresh for two weeks', () => {
    const c = cache({
      inProduction: false,
      fetchedAt: new Date(NOW - (ENDED_FRESH_MS - 1000)).toISOString(),
    })
    expect(isFresh(c, true, NOW)).toBe(true)
  })

  it('a probe-only cache is not enough when the full list is wanted', () => {
    const probe = cache({ full: false, inProduction: false })
    expect(isFresh(probe, true, NOW)).toBe(false)
    expect(isFresh(probe, false, NOW)).toBe(true)
  })

  it('legacy caches without the flag count as full when they hold episodes', () => {
    const legacy = cache({ full: undefined, episodes: eps(3) })
    expect(isFresh(legacy, true, NOW)).toBe(true)
  })
})

describe('planSeasonFetch', () => {
  it('fetches everything on first load', () => {
    expect(planSeasonFetch(undefined, seasons(8, 10), { inProduction: false })).toEqual([1, 2])
  })

  it('skips unchanged ended seasons', () => {
    const c = cache({ inProduction: false, episodes: eps(8, 10) })
    expect(planSeasonFetch(c, seasons(8, 10), { inProduction: false })).toEqual([])
  })

  it('refetches a season whose episode count grew', () => {
    const c = cache({ inProduction: false, episodes: eps(8, 6) })
    expect(planSeasonFetch(c, seasons(8, 10), { inProduction: false })).toEqual([2])
  })

  it('always refreshes the newest season of an airing show + the next-to-air one', () => {
    const c = cache({ episodes: eps(8, 10, 8) })
    expect(planSeasonFetch(c, seasons(8, 10, 8), { inProduction: true, nextSeason: 3 })).toEqual([3])
  })

  it('picks up a brand-new season', () => {
    const c = cache({ inProduction: false, episodes: eps(8) })
    expect(planSeasonFetch(c, seasons(8, 6), { inProduction: false })).toEqual([2])
  })
})

describe('mergeEpisodes', () => {
  it('replaces only the seasons that were refetched successfully', () => {
    const cached = [...eps(2, 2)]
    const fresh = [ep(2, 1, '2026-10-01'), ep(2, 2, '2026-10-08'), ep(2, 3, '2026-10-15')]
    const merged = mergeEpisodes(cached, fresh, [2], [1, 2])
    expect(merged.filter((e) => e.season === 1)).toHaveLength(2)
    expect(merged.filter((e) => e.season === 2)).toHaveLength(3)
  })

  it('keeps cached episodes of a season whose refetch failed', () => {
    const merged = mergeEpisodes(eps(2, 2), [], [], [1, 2])
    expect(merged).toHaveLength(4)
  })

  it('drops seasons TMDB no longer lists', () => {
    expect(mergeEpisodes(eps(2, 2), [], [], [1])).toHaveLength(2)
  })
})

describe('seasonsDiffer', () => {
  it('ignores names, notices count changes and new seasons', () => {
    expect(seasonsDiffer(seasons(9, 9), [{ number: 1, name: 'x', episodeCount: 9 }, { number: 2, name: 'y', episodeCount: 9 }])).toBe(false)
    expect(seasonsDiffer(seasons(9, 9), seasons(9, 10))).toBe(true)
    expect(seasonsDiffer(seasons(9, 9), seasons(9, 9, 8))).toBe(true)
    expect(seasonsDiffer(undefined, seasons(9))).toBe(true)
  })
})

describe('planItemUpdate', () => {
  const base = { backdrop: null, logo: null, tagline: null, seasons: seasons(9, 9), episodes: eps(9, 9) }

  it('is a no-op when nothing changed (no update loops)', () => {
    const { patch, reactivated } = planItemUpdate(item(), base, NOW)
    expect(patch).toEqual({})
    expect(reactivated).toBe(false)
  })

  it('syncs a grown season and the total', () => {
    const { patch } = planItemUpdate(item(), { ...base, seasons: seasons(9, 10), episodes: eps(9, 10) }, NOW)
    expect(patch.total_units).toBe(19)
    expect(patch.metadata?.seasons?.[1].episodeCount).toBe(10)
  })

  it('fills backdrop/logo/tagline only when missing', () => {
    const bare = item({ backdrop_url: null, metadata: { seasons: seasons(9, 9) } })
    const { patch } = planItemUpdate(bare, { ...base, backdrop: 'B', logo: 'L', tagline: 'T' }, NOW)
    expect(patch.backdrop_url).toBe('B')
    expect(patch.metadata?.logo_url).toBe('L')
    expect(patch.metadata?.tagline).toBe('T')
  })

  it('does NOT reactivate a finished show while the new season is only announced', () => {
    const done = item({ status: 'done', current_position: 18 })
    const future = [...eps(9, 9), ep(3, 1, daysAhead(40)), ep(3, 2, daysAhead(47))]
    const { patch, reactivated } = planItemUpdate(
      done,
      { ...base, seasons: seasons(9, 9, 2), episodes: future },
      NOW,
    )
    expect(reactivated).toBe(false)
    expect(patch.status).toBeUndefined()
    expect(patch.total_units).toBe(20) // still tracks the new total
  })

  it('reactivates a caught-up show once the new season has started airing', () => {
    const done = item({ status: 'done', current_position: 18 })
    const aired = [...eps(9, 9), ep(3, 1, daysAgo(2)), ep(3, 2, daysAhead(5))]
    const { patch, reactivated } = planItemUpdate(
      done,
      { ...base, seasons: seasons(9, 9, 2), episodes: aired },
      NOW,
    )
    expect(reactivated).toBe(true)
    expect(patch.status).toBe('watching')
    expect(patch.finished_at).toBeNull()
  })

  it('catches the case where the season was announced earlier and the premiere is only now', () => {
    // seasons already synced on a previous run → no diff this time
    const done = item({
      status: 'done',
      current_position: 18,
      total_units: 20,
      metadata: { seasons: seasons(9, 9, 2), logo_url: 'l', tagline: 't' },
    })
    const aired = [...eps(9, 9), ep(3, 1, daysAgo(1)), ep(3, 2, daysAhead(6))]
    const { reactivated } = planItemUpdate(
      done,
      { ...base, seasons: seasons(9, 9, 2), episodes: aired },
      NOW,
    )
    expect(reactivated).toBe(true)
  })

  it('leaves a show alone that was marked done mid-way long ago', () => {
    const done = item({ status: 'done', current_position: 5 })
    const old = [...eps(9, 9)].map((e, i) => ({ ...e, airDate: daysAgo(900 - i) }))
    const { reactivated } = planItemUpdate(done, { ...base, episodes: old }, NOW)
    expect(reactivated).toBe(false)
  })

  it('never touches the status of a show that is not done', () => {
    const watching = item({ status: 'paused', current_position: 18 })
    const aired = [...eps(9, 9), ep(3, 1, daysAgo(1))]
    const { patch } = planItemUpdate(watching, { ...base, seasons: seasons(9, 9, 1), episodes: aired }, NOW)
    expect(patch.status).toBeUndefined()
  })
})
