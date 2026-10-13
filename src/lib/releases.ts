import { db } from './db'
import { patchItemFresh } from './repo'
import {
  NO_MATCH_RETRY_MS,
  animeEntries,
  chaptersFromFeed,
  isReleaseFresh,
  latestAired,
  normalizeAniListStatus,
  normalizeMangaDexStatus,
  planReleaseItemUpdate,
  releaseKey,
} from './releaseLogic'
import type { AiringEntry } from './shows'
import type { Item, ReleaseCache } from './types'

const ANILIST = 'https://graphql.anilist.co'
const MANGADEX = 'https://api.mangadex.org'

/** Anime: look this far back / ahead in the airing schedule. */
const BACK_DAYS = 14
const AHEAD_DAYS = 45

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`AniList ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length && !json.data) throw new Error(json.errors[0].message)
  return json.data as T
}

// ---------------------------------------------------------------- anime ---

const MEDIA_Q = `
query ($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    media(id_in: $ids) {
      id status episodes
      nextAiringEpisode { episode airingAt }
    }
  }
}`

const SCHEDULE_Q = `
query ($ids: [Int], $from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      mediaId episode airingAt
    }
  }
}`

interface MediaRow {
  id: number
  status: string | null
  episodes: number | null
  nextAiringEpisode: { episode: number; airingAt: number } | null
}

/** Airing data for many anime in two (paged) requests. */
export async function fetchAnimeReleases(
  ids: number[],
  now = Date.now(),
): Promise<Map<number, ReleaseCache>> {
  const out = new Map<number, ReleaseCache>()
  if (!ids.length) return out
  const from = Math.floor(now / 1000) - BACK_DAYS * 86400
  const to = Math.floor(now / 1000) + AHEAD_DAYS * 86400

  const media = new Map<number, MediaRow>()
  for (let i = 0; i < ids.length; i += 50) {
    const data = await anilist<{ Page: { media: MediaRow[] } }>(MEDIA_Q, {
      ids: ids.slice(i, i + 50),
      page: 1,
    })
    for (const m of data.Page.media) media.set(m.id, m)
  }

  const nodes = new Map<number, { episode: number; airingAt: number }[]>()
  for (let i = 0; i < ids.length; i += 50) {
    for (let page = 1; page <= 6; page++) {
      const data = await anilist<{
        Page: {
          pageInfo: { hasNextPage: boolean }
          airingSchedules: { mediaId: number; episode: number; airingAt: number }[]
        }
      }>(SCHEDULE_Q, { ids: ids.slice(i, i + 50), from, to, page })
      for (const n of data.Page.airingSchedules) {
        const list = nodes.get(n.mediaId) ?? []
        list.push({ episode: n.episode, airingAt: n.airingAt })
        nodes.set(n.mediaId, list)
      }
      if (!data.Page.pageInfo.hasNextPage) break
    }
  }

  for (const id of ids) {
    const m = media.get(id)
    if (!m) continue
    const entries = animeEntries(nodes.get(id) ?? [])
    out.set(id, {
      key: `anime:${id}`,
      kind: 'anime',
      status: normalizeAniListStatus(m.status),
      entries,
      latest: latestAired(entries, m.nextAiringEpisode, now),
      total: m.episodes ?? null,
      fetchedAt: new Date(now).toISOString(),
    })
  }
  return out
}

// ---------------------------------------------------------------- manga ---

interface MdManga {
  id: string
  attributes: {
    status?: string
    lastChapter?: string | null
    links?: { al?: string } | null
  }
}

/** Find the MangaDex entry for an AniList manga — MangaDex stores the AniList id. */
async function findMangaDexId(title: string, anilistId: string): Promise<string | null> {
  const url = `${MANGADEX}/manga?title=${encodeURIComponent(title)}&limit=10`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MangaDex ${res.status}`)
  const json = (await res.json()) as { data: MdManga[] }
  return json.data.find((m) => m.attributes.links?.al === anilistId)?.id ?? null
}

