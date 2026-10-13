import { unzipSync, strFromU8 } from 'fflate'
import { parseCsv } from './csv'
import { norm } from './text'

/**
 * Netflix viewing history. Two shapes exist:
 *  - "simple": Konto → Wiedergabeaktivität → Alle herunterladen  →  Title,Date
 *  - "full":   Persönliche Daten herunterladen → ViewingActivity.csv with
 *              Profile Name, Start Time, Duration, Title, Supplemental Video Type …
 */

export interface NetflixRow {
  title: string
  /** YYYY-MM-DD, local viewing date */
  date: string | null
  profile?: string
}

export interface ParsedNetflix {
  format: 'simple' | 'full'
  rows: NetflixRow[]
  profiles: string[]
}

// ----------------------------------------------------------------- dates ---

export type DateOrder = 'DMY' | 'MDY' | 'YMD'

const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

/** Work out D/M/Y vs M/D/Y from the data itself; fall back to a default. */
export function inferDateOrder(samples: string[], fallback: DateOrder = 'DMY'): DateOrder {
  let dmy = false
  let mdy = false
  for (const s of samples) {
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return 'YMD'
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/)
    if (!m) continue
    if (Number(m[1]) > 12) dmy = true
    if (Number(m[2]) > 12) mdy = true
  }
  if (dmy && !mdy) return 'DMY'
  if (mdy && !dmy) return 'MDY'
  return fallback
}

export function parseNetflixDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim()
  let y: number, m: number, d: number
  let hit = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (hit) {
    ;[y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])]
  } else {
    hit = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (!hit) return null
    const [a, b, yy] = [Number(hit[1]), Number(hit[2]), Number(hit[3])]
    ;[d, m] = order === 'MDY' ? [b, a] : [a, b]
    y = fullYear(yy)
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

// ------------------------------------------------------------ csv / zip ---

const hms = (s: string): number => {
  const p = s.split(':').map(Number)
  return p.length === 3 && p.every(Number.isFinite) ? p[0] * 3600 + p[1] * 60 + p[2] : NaN
}

/** Autoplay previews and accidental starts are not watches. */
const MIN_SECONDS = 180

export function parseNetflixCsv(text: string, fallbackOrder: DateOrder = 'DMY'): ParsedNetflix {
  const raw = parseCsv(text)
  const full = raw.length > 0 && 'Start Time' in raw[0] && 'Title' in raw[0]

  if (full) {
    const profiles = new Set<string>()
    const rows: NetflixRow[] = []
    for (const r of raw) {
      if (r['Supplemental Video Type']) continue // trailers, hooks, recaps …
      const dur = hms(r['Duration'] ?? '')
      if (Number.isFinite(dur) && dur < MIN_SECONDS) continue
      const start = (r['Start Time'] ?? '').trim()
      const t = Date.parse(start.replace(' ', 'T') + 'Z')
      const d = Number.isFinite(t) ? new Date(t) : null
      const date = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null
      const profile = r['Profile Name'] || undefined
      if (profile) profiles.add(profile)
      if (r['Title']) rows.push({ title: r['Title'], date, profile })
    }
    return { format: 'full', rows, profiles: [...profiles] }
  }

  const order = inferDateOrder(
    raw.map((r) => r['Date'] ?? '').filter(Boolean),
    fallbackOrder,
  )
  const rows = raw
    .filter((r) => r['Title'])
    .map((r) => ({ title: r['Title'], date: parseNetflixDate(r['Date'] ?? '', order) }))
  return { format: 'simple', rows, profiles: [] }
}

/** Accepts the raw .csv or the data-download .zip. */
export async function readNetflixFile(file: File, fallbackOrder?: DateOrder): Promise<ParsedNetflix> {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (file.name.toLowerCase().endsWith('.zip')) {
    const entries = unzipSync(buf)
    const names = Object.keys(entries)
    const pick =
      names.find((n) => /viewingactivity\.csv$/i.test(n)) ??
      names.find((n) => /netflixviewinghistory\.csv$/i.test(n))
    if (!pick) throw new Error('Im ZIP wurde keine ViewingActivity.csv gefunden.')
    return parseNetflixCsv(strFromU8(entries[pick]), fallbackOrder)
  }
  return parseNetflixCsv(strFromU8(buf), fallbackOrder)
}

// ---------------------------------------------------------------- titles ---

export type ParsedTitle =
  | { kind: 'episode'; show: string; season: number; episodeTitle: string; epNumber: number | null }
  | { kind: 'movie'; title: string }

const SEASON_MARKER =
  /^(?:Season|Staffel|Saison|Temporada|Stagione|Series|Serie|Part|Teil|Partie|Volume|Vol\.?|Book|Buch|Chapter|Kapitel|Collection|Kollektion)\s*(\d+)$/i
const LIMITED = /^(?:Limited Series|Miniserie|Mini-Serie|Minisérie|Mini Series|Collection|Kollektion)$/i
const EPISODE_NO = /^(?:Episode|Folge|Ep\.?|Épisode)\s*(\d+)$/i

/**
 * "Severance: Season 2: Hello, Ms. Cobel" / "Dark: Staffel 1: Geheimnisse" →
 * show + season + episode title. Anything without a season marker is a film.
 */
export function parseNetflixTitle(title: string): ParsedTitle {
  const parts = title.split(': ').map((p) => p.trim())
  for (let i = 1; i < parts.length; i++) {
    // an episode always has a title after the marker — "Kill Bill: Vol. 1" is a film
    if (i === parts.length - 1) break
    const m = parts[i].match(SEASON_MARKER)
    const limited = LIMITED.test(parts[i])
    if (!m && !limited) continue
    const episodeTitle = parts.slice(i + 1).join(': ')
    const no = episodeTitle.match(EPISODE_NO)
    return {
      kind: 'episode',
      show: parts.slice(0, i).join(': '),
      season: m ? Number(m[1]) : 1,
      episodeTitle,
      epNumber: no ? Number(no[1]) : null,
    }
  }
  return { kind: 'movie', title: title.trim() }
}

// -------------------------------------------------------------- grouping ---

export interface WatchedEntry {
  season: number
  episodeTitle: string
  epNumber: number | null
  /** earliest viewing date */
  date: string | null
}

export interface ShowWatch {
  title: string
  entries: WatchedEntry[]
  lastDate: string | null
}

export interface MovieWatch {
  title: string
  date: string | null
}

const earlier = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b))
const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b))

