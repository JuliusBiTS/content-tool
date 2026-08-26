import type { SearchResult } from './types'

// Google Books works without an API key (lower quota, fine for personal use).
const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes'

interface Volume {
  id: string
  volumeInfo: {
    title: string
    authors?: string[]
    publishedDate?: string
    pageCount?: number
    description?: string
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

function cover(v: Volume): string | null {
  const l = v.volumeInfo.imageLinks?.thumbnail || v.volumeInfo.imageLinks?.smallThumbnail
  return l ? l.replace('http://', 'https://') : null
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '15')
  url.searchParams.set('printType', 'books')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GoogleBooks ${res.status}`)
  const json = (await res.json()) as { items?: Volume[] }
  return (json.items ?? []).map((v) => {
    const info = v.volumeInfo
    return {
      source: 'googlebooks' as const,
      source_id: v.id,
      kind: 'book' as const,
      title: info.authors?.length ? `${info.title} — ${info.authors[0]}` : info.title,
      year: info.publishedDate ? Number(info.publishedDate.slice(0, 4)) || null : null,
      poster_url: cover(v),
      overview: info.pageCount ? `${info.pageCount} Seiten` : (info.description ?? null),
    }
  })
}

export async function getBookPages(id: string): Promise<number | null> {
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const json = (await res.json()) as { volumeInfo?: { pageCount?: number } }
    return json.volumeInfo?.pageCount ?? null
  } catch {
    return null
  }
}