export async function fetchMangaRelease(
  item: Item,
  cached: ReleaseCache | undefined,
  now = Date.now(),
): Promise<ReleaseCache> {
  const key = `manga:${item.source_id}`
  let mdId = item.metadata.mangadexId ?? cached?.externalId

  // remembered "no match": only look again after a while
  if (mdId === '' && cached && now - Date.parse(cached.fetchedAt) < NO_MATCH_RETRY_MS) {
    return { ...cached, fetchedAt: cached.fetchedAt }
  }
  if (!mdId) mdId = (await findMangaDexId(item.title, item.source_id!)) ?? ''

  const base = {
    key,
    kind: 'manga' as const,
    externalId: mdId,
    fetchedAt: new Date(now).toISOString(),
  }
  if (!mdId) {
    return { ...base, status: null, entries: [], latest: null, total: null }
  }

  const [infoRes, feedRes] = await Promise.all([
    fetch(`${MANGADEX}/manga/${mdId}`),
    fetch(
      `${MANGADEX}/manga/${mdId}/feed?limit=50&order[publishAt]=desc` +
        `&translatedLanguage[]=en&translatedLanguage[]=de&includeExternalUrl=1`,
    ),
  ])
  if (!feedRes.ok) throw new Error(`MangaDex ${feedRes.status}`)
  const feed = (await feedRes.json()) as {
    data: { attributes: { chapter: string | null; publishAt?: string } }[]
  }
  const info = infoRes.ok ? ((await infoRes.json()) as { data: MdManga }).data : null

  const { entries, latest } = chaptersFromFeed(feed.data)
  const last = Number(info?.attributes.lastChapter)
  return {
    ...base,
    status: normalizeMangaDexStatus(info?.attributes.status),
    entries,
    latest,
    total: Number.isInteger(last) && last > 0 ? last : null,
  }
}

// ------------------------------------------------------------- orchestration

async function save(cache: ReleaseCache, item: Item): Promise<void> {
  await db.releases.put(cache)
  await patchItemFresh(item.id, (cur) => planReleaseItemUpdate(cur, cache))
}

export interface ReleaseRefreshOptions {
  force?: boolean
}

/**
 * Refresh anime (one batched AniList call) and manga (two MangaDex calls each)
 * whose cache is stale. Failures are per-medium and never throw.
 */
export async function refreshReleases(
  items: Item[],
  opts: ReleaseRefreshOptions = {},
): Promise<void> {
  const now = Date.now()
  const stale = async (item: Item) => {
    const key = releaseKey(item)
    if (!key) return false
    const c = await db.releases.get(key)
    return opts.force || !c || !isReleaseFresh(c, now)
  }

  const anime: Item[] = []
  const manga: Item[] = []
  for (const it of items) {
    if (!(await stale(it))) {
      // still apply what we already know (e.g. a total learned meanwhile)
      const c = await db.releases.get(releaseKey(it)!)
      if (c) await patchItemFresh(it.id, (cur) => planReleaseItemUpdate(cur, c))
      continue
    }
    ;(it.kind === 'anime' ? anime : manga).push(it)
  }

  if (anime.length) {
    try {
      const byId = await fetchAnimeReleases(anime.map((a) => Number(a.source_id)))
      for (const it of anime) {
        const c = byId.get(Number(it.source_id))
        if (c) await save(c, it)
      }
    } catch (e) {
      console.warn('[releases] anime refresh failed', e)
    }
  }

  const queue = [...manga]
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const it = queue.shift()!
      try {
        const cached = await db.releases.get(releaseKey(it)!)
        await save(await fetchMangaRelease(it, cached), it)
      } catch (e) {
        console.warn('[releases] manga refresh failed', it.title, e)
      }
    }
  })
  await Promise.all(workers)
}

/** Calendar rows for anime episodes / manga chapters inside [−daysBack, +daysAhead]. */
export async function releaseWindow(
  items: Item[],
  daysBack: number,
  daysAhead: number,
  now = Date.now(),
): Promise<AiringEntry[]> {
  const lo = now - daysBack * 864e5
  const hi = now + daysAhead * 864e5
  const rows: AiringEntry[] = []
  for (const item of items) {
    const key = releaseKey(item)
    if (!key) continue
    const cache = await db.releases.get(key)
    if (!cache) continue
    for (const e of cache.entries) {
      const t = Date.parse(e.at)
      if (!Number.isFinite(t) || t < lo || t > hi) continue
      rows.push({
        item,
        episode: {
          season: 1,
          number: e.number,
          name: '',
          overview: '',
          airDate: e.at,
          runtime: null,
          still: null,
        },
        absolute: e.number,
        airDate: e.at,
        watched: item.current_position >= e.number,
        unit: item.kind === 'manga' ? 'chapter' : 'episode',
      })
    }
  }
  return rows
}

/** One medium, e.g. when its detail page opens. */
export async function refreshReleasesFor(item: Item): Promise<void> {
  const key = releaseKey(item)
  if (!key) return
  const c = await db.releases.get(key)
  if (c && isReleaseFresh(c)) return
  await refreshReleases([item])
}
