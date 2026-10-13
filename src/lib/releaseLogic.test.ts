import { describe, expect, it } from 'vitest'
import {
  animeEntries,
  chaptersFromFeed,
  freshReleaseAt,
  isReleaseFresh,
  latestAired,
  nextRelease,
  normalizeAniListStatus,
  normalizeMangaDexStatus,
  planReleaseItemUpdate,
  releaseKey,
} from './releaseLogic'
import { hasTime, localDayKey } from './showLogic'
import type { Item, ReleaseCache } from './types'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const iso = (offsetDays: number, hour = 12) =>
  new Date(NOW + offsetDays * 864e5 + (hour - 12) * 3600e3).toISOString()

const item = (over: Partial<Item> = {}): Item =>
  ({
    id: 'i1',
    kind: 'anime',
    source: 'anilist',
    source_id: '966',
    title: 'Shin Chan',
    status: 'watching',
    current_position: 1350,
    total_units: null,
    metadata: {},
    ...over,
  }) as Item

const cache = (over: Partial<ReleaseCache> = {}): ReleaseCache => ({
  key: 'anime:966',
  kind: 'anime',
  status: 'releasing',
  entries: [],
  latest: null,
  total: null,
  fetchedAt: new Date(NOW).toISOString(),
  ...over,
})

describe('releaseKey', () => {
  it('only AniList anime / manga have release data', () => {
    expect(releaseKey(item())).toBe('anime:966')
    expect(releaseKey(item({ kind: 'manga', source_id: '30013' }))).toBe('manga:30013')
    expect(releaseKey(item({ source: 'tmdb' }))).toBeNull()
    expect(releaseKey(item({ kind: 'series' }))).toBeNull()
    expect(releaseKey(item({ source_id: null }))).toBeNull()
  })
})

describe('chaptersFromFeed', () => {
  const ch = (chapter: string | null, publishAt: string) => ({ attributes: { chapter, publishAt } })

  it('collapses English + German uploads of one chapter into the earliest release', () => {
    const { entries, latest } = chaptersFromFeed([
      ch('1195', '2026-10-11T15:11:18+00:00'),
      ch('1195', '2026-10-11T15:10:30+00:00'),
      ch('1194', '2026-09-27T15:10:37+00:00'),
    ])
    expect(latest).toBe(1195)
    expect(entries.map((e) => e.number)).toEqual([1194, 1195])
    expect(entries[1].at).toBe('2026-10-11T15:10:30.000Z')
  })

  it('drops re-uploads of old chapters (the "chapter 4" noise)', () => {
    const { entries } = chaptersFromFeed([
      ch('1195', '2026-10-11T15:10:30+00:00'),
      ch('4', '2026-10-12T10:00:00+00:00'),
    ])
    expect(entries.map((e) => e.number)).toEqual([1195])
  })

  it('ignores extras like 12.5 and chapters without a number', () => {
    const { entries } = chaptersFromFeed([
      ch('12.5', '2026-10-01T00:00:00+00:00'),
      ch(null, '2026-10-02T00:00:00+00:00'),
      ch('12', '2026-10-03T00:00:00+00:00'),
    ])
    expect(entries.map((e) => e.number)).toEqual([12])
  })

  it('handles an empty feed', () => {
    expect(chaptersFromFeed([])).toEqual({ entries: [], latest: null })
  })
})

describe('anime schedule', () => {
  it('turns unix seconds into sorted ISO entries', () => {
    const e = animeEntries([
      { episode: 2, airingAt: 1792222200 },
      { episode: 1, airingAt: 1791617400 },
    ])
    expect(e.map((x) => x.number)).toEqual([1, 2])
    expect(e[1].at).toBe(new Date(1792222200 * 1000).toISOString())
  })

  it('latestAired prefers the "next" pointer, else the newest aired entry', () => {
    const entries = animeEntries([{ episode: 5, airingAt: Math.floor((NOW - 864e5) / 1000) }])
    expect(latestAired(entries, { episode: 7 }, NOW)).toBe(6)
    expect(latestAired(entries, null, NOW)).toBe(5)
    expect(latestAired([], null, NOW)).toBeNull()
  })
})