export function groupNetflix(rows: NetflixRow[]): { shows: ShowWatch[]; movies: MovieWatch[] } {
  const shows = new Map<string, ShowWatch>()
  const movies = new Map<string, MovieWatch>()

  for (const row of rows) {
    const p = parseNetflixTitle(row.title)
    if (p.kind === 'movie') {
      const k = norm(p.title)
      const prev = movies.get(k)
      movies.set(k, { title: p.title, date: prev ? earlier(prev.date, row.date) : row.date })
      continue
    }
    const k = norm(p.show)
    const show = shows.get(k) ?? { title: p.show, entries: [], lastDate: null }
    const same = show.entries.find(
      (e) => e.season === p.season && norm(e.episodeTitle) === norm(p.episodeTitle) && e.epNumber === p.epNumber,
    )
    if (same) same.date = earlier(same.date, row.date)
    else show.entries.push({ season: p.season, episodeTitle: p.episodeTitle, epNumber: p.epNumber, date: row.date })
    show.lastDate = later(show.lastDate, row.date)
    shows.set(k, show)
  }

  return {
    shows: [...shows.values()].sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')),
    movies: [...movies.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
  }
}

// -------------------------------------------------------------- progress ---

export interface SeasonInfo {
  number: number
  episodeCount: number
}

export interface ResolvedProgress {
  /** furthest absolute episode the user has reached */
  position: number
  /** true when part of it is a guess (episode titles could not be matched) */
  estimated: boolean
  /** history for the heatmap / stats: the position reached by each date */
  steps: { to: number; date: string | null }[]
  /** distinct episodes seen */
  watched: number
}

function latestEntryDate(entries: WatchedEntry[]): string | null {
  const dates = entries.map((e) => e.date).filter((d): d is string => !!d)
  return dates.length ? dates.sort()[dates.length - 1] : null
}

/**
 * Turn "watched these titled episodes" into our single high-water-mark
 * position. Titles are matched against TMDB's episode names; what cannot be
 * matched still counts as "watched N episodes of that season".
 */
export function resolveProgress(
  entries: WatchedEntry[],
  seasons: SeasonInfo[],
  episodesBySeason: Map<number, { number: number; name: string }[]>,
): ResolvedProgress {
  const real = seasons.filter((s) => s.number > 0).sort((a, b) => a.number - b.number)
  const start = new Map<number, number>()
  let acc = 0
  for (const s of real) {
    start.set(s.number, acc)
    acc += s.episodeCount
  }

  const bySeason = new Map<number, WatchedEntry[]>()
  for (const e of entries) {
    if (!start.has(e.season)) continue // TMDB doesn't know this season
    const list = bySeason.get(e.season) ?? []
    list.push(e)
    bySeason.set(e.season, list)
  }

  const mapped: { abs: number; date: string | null }[] = []
  let position = 0
  let estimated = false

  for (const [season, list] of bySeason) {
    const base = start.get(season)!
    const names = (episodesBySeason.get(season) ?? []).map((e) => ({ n: e.number, key: norm(e.name) }))
    let maxMapped = 0
    for (const e of list) {
      const byName = e.episodeTitle ? names.find((x) => x.key && x.key === norm(e.episodeTitle)) : undefined
      const number = e.epNumber ?? byName?.n ?? null
      if (number != null) {
        maxMapped = Math.max(maxMapped, number)
        mapped.push({ abs: base + number, date: e.date })
      }
    }
    if (list.length > maxMapped) estimated = true
    position = Math.max(position, base + Math.max(maxMapped, list.length))
  }

  // chronological high-water mark, one step per position gain
  const dated = mapped
    .filter((m) => m.date)
    .sort((a, b) => a.date!.localeCompare(b.date!) || a.abs - b.abs)
  const steps: ResolvedProgress['steps'] = []
  let reached = 0
  for (const m of dated) {
    if (m.abs > reached) {
      reached = m.abs
      steps.push({ to: reached, date: m.date })
    }
  }
  if (position > reached) {
    steps.push({ to: position, date: latestEntryDate(entries) })
  }

  return { position, estimated, steps, watched: entries.length }
}
