import { getRecommendations, getTrending, getWatchProviders } from './tmdb'
import type { Item, MediaKind, SearchResult } from './types'

function libraryKeys(items: Item[]): Set<string> {
  const s = new Set<string>()
  for (const i of items) {
    if (i.deleted_at) continue
    if (i.source === 'tmdb' && i.source_id) s.add(i.source_id)
    s.add(i.title.toLowerCase())
  }
  return s
}

/** Recommendations seeded from your highest-rated finished titles. */
export async function forYou(items: Item[]): Promise<SearchResult[]> {
  const seeds = items
    .filter(
      (i) =>
        i.source === 'tmdb' &&
        i.source_id &&
        (i.kind === 'series' || i.kind === 'movie') &&
        (i.rating ?? 0) >= 8,
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5)

  if (!seeds.length) return []

  const have = libraryKeys(items)
  const score = new Map<string, { r: SearchResult; n: number }>()

  const lists = await Promise.all(
    seeds.map((s) => getRecommendations(s.source_id!).catch(() => [])),
  )
  for (const list of lists) {
    for (const r of list) {
      if (have.has(r.source_id) || have.has(r.title.toLowerCase())) continue
      const hit = score.get(r.source_id)
      if (hit) hit.n++
      else score.set(r.source_id, { r, n: 1 })
    }
  }
  return [...score.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 20)
    .map((x) => x.r)
}

export async function trendingForYou(items: Item[]): Promise<SearchResult[]> {
  const have = libraryKeys(items)
  const list = await getTrending().catch(() => [])
  return list.filter((r) => !have.has(r.source_id) && !have.has(r.title.toLowerCase()))
}

export interface PickFilters {
  kind: MediaKind | 'all'
  maxRuntime: number | null
  provider: string | null
}

/** Pick a random title from the watchlist matching the filters. */
export async function pickFromWatchlist(
  items: Item[],
  filters: PickFilters,
): Promise<Item | null> {
  let pool = items.filter((i) => !i.deleted_at && i.status === 'planned')
  if (filters.kind !== 'all') pool = pool.filter((i) => i.kind === filters.kind)
  if (filters.maxRuntime)
    pool = pool.filter(
      (i) => !i.metadata.runtimeMinutes || i.metadata.runtimeMinutes <= filters.maxRuntime!,
    )

  if (filters.provider) {
    const checked = await Promise.all(
      pool.slice(0, 30).map(async (i) => {
        if (i.source !== 'tmdb' || !i.source_id) return null
        const provs = await getWatchProviders(i.source_id).catch(() => [])
        return provs.some((p) => p.name === filters.provider) ? i : null
      }),
    )
    pool = checked.filter((x): x is Item => !!x)
  }

  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export const PROVIDERS = [
  'Netflix',
  'Amazon Prime Video',
  'Disney Plus',
  'WOW',
  'Apple TV+',
  'Paramount Plus',
  'Crunchyroll',
]
