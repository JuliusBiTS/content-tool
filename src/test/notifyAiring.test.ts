import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from './stubs/supabase'
import { push } from './stubs/webpush'

type Handler = (req: Request) => Promise<Response>
let handle: Handler
let helpers: {
  absoluteIndex: (s: { number: number; episodeCount: number }[], season: number, ep: number) => number | null
  chapterEntries: (f: unknown[]) => { number: number; at: number }[]
  sinceFor: (l: (string | null)[], now: number) => number
  isQuietHour: (h: number) => boolean
  berlinHour: (now: number) => number
}

const ENV: Record<string, string> = {
  CRON_SECRET: 's3cret',
  TMDB_TOKEN: 't',
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  SUPABASE_URL: 'http://x',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
}

beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).Deno = {
    serve: () => {},
    env: { get: (k: string) => ENV[k] },
  }
  const mod = await import('../../supabase/functions/notify-airing/index.ts')
  handle = mod.handle as Handler
  helpers = mod as unknown as typeof helpers
})

const NOON = '2026-10-13T12:00:00Z' // 14:00 in Berlin
const call = (secret = 's3cret') =>
  handle(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': secret } }))

const item = (over: Record<string, unknown>) => ({
  id: 'i1',
  user_id: 'u1',
  title: 'Show',
  kind: 'series',
  status: 'watching',
  source: 'tmdb',
  source_id: 'tv:1',
  current_position: 0,
  metadata: { seasons: [{ number: 1, episodeCount: 6 }] },
  deleted_at: null,
  ...over,
})

/** Route outgoing fetches to canned provider responses. */
function stubNetwork(routes: {
  tmdb?: Record<string, unknown>
  anilist?: { mediaId: number; episode: number; airingAt: number }[]
  mangadex?: Record<string, unknown[]>
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
      if (u.includes('themoviedb')) {
        const id = u.match(/\/tv\/(\d+)/)?.[1] ?? ''
        return json(routes.tmdb?.[id] ?? {})
      }
      if (u.includes('anilist')) {
        return json({
          data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: routes.anilist ?? [] } },
        })
      }
      if (u.includes('mangadex')) {
        const id = u.match(/manga\/([^/]+)\/feed/)?.[1] ?? ''
        return json({ data: routes.mangadex?.[id] ?? [] })
      }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOON))
  fake.reset()
  push.reset()
  fake.subs.push({
    user_id: 'u1',
    endpoint: 'https://push/1',
    p256dh: 'p',
    auth: 'a',
    last_notified_at: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('notify-airing helpers', () => {
  it('quiet hours are 22:00–07:00 Berlin time', () => {
    expect(helpers.isQuietHour(23)).toBe(true)
    expect(helpers.isQuietHour(3)).toBe(true)
    expect(helpers.isQuietHour(7)).toBe(false)
    expect(helpers.isQuietHour(14)).toBe(false)
  })

  it('reads the Berlin hour across the DST boundary', () => {
    expect(helpers.berlinHour(Date.parse('2026-10-13T12:00:00Z'))).toBe(14) // CEST
    expect(helpers.berlinHour(Date.parse('2026-11-13T12:00:00Z'))).toBe(13) // CET
  })

  it('absoluteIndex maps season/episode to a running number', () => {
    const s = [
      { number: 1, episodeCount: 6 },
      { number: 2, episodeCount: 6 },
    ]
    expect(helpers.absoluteIndex(s, 2, 3)).toBe(9)
    expect(helpers.absoluteIndex([], 1, 1)).toBeNull()
  })

  it('cursor: default lookback, oldest device wins, capped at 72h', () => {
    const now = Date.parse(NOON)
    expect(helpers.sinceFor([null], now)).toBe(now - 26 * 3600e3)
    const a = new Date(now - 5 * 3600e3).toISOString()
    const b = new Date(now - 2 * 3600e3).toISOString()
    expect(helpers.sinceFor([a, b], now)).toBe(now - 5 * 3600e3)
    expect(helpers.sinceFor([new Date(now - 10 * 864e5).toISOString()], now)).toBe(now - 72 * 3600e3)
  })

  it('chapterEntries merges languages and drops old re-uploads', () => {
    const feed = [
      { attributes: { chapter: '1195', publishAt: '2026-10-11T15:11:00+00:00' } },
      { attributes: { chapter: '1195', publishAt: '2026-10-11T15:10:00+00:00' } },
      { attributes: { chapter: '4', publishAt: '2026-10-12T10:00:00+00:00' } },
    ]
    const e = helpers.chapterEntries(feed)
    expect(e).toHaveLength(1)
    expect(e[0].number).toBe(1195)
  })
})

describe('notify-airing handler', () => {
  it('rejects a wrong secret', async () => {
    expect((await call('nope')).status).toBe(403)
  })

  it('stays silent at night and leaves the cursor alone', async () => {
    vi.setSystemTime(new Date('2026-10-13T22:30:00Z')) // 00:30 Berlin
    fake.items.push(item({}))
    stubNetwork({})
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: true, sent: 0, quiet: true })
    expect(fake.updates).toHaveLength(0)
  })

  it('TMDB: notifies for an episode released today that the user has not seen', async () => {
    fake.items.push(item({ current_position: 3 }))
    stubNetwork({
      tmdb: {
        '1': { last_episode_to_air: { air_date: '2026-10-13', season_number: 1, episode_number: 5, name: 'Titel' } },
      },
    })
    const body = await (await call()).json()
    expect(body.sent).toBe(1)
    expect(push.sent[0].payload.title).toBe('Show')
    expect(push.sent[0].payload.body).toContain('S1 E5 – Titel ist da.')
    expect(push.sent[0].payload.body).toContain('2 offen') // 5 vs position 3
  })

  it('TMDB: no notification when the episode is already watched or too old', async () => {
    fake.items.push(item({ current_position: 5 }))
    stubNetwork({
      tmdb: { '1': { last_episode_to_air: { air_date: '2026-10-13', season_number: 1, episode_number: 5 } } },
    })
    expect((await (await call()).json()).sent).toBe(0)

    push.reset()
    fake.items[0] = item({ current_position: 0 })
    stubNetwork({
      tmdb: { '1': { last_episode_to_air: { air_date: '2026-09-01', season_number: 1, episode_number: 5 } } },
    })
    expect((await (await call()).json()).sent).toBe(0)
  })

  it('anime: notifies with the exact episode, only for what aired since the cursor', async () => {
    fake.items.push(item({ id: 'a1', kind: 'anime', source: 'anilist', source_id: '966', current_position: 1355, metadata: {} }))
    const sec = Math.floor(Date.parse(NOON) / 1000)
    stubNetwork({
      anilist: [
        { mediaId: 966, episode: 1356, airingAt: sec - 3 * 3600 },
        { mediaId: 966, episode: 1357, airingAt: sec - 1800 },
      ],
    })
    const body = await (await call()).json()
    expect(body.sent).toBe(1)
    expect(push.sent[0].payload.body).toBe('Folge 1357 ist da. · 2 offen')
  })

  it('manga: notifies for the newest chapter ahead of the reader', async () => {
    fake.items.push(
      item({ id: 'm1', kind: 'manga', source: 'anilist', source_id: '30013', current_position: 1194, metadata: { mangadexId: 'md-1' } }),
    )
    stubNetwork({
      mangadex: {
        'md-1': [
          { attributes: { chapter: '1195', publishAt: '2026-10-13T09:00:00+00:00' } },
          { attributes: { chapter: '1195', publishAt: '2026-10-13T09:05:00+00:00' } },
          { attributes: { chapter: '1194', publishAt: '2026-09-27T15:00:00+00:00' } },
        ],
      },
    })
    const body = await (await call()).json()
    expect(body.sent).toBe(1)
    expect(push.sent[0].payload.body).toBe('Kapitel 1195 ist erschienen.')
    expect(push.sent[0].payload.tag).toBe('ch-m1')
  })

  it('does not notify the same release twice: the cursor advances after a run', async () => {
    fake.items.push(item({ id: 'a1', kind: 'anime', source: 'anilist', source_id: '966', current_position: 1356, metadata: {} }))
    const sec = Math.floor(Date.parse(NOON) / 1000)
    const sched = [{ mediaId: 966, episode: 1357, airingAt: sec - 600 }]

    stubNetwork({ anilist: sched })
    expect((await (await call()).json()).sent).toBe(1)
    expect(fake.updates).toHaveLength(1)
    const cursor = fake.updates[0].payload.last_notified_at as string
    expect(cursor).toBe(new Date(NOON).toISOString())

    // an hour later the same episode is older than the stored cursor
    push.reset()
    fake.subs[0].last_notified_at = cursor
    vi.setSystemTime(new Date('2026-10-13T13:00:00Z'))
    stubNetwork({ anilist: sched.filter((s) => s.airingAt * 1000 > Date.parse(cursor)) })
    expect((await (await call()).json()).sent).toBe(0)
  })

  it('removes subscriptions the push service reports as gone', async () => {
    fake.items.push(item({ current_position: 0 }))
    stubNetwork({
      tmdb: { '1': { last_episode_to_air: { air_date: '2026-10-13', season_number: 1, episode_number: 1 } } },
    })
    push.failWith = { statusCode: 410 }
    await call()
    expect(fake.deleted).toContain('https://push/1')
  })

  it('a failing provider does not take the others down', async () => {
    fake.items.push(item({ id: 'a1', kind: 'anime', source: 'anilist', source_id: '966', current_position: 1, metadata: {} }))
    fake.items.push(item({ id: 'm1', kind: 'manga', source: 'anilist', source_id: '9', current_position: 1, metadata: { mangadexId: 'md-1' } }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('anilist')) throw new Error('boom')
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ attributes: { chapter: '5', publishAt: '2026-10-13T10:00:00+00:00' } }] }),
        }
      }),
    )
    const body = await (await call()).json()
    expect(body.sent).toBe(1) // the manga one still went out
    expect(push.sent[0].payload.body).toContain('Kapitel 5')
  })
})
