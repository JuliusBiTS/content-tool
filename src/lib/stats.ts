import type { Item, MediaKind, ProgressEvent } from './types'

const DEFAULT_RUNTIME: Partial<Record<MediaKind, number>> = {
  series: 45,
  anime: 24,
  movie: 110,
}

function runtimeFor(item: Item): number {
  return item.metadata.runtimeMinutes ?? DEFAULT_RUNTIME[item.kind] ?? 30
}

export interface Insights {
  counts: Map<string, number> // heatmap: day -> activity units
  minutesWindow: (days: number) => number
  unitsWindow: (days: number) => number
  minutesTotal: number
  streak: number
  bestWeekday: { day: string; n: number } | null
  monthly: { label: string; minutes: number }[]
  byKind: { kind: MediaKind; n: number }[]
  completed: number
  active: number
  dropRate: number
  genres: { name: string; n: number }[]
  creators: { name: string; n: number }[]
  calibration: { delta: number; sample: number } | null
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function computeInsights(items: Item[], events: ProgressEvent[]): Insights {
  const byId = new Map(items.map((i) => [i.id, i]))
  const progress = events.filter((e) => e.kind === 'progress')
  const now = Date.now()

  // --- daily activity (heatmap) + minutes ---
  const counts = new Map<string, number>()
  const weekdayMin = new Array(7).fill(0)
  const monthMin = new Map<string, number>()
  let minutesTotal = 0

  const eventMinutes = (e: ProgressEvent): { minutes: number; units: number } => {
    const item = byId.get(e.item_id)
    const delta = Math.max(0, (e.to_position ?? 0) - (e.from_position ?? 0))
    if (!item || delta <= 0) return { minutes: 0, units: 0 }
    if (item.kind === 'book' || item.kind === 'manga') return { minutes: 0, units: delta }
    if (item.kind === 'movie') return { minutes: runtimeFor(item), units: 1 }
    return { minutes: delta * runtimeFor(item), units: delta }
  }

  for (const e of progress) {
    const day = e.occurred_at.slice(0, 10)
    const { minutes, units } = eventMinutes(e)
    counts.set(day, (counts.get(day) ?? 0) + Math.min(units || 1, 20))
    minutesTotal += minutes
    const d = new Date(e.occurred_at)
    weekdayMin[d.getDay()] += minutes
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMin.set(mk, (monthMin.get(mk) ?? 0) + minutes)
  }

  const windowSum = (days: number, pick: 'minutes' | 'units') =>
    progress
      .filter((e) => now - Date.parse(e.occurred_at) < days * 864e5)
      .reduce((n, e) => n + eventMinutes(e)[pick], 0)

  // --- streak ---
  let streak = 0
  for (let i = 0; i < 500; i++) {
    const d = new Date(now - i * 864e5).toISOString().slice(0, 10)
    if (counts.has(d)) streak++
    else if (i > 0) break
  }

  // --- best weekday ---
  let bestWeekday: Insights['bestWeekday'] = null
  const maxWd = Math.max(...weekdayMin)
  if (maxWd > 0) {
    const idx = weekdayMin.indexOf(maxWd)
    bestWeekday = { day: WEEKDAYS[idx], n: Math.round(maxWd / 60) }
  }

  // --- last 6 months ---
  const monthly: Insights['monthly'] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthly.push({
      label: d.toLocaleDateString('de-DE', { month: 'short' }),
      minutes: Math.round(monthMin.get(mk) ?? 0),
    })
  }

  // --- collection ---
  const kinds: MediaKind[] = ['series', 'movie', 'anime', 'manga', 'book']
  const byKind = kinds.map((kind) => ({
    kind,
    n: items.filter((i) => i.kind === kind).length,
  }))
  const completed = items.filter((i) => i.status === 'done').length
  const active = items.filter((i) => i.status === 'watching').length
  const dropped = items.filter((i) => i.status === 'dropped').length
  const started = items.filter((i) => i.status !== 'planned').length

  // --- taste ---
  const genreCount = new Map<string, number>()
  const creatorCount = new Map<string, number>()
  for (const i of items) {
    if (i.status === 'planned') continue
    const weight = i.rating ? Math.max(1, Math.round(i.rating / 2)) : 1
    for (const g of i.metadata.genres ?? [])
      genreCount.set(g, (genreCount.get(g) ?? 0) + weight)
    for (const c of i.metadata.creators ?? [])
      creatorCount.set(c, (creatorCount.get(c) ?? 0) + weight)
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, n: count }))

  // --- rating calibration ---
  const rated = items.filter(
    (i) => i.rating != null && i.metadata.externalRating != null,
  )
  // item rating is stored in half-star units (1..10) → already a 0..10 scale
  const calibration =
    rated.length >= 4
      ? {
          delta:
            rated.reduce((s, i) => s + (i.rating! - i.metadata.externalRating!), 0) /
            rated.length,
          sample: rated.length,
        }
      : null

  return {
    counts,
    minutesWindow: (d) => Math.round(windowSum(d, 'minutes')),
    unitsWindow: (d) => Math.round(windowSum(d, 'units')),
    minutesTotal: Math.round(minutesTotal),
    streak,
    bestWeekday,
    monthly,
    byKind,
    completed,
    active,
    dropRate: started ? dropped / started : 0,
    genres: top(genreCount, 6),
    creators: top(creatorCount, 5),
    calibration,
  }
}

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} Min`
  const h = minutes / 60
  if (h < 100) return `${h.toFixed(h < 10 ? 1 : 0)} Std`
  return `${Math.round(h)} Std`
}
