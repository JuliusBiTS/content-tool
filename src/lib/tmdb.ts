import { supabase } from './supabase'
import type { SearchResult, SeasonMeta } from './types'

const IMG = 'https://image.tmdb.org/t/p'
export const tmdbPoster = (path: string | null, size = 'w342') =>
  path ? `${IMG}/${size}${path}` : null

interface TmdbSearchItem {
  id: number
  media_type: 'tv' | 'movie' | 'person'
  name?: string
  title?: string
  first_air_date?: string
  release_date?: string
  poster_path: string | null
  overview: string
}

async function callFn<T>(params: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('tmdb-search', {
    body: params,
  })
  if (error) throw error
  return data as T
}

export async function searchTmdb(query: string): Promise<SearchResult[]> {
  const data = await callFn<{ results: TmdbSearchItem[] }>({ mode: 'search', q: query })
  return (data.results ?? [])
    .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
    .map((r) => {
      const isTv = r.media_type === 'tv'
      const date = isTv ? r.first_air_date : r.release_date
      return {
        source: 'tmdb' as const,
        source_id: `${r.media_type}:${r.id}`,
        kind: (isTv ? 'series' : 'movie') as SearchResult['kind'],
        title: (isTv ? r.name : r.title) ?? 'Unbenannt',
        year: date ? Number(date.slice(0, 4)) : null,
        poster_url: tmdbPoster(r.poster_path),
        overview: r.overview || null,
      }
    })
}

interface TmdbTvDetail {
  number_of_episodes: number
  first_air_date: string | null
  overview: string
  seasons: { season_number: number; name: string; episode_count: number }[]
}

interface TmdbMovieDetail {
  runtime: number | null
  release_date: string | null
  overview: string
}

export interface MediaDetail {
  overview: string | null
  year: number | null
  totalUnits: number | null
  seasons: SeasonMeta[]
  runtimeMinutes: number | null
}

/** source_id is "tv:123" or "movie:123". */
export async function getTmdbDetail(sourceId: string): Promise<MediaDetail> {
  const [type, id] = sourceId.split(':')
  const data = await callFn<TmdbTvDetail | TmdbMovieDetail>({ mode: 'detail', type, id })

  if (type === 'tv') {
    const d = data as TmdbTvDetail
    return {
      overview: d.overview || null,
      year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null,
      totalUnits: d.number_of_episodes || null,
      runtimeMinutes: null,
      seasons: (d.seasons ?? [])
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          number: s.season_number,
          name: s.name || `Staffel ${s.season_number}`,
          episodeCount: s.episode_count,
        })),
    }
  }

  const d = data as TmdbMovieDetail
  return {
    overview: d.overview || null,
    year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    totalUnits: d.runtime || null,
    runtimeMinutes: d.runtime || null,
    seasons: [],
  }
}