describe('nextRelease', () => {
  it('upcoming episode with its time', () => {
    const c = cache({ latest: 1350, entries: [{ number: 1351, at: iso(2) }] })
    const n = nextRelease({ current_position: 1350 }, c, NOW)!
    expect(n.number).toBe(1351)
    expect(n.upcoming).toBe(true)
    expect(n.behind).toBe(0)
  })

  it('already out, and counts how far behind the user is', () => {
    const c = cache({ latest: 1357, entries: [{ number: 1351, at: iso(-6) }] })
    const n = nextRelease({ current_position: 1350 }, c, NOW)!
    expect(n).toMatchObject({ number: 1351, upcoming: false, behind: 7 })
  })

  it('caught up → soonest future entry', () => {
    const c = cache({ latest: 1357, entries: [{ number: 1358, at: iso(5) }, { number: 1359, at: iso(12) }] })
    expect(nextRelease({ current_position: 1357 }, c, NOW)).toMatchObject({ number: 1358, upcoming: true })
  })

  it('nothing known → null', () => {
    expect(nextRelease({ current_position: 3 }, cache(), NOW)).toBeNull()
    expect(nextRelease({ current_position: 3 }, undefined, NOW)).toBeNull()
  })
})

describe('freshReleaseAt', () => {
  it('flags the next unread unit when it came out recently', () => {
    const c = cache({ entries: [{ number: 11, at: iso(-3) }] })
    expect(freshReleaseAt({ current_position: 10 }, c, 14, NOW)).not.toBeNull()
  })
  it('not fresh when old, not yet out, or not the next one', () => {
    expect(freshReleaseAt({ current_position: 10 }, cache({ entries: [{ number: 11, at: iso(-30) }] }), 14, NOW)).toBeNull()
    expect(freshReleaseAt({ current_position: 10 }, cache({ entries: [{ number: 11, at: iso(2) }] }), 14, NOW)).toBeNull()
    expect(freshReleaseAt({ current_position: 10 }, cache({ entries: [{ number: 14, at: iso(-1) }] }), 14, NOW)).toBeNull()
  })
})

describe('planReleaseItemUpdate', () => {
  it('stores the MangaDex id and latest chapter, idempotently', () => {
    const m = item({ kind: 'manga', source_id: '30013' })
    const c = cache({ kind: 'manga', key: 'manga:30013', externalId: 'uuid', latest: 1195 })
    const patch = planReleaseItemUpdate(m, c)
    expect(patch.metadata).toMatchObject({ mangadexId: 'uuid', latestChapter: 1195 })
    const again = planReleaseItemUpdate({ ...m, metadata: patch.metadata! }, c)
    expect(again).toEqual({})
  })

  it('learns a final total only for finished media (so ongoing never auto-completes)', () => {
    const ongoing = planReleaseItemUpdate(item(), cache({ total: 24, status: 'releasing' }))
    expect(ongoing.total_units).toBeUndefined()
    const done = planReleaseItemUpdate(item(), cache({ total: 24, status: 'finished' }))
    expect(done.total_units).toBe(24)
    expect(done.metadata?.seasons?.[0].episodeCount).toBe(24)
  })

  it('never overwrites a total the user already has', () => {
    const patch = planReleaseItemUpdate(item({ total_units: 12 }), cache({ total: 24, status: 'finished' }))
    expect(patch.total_units).toBeUndefined()
  })
})

describe('freshness + status mapping', () => {
  it('live media go stale after 4h, finished ones after a week', () => {
    const old = new Date(NOW - 5 * 3600e3).toISOString()
    expect(isReleaseFresh(cache({ fetchedAt: old }), NOW)).toBe(false)
    expect(isReleaseFresh(cache({ fetchedAt: old, status: 'finished' }), NOW)).toBe(true)
  })
  it('normalises provider statuses', () => {
    expect(normalizeAniListStatus('RELEASING')).toBe('releasing')
    expect(normalizeAniListStatus('NOT_YET_RELEASED')).toBe('upcoming')
    expect(normalizeMangaDexStatus('completed')).toBe('finished')
    expect(normalizeMangaDexStatus(undefined)).toBeNull()
  })
})

describe('day grouping', () => {
  it('keeps bare TMDB dates as they are', () => {
    expect(hasTime('2026-10-14')).toBe(false)
    expect(localDayKey('2026-10-14')).toBe('2026-10-14')
  })
  it('puts a timestamp on the viewer-local day', () => {
    const local = new Date(2026, 9, 14, 23, 30) // 14 Oct, 23:30 local time
    expect(localDayKey(local.toISOString())).toBe('2026-10-14')
  })
})
