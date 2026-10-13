import type { Item, ReleaseCache, ReleaseEntry } from './types'

/** Daily automatic re-check; the manual refresh button forces it any time. */
export const RELEASE_LIVE_FRESH_MS = 24 * 60 * 60 * 1000
export const RELEASE_ENDED_FRESH_MS = 14 * 24 * 60 * 60 * 1000
/** How long to remember that a manga has no MangaDex match. */
export const NO_MATCH_RETRY_MS = 30 * 24 * 60 * 60 * 1000
/** A chapter this far behind the newest one is a re-upload, not a release. */
export const CHAPTER_NOISE_GAP = 15

/** Only AniList-sourced anime / manga have release data. */
export function releaseKey(item: Pick<Item, 'kind' | 'source' | 'source_id'>): string | null {
  if (item.source !== 'anilist' || !item.source_id) return null
  if (item.kind !== 'anime' && item.kind !== 'manga') return null
  return `${item.kind}:${item.source_id}`
}

export const isLiveStatus = (status: string | null): boolean =>
  status === 'releasing' || status === 'upcoming' || status === 'hiatus' || status == null

export function isReleaseFresh(c: ReleaseCache, now = Date.now()): boolean {
  const age = now - Date.parse(c.fetchedAt)
  return age < (isLiveStatus(c.status) ? RELEASE_LIVE_FRESH_MS : RELEASE_ENDED_FRESH_MS)
}

/** AniList media status → our short vocabulary. */
export function normalizeAniListStatus(s: string | null | undefined): string | null {
  switch (s) {
    case 'RELEASING':
      return 'releasing'
    case 'FINISHED':
      return 'finished'
    case 'NOT_YET_RELEASED':
      return 'upcoming'
    case 'CANCELLED':
      return 'cancelled'
    case 'HIATUS':
      return 'hiatus'
    default:
      return null
  }
}

/** MangaDex publication status → our vocabulary. */
export function normalizeMangaDexStatus(s: string | null | undefined): string | null {
  switch (s) {
    case 'ongoing':
      return 'releasing'
    case 'completed':
      return 'finished'
    case 'hiatus':
      return 'hiatus'
    case 'cancelled':
      return 'cancelled'
    default:
      return null
  }
}

interface MdChapter {
  attributes: { chapter: string | null; publishAt?: string; readableAt?: string }
}

/**
 * Distinct, integer chapter numbers with the *earliest* publish time (English
 * and German uploads of the same chapter collapse into one release). Chapters
 * far below the newest one are re-uploads of old material and are dropped.
 */
export function chaptersFromFeed(feed: MdChapter[]): {
  entries: ReleaseEntry[]
  latest: number | null
} {
  const earliest = new Map<number, number>()
  for (const c of feed) {
    const n = Number(c.attributes.chapter)
    if (!Number.isInteger(n) || n <= 0) continue
    const t = Date.parse(c.attributes.publishAt ?? c.attributes.readableAt ?? '')
    if (!Number.isFinite(t)) continue
    const prev = earliest.get(n)
    if (prev == null || t < prev) earliest.set(n, t)
  }
  if (!earliest.size) return { entries: [], latest: null }

  const latest = Math.max(...earliest.keys())
  const entries = [...earliest.entries()]
    .filter(([n]) => n >= latest - CHAPTER_NOISE_GAP)
    .map(([number, t]) => ({ number, at: new Date(t).toISOString() }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.number - b.number)
  return { entries, latest }
}

/** AniList schedule nodes → entries sorted by time. */
export function animeEntries(nodes: { episode: number; airingAt: number }[]): ReleaseEntry[] {
  return nodes
    .map((n) => ({ number: n.episode, at: new Date(n.airingAt * 1000).toISOString() }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** Newest episode that has already aired, from the schedule + the "next" pointer. */
export function latestAired(
  entries: ReleaseEntry[],
  next: { episode: number } | null,
  now = Date.now(),
): number | null {
  if (next) return Math.max(0, next.episode - 1) || null
  const aired = entries.filter((e) => Date.parse(e.at) <= now).map((e) => e.number)
  return aired.length ? Math.max(...aired) : null
}

/**
 * What to write back to the user's item: manga ids + latest chapter, and a
 * known total once a series has an end (so progress bars become meaningful).
 */
export function planReleaseItemUpdate(item: Item, c: ReleaseCache): Partial<Item> {
  const patch: Partial<Item> = {}
  const meta = { ...item.metadata }
  let changed = false

  if (item.kind === 'manga') {
    if (c.externalId != null && meta.mangadexId !== c.externalId) {
      meta.mangadexId = c.externalId
      changed = true
    }
    if (c.latest != null && meta.latestChapter !== c.latest) {
      meta.latestChapter = c.latest
      changed = true
    }
  }

  if (c.total != null && c.status === 'finished' && item.total_units == null) {
    patch.total_units = c.total
    if (item.kind === 'anime' && !(meta.seasons?.length)) {
      meta.seasons = [{ number: 1, name: 'Staffel 1', episodeCount: c.total }]
      changed = true
    }
  }

  if (changed) patch.metadata = meta
  return patch
}

export interface NextRelease {
  number: number
  /** ISO datetime, or null when it is simply "already out" */
  at: string | null
  upcoming: boolean
  /** how many released units the user hasn't consumed yet */
  behind: number
}

/** The next anime episode / manga chapter for this item, if release data allows. */
export function nextRelease(
  item: Pick<Item, 'current_position'>,
  c: ReleaseCache | null | undefined,
  now = Date.now(),
): NextRelease | null {
  if (!c) return null
  const want = item.current_position + 1
  const exact = c.entries.find((e) => e.number === want)
  const behind = c.latest != null ? Math.max(0, c.latest - item.current_position) : 0

  if (exact) {
    return { number: want, at: exact.at, upcoming: Date.parse(exact.at) > now, behind }
  }
  if (c.latest != null && want <= c.latest) {
    return { number: want, at: null, upcoming: false, behind }
  }
  // caught up → the soonest future entry
  const future = c.entries
    .filter((e) => Date.parse(e.at) > now)
    .sort((a, b) => a.at.localeCompare(b.at))[0]
  return future ? { number: future.number, at: future.at, upcoming: true, behind: 0 } : null
}

/** Next unread unit aired within `days` days? Drives the "Neu" badge and ordering. */
export function freshReleaseAt(
  item: Pick<Item, 'current_position'>,
  c: ReleaseCache | null | undefined,
  days: number,
  now = Date.now(),
): number | null {
  if (!c) return null
  const e = c.entries.find((x) => x.number === item.current_position + 1)
  if (!e) return null
  const t = Date.parse(e.at)
  if (!Number.isFinite(t) || t > now) return null
  return now - t <= days * 864e5 ? t : null
}
