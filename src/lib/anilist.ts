import type { SearchResult, SeasonMeta } from './types'

const ENDPOINT = 'https://graphql.anilist.co'

const SEARCH_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 15) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      episodes
      seasonYear
      format
      description(asHtml: false)
      title { romaji english native }
      coverImage { large }
    }
  }
}`

interface AniListMedia {
  id: number
  episodes: number | null
  seasonYear: number | null
  format: string | null
  description: string | null
  title: { romaji: string | null; english: string | null; native: string | null }
  coverImage: { large: string | null }
}

function pickTitle(t: AniListMedia['title']): string {
  return t.english || t.romaji || t.native || 'Unbenannt'
}

function stripHtml(s: string | null): string | null {
  if (!s) return null
  return s.replace(/<[^>]*>/g, '').trim() || null
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: query } }),
  })
  if (!res.ok) throw new Error(`AniList ${res.status}`)
  const json = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } }
  const media = json.data?.Page?.media ?? []
  return media.map((m) => ({
    source: 'anilist' as const,
    source_id: String(m.id),
    kind: 'anime' as const,
    title: pickTitle(m.title),
    year: m.seasonYear,
    poster_url: m.coverImage.large,
    overview: stripHtml(m.description),
  }))
}

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    episodes
    seasonYear
    description(asHtml: false)
    title { romaji english native }
  }
}`

export interface AnimeDetail {
  episodes: number | null
  year: number | null
  overview: string | null
  /** AniList entries are single-cour; expose one pseudo-season. */
  seasons: SeasonMeta[]
}

export async function getAnimeDetail(id: string): Promise<AnimeDetail> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: DETAIL_QUERY, variables: { id: Number(id) } }),
  })
  if (!res.ok) throw new Error(`AniList ${res.status}`)
  const json = (await res.json()) as {
    data?: { Media?: { episodes: number | null; seasonYear: number | null; description: string | null } }
  }
  const m = json.data?.Media
  const episodes = m?.episodes ?? null
  return {
    episodes,
    year: m?.seasonYear ?? null,
    overview: stripHtml(m?.description ?? null),
    seasons: episodes ? [{ number: 1, name: 'Staffel 1', episodeCount: episodes }] : [],
  }
}
