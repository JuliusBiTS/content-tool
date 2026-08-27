import { unzipSync, strFromU8 } from 'fflate'
import { parseCsv } from './csv'
import { searchTmdb } from '../tmdb'
import { importFilm } from '../repo'
import { db } from '../db'
import type { ItemStatus } from '../types'

export interface LbFilm {
  name: string
  year: number | null
  /** 0.5 – 5.0 in half steps, or null */
  rating: number | null
  watchedDate: string | null
}

export interface ImportPlan {
  rated: LbFilm[]
  watchlist: LbFilm[]
}

export interface ImportResult {
  added: number
  skipped: number
  unmatched: string[]
}

const DIACRITICS = /[̀-ͯ]/g
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function toRow(r: Record<string, string>): LbFilm {
  const raw = r['Rating']
  const rating = raw ? Number(raw) : NaN
  return {
    name: r['Name'] ?? '',
    year: r['Year'] ? Number(r['Year']) || null : null,
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    watchedDate: r['Watched Date'] || r['Date'] || null,
  }
}

/** Read a Letterboxd export .zip or a single exported .csv. */
export async function readLetterboxdFile(file: File): Promise<ImportPlan> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const csvs: Record<string, string> = {}

  if (file.name.toLowerCase().endsWith('.zip')) {
    const entries = unzipSync(buf)
    for (const [path, data] of Object.entries(entries)) {
      const base = path.split('/').pop() ?? path
      if (base.toLowerCase().endsWith('.csv')) csvs[base.toLowerCase()] = strFromU8(data)
    }
  } else {
    csvs[file.name.toLowerCase()] = strFromU8(buf)
  }

  const ratedRows: LbFilm[] = []
  const seen = new Set<string>()

  // ratings.csv is the canonical source; diary.csv adds watched dates + rewatches
  for (const key of ['ratings.csv', 'diary.csv', 'reviews.csv']) {
    const text = csvs[key] ?? (Object.keys(csvs).length === 1 ? Object.values(csvs)[0] : '')
    if (!text) continue
    for (const raw of parseCsv(text)) {
      const f = toRow(raw)
      if (!f.name || f.rating == null) continue
      const k = `${norm(f.name)}|${f.year ?? ''}`
      if (seen.has(k)) continue
      seen.add(k)
      ratedRows.push(f)
    }
  }

  const watchlist: LbFilm[] = []
  if (csvs['watchlist.csv']) {
    for (const raw of parseCsv(csvs['watchlist.csv'])) {
      const f = toRow(raw)
      if (f.name) watchlist.push(f)
    }
  }

  return { rated: ratedRows, watchlist }
}

async function existingKeys(): Promise<{ titles: Set<string>; tmdb: Set<string> }> {
  const items = await db.items.toArray()
  const titles = new Set<string>()
  const tmdb = new Set<string>()
  for (const it of items) {
    if (it.deleted_at) continue
    titles.add(norm(it.title))
    if (it.source === 'tmdb' && it.source_id) tmdb.add(it.source_id)
  }
  return { titles, tmdb }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onTick: () => void,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
      onTick()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Best TMDB movie match for a Letterboxd title/year. */
async function matchFilm(f: LbFilm) {
  let results
  try {
    results = await searchTmdb(f.name)
  } catch {
    return null
  }
  const movies = results.filter((r) => r.kind === 'movie')
  if (!movies.length) return null
  const target = norm(f.name)

  type M = (typeof movies)[number]
  const names = (r: M) => [norm(r.title), r.original_title ? norm(r.original_title) : '']
  const exactTitle = (r: M) => names(r).includes(target)
  const looseTitle = (r: M) =>
    names(r).some((n) => n.length > 2 && (n.includes(target) || target.includes(n)))
  const yearMatch = (r: M) =>
    f.year != null && r.year != null && Math.abs(r.year - f.year) <= 1

  // Year is a strong signal — a title-only hit decades off is almost always wrong.
  return (
    movies.find((r) => exactTitle(r) && yearMatch(r)) ??
    movies.find((r) => looseTitle(r) && yearMatch(r)) ??
    (f.year ? movies.find(yearMatch) : null) ??
    movies.find(exactTitle) ??
    movies[0]
  )
}

export async function runImport(
  plan: ImportPlan,
  opts: {
    userId: string
    includeWatchlist: boolean
    onProgress: (done: number, total: number) => void
  },
): Promise<ImportResult> {
  const { titles, tmdb } = await existingKeys()
  const jobs: { film: LbFilm; status: ItemStatus }[] = []

  for (const f of plan.rated) jobs.push({ film: f, status: 'done' })
  if (opts.includeWatchlist) {
    for (const f of plan.watchlist) {
      if (!plan.rated.some((r) => norm(r.name) === norm(f.name) && r.year === f.year)) {
        jobs.push({ film: f, status: 'planned' })
      }
    }
  }

  let done = 0
  const total = jobs.length
  opts.onProgress(0, total)

  const result: ImportResult = { added: 0, skipped: 0, unmatched: [] }

  await mapWithConcurrency(
    jobs,
    5,
    async ({ film, status }) => {
      if (titles.has(norm(film.name))) {
        result.skipped++
        return
      }
      const match = await matchFilm(film)
      if (match && tmdb.has(match.source_id)) {
        result.skipped++
        return
      }
      await importFilm({
        userId: opts.userId,
        title: match?.title ?? film.name,
        year: match?.year ?? film.year,
        posterUrl: match?.poster_url ?? null,
        source: match ? 'tmdb' : 'manual',
        sourceId: match?.source_id ?? null,
        status,
        rating: film.rating != null ? Math.round(film.rating * 2) : null,
        watchedAt: film.watchedDate ? `${film.watchedDate}T12:00:00.000Z` : null,
      })
      titles.add(norm(film.name))
      if (match) tmdb.add(match.source_id)
      result.added++
      if (!match) result.unmatched.push(film.name)
    },
    () => opts.onProgress(++done, total),
  )

  return result
}
