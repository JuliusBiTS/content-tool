import type { SearchResult } from './types'

interface OLDoc {
  key: string
  title: string
  first_publish_year?: number
  cover_i?: number
  author_name?: string[]
  number_of_pages_median?: number
}

const cover = (id: number | undefined) =>
  id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '15')
  url.searchParams.set('fields', 'key,title,first_publish_year,cover_i,author_name,number_of_pages_median')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenLibrary ${res.status}`)
  const json = (await res.json()) as { docs: OLDoc[] }
  return (json.docs ?? []).map((d) => ({
    source: 'openlibrary' as const,
    source_id: d.key,
    kind: 'book' as const,
    title: d.author_name?.length ? `${d.title} — ${d.author_name[0]}` : d.title,
    year: d.first_publish_year ?? null,
    poster_url: cover(d.cover_i),
    overview: d.number_of_pages_median ? `~${d.number_of_pages_median} Seiten` : null,
  }))
}

export async function getBookPages(key: string): Promise<number | null> {
  try {
    const res = await fetch(`https://openlibrary.org${key}.json`)
    if (!res.ok) return null
    const json = (await res.json()) as { number_of_pages?: number }
    return json.number_of_pages ?? null
  } catch {
    return null
  }
}
