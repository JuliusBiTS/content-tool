import type { SearchResult, SeasonMeta } from './types'

const ENDPOINT = 'https://graphql.anilist.co'

const SEARCH_QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 15) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      id
      episodes
      chapters
      startDate { year }
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
  chapters: number | null
  seasonYear: number | null
  startDate: { year: number | null } | null
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

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: q, variables }),
  })
  if (!res.ok) throw new Error(`AniList ${res.status}`)
  return (await res.json()) as T
}

async function search(
  q: string,
  type: 'ANIME' | 'MANGA',
  kind: 'anime' | 'manga',
): Promise<SearchResult[]> {
  const json = await query<{ data?: { Page?: { media?: AniListMedia[] } } }>(SEARCH_QUERY, {
    search: q,
    type,
  })
  return (json.data?.Page?.media ?? []).map((m) => ({
    source: 'anilist' as const,
    source_id: String(m.id),
    kind,
    title: pickTitle(m.title),
    year: m.seasonYear ?? m.startDate?.year ?? null,
    poster_url: m.coverImage.large,
    overview:
      stripHtml(m.description) ??
      (m.chapters ? `${m.chapters} Kapitel` : m.episodes ? `${m.episodes} Folgen` : null),
  }))
}

export const searchAnime = (q: string) => search(q, 'ANIME', 'anime')
export const searchManga = (q: string) => search(q, 'MANGA', 'manga')

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    type
    episodes
    chapters
    volumes
    seasonYear
    startDate { year }
    averageScore
    genres
    description(asHtml: false)
    staff(perPage: 3, sort: RELEVANCE) { nodes { name { full } } }
  }
}`

export interface AniListDetail {
  type: 'ANIME' | 'MANGA'
  /** episodes (anime) or chapters (manga) */
  units: number | null
  year: number | null
  overview: string | null
  externalRating: number | null
  genres: string[]
  creators: string[]
  seasons: SeasonMeta[]
}

export async function getAniListDetail(id: string): Promise<AniListDetail> {
  const json = await query<{
    data?: {
      Media?: {
        type: 'ANIME' | 'MANGA'
        episodes: number | null
        chapters: number | null
        seasonYear: number | null
        startDate: { year: number | null } | null
        averageScore: number | null
        genres: string[] | null
        description: string | null
        staff: { nodes: { name: { full: string | null } }[] } | null
      }
    }
  }>(DETAIL_QUERY, { id: Number(id) })

  const m = json.data?.Media
  const isManga = m?.type === 'MANGA'
  const units = isManga ? (m?.chapters ?? null) : (m?.episodes ?? null)
  return {
    type: m?.type ?? 'ANIME',
    units,
    year: m?.seasonYear ?? m?.startDate?.year ?? null,
    overview: stripHtml(m?.description ?? null),
    externalRating: m?.averageScore != null ? m.averageScore / 10 : null,
    genres: m?.genres ?? [],
    creators: (m?.staff?.nodes ?? [])
      .map((n) => n.name.full)
      .filter((x): x is string => !!x),
    seasons:
      !isManga && units ? [{ number: 1, name: 'Staffel 1', episodeCount: units }] : [],
  }
}

/** @deprecated use getAniListDetail */
export const getAnimeDetail = getAniListDetail
