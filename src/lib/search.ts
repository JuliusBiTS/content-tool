import { getAnimeDetail, searchAnime } from './anilist'
import { getBookPages, searchBooks } from './googlebooks'
import { getTmdbDetail, searchTmdb } from './tmdb'
import type { ItemMetadata, MediaKind, SearchResult } from './types'

export type SearchScope = 'all' | MediaKind

export async function runSearch(query: string, scope: SearchScope): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const tasks: Promise<SearchResult[]>[] = []
  if (scope === 'all' || scope === 'series' || scope === 'movie') tasks.push(safe(searchTmdb(q)))
  if (scope === 'all' || scope === 'anime') tasks.push(safe(searchAnime(q)))
  if (scope === 'all' || scope === 'book') tasks.push(safe(searchBooks(q)))

  const settled = await Promise.all(tasks)
  const merged = settled.flat()

  if (scope !== 'all') return merged.filter((r) => r.kind === scope)
  return merged
}

async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch (e) {
    console.warn('[search] provider failed', e)
    return []
  }
}

export interface ResolvedMeta {
  total_units: number | null
  metadata: ItemMetadata
}

/** Fetch full details (seasons/pages/runtime) for a chosen search result. */
export async function resolveMeta(result: SearchResult): Promise<ResolvedMeta> {
  try {
    if (result.source === 'tmdb') {
      const d = await getTmdbDetail(result.source_id)
      return {
        total_units: d.totalUnits,
        metadata: {
          seasons: d.seasons,
          overview: d.overview ?? undefined,
          year: d.year ?? undefined,
          runtimeMinutes: d.runtimeMinutes ?? undefined,
        },
      }
    }
    if (result.source === 'anilist') {
      const d = await getAnimeDetail(result.source_id)
      return {
        total_units: d.episodes,
        metadata: {
          seasons: d.seasons,
          overview: d.overview ?? undefined,
          year: d.year ?? undefined,
          absoluteNumbering: true,
        },
      }
    }
    if (result.source === 'googlebooks' || result.source === 'openlibrary') {
      const pages = await getBookPages(result.source_id)
      return { total_units: pages, metadata: { year: result.year ?? undefined } }
    }
  } catch (e) {
    console.warn('[search] resolveMeta failed', e)
  }
  return { total_units: null, metadata: { year: result.year ?? undefined } }
}
