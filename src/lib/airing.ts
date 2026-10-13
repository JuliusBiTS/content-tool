import { db, getMeta, setMeta } from './db'
import { getShow, airingWindow, tvId, type AiringEntry } from './shows'
import { refreshReleases, releaseWindow } from './releases'
import { releaseKey } from './releaseLogic'
import type { Item } from './types'

const SEEN_KEY = 'airing:seenKeys'
const MAX_SEEN = 400
/** The calendar, the badge and "seen" must all look at the same window. */
export const DAYS_BACK = 10
export const DAYS_AHEAD = 21

const isEpisodic = (i: Item) => i.kind === 'series' || i.kind === 'anime'

/**
 * TMDB series that can have new episodes: being watched or paused, plus
 * finished ones — a finished show gets a new season sooner or later.
 */
export async function trackedTvItems(): Promise<Item[]> {
  const items = await db.items.where('kind').anyOf('series', 'anime').toArray()
  return items.filter(
    (i) =>
      !i.deleted_at &&
      isEpisodic(i) &&
      tvId(i) != null &&
      (i.status === 'watching' || i.status === 'paused' || i.status === 'done'),
  )
}

/**
 * AniList anime and manga that are being followed. Finished ones are skipped:
 * an AniList entry is one cour / one run, a new season is a new entry.
 */
export async function trackedReleaseItems(): Promise<Item[]> {
  const items = await db.items.where('kind').anyOf('anime', 'manga').toArray()
  return items.filter(
    (i) =>
      !i.deleted_at &&
      releaseKey(i) != null &&
      (i.status === 'watching' || i.status === 'paused'),
  )
}

export async function trackedItems(): Promise<Item[]> {
  return [...(await trackedTvItems()), ...(await trackedReleaseItems())]
}

/** Cheap fingerprint of "which media are we following?" — change ⇒ refresh. */
export async function trackedSignature(): Promise<string> {
  return (await trackedItems())
    .map((i) => `${i.id}:${i.status}`)
    .sort()
    .join('|')
}

export interface RefreshOptions {
  /** re-check airing shows now, even if their cache is still fresh */
  force?: boolean
}

/**
 * Bring every release cache up to date: TMDB shows (finished ones get a cheap
 * probe, upgraded to a full fetch if something new is coming), AniList anime
 * in one batch, and MangaDex chapters.
 */
export async function refreshAiringCache(opts: RefreshOptions = {}): Promise<void> {
  const queue = [...(await trackedTvItems())]
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      const done = item.status === 'done'
      await getShow(item, { probe: done, force: !done && opts.force }).catch(() => null)
    }
  })
  await Promise.all(workers)
  await refreshReleases(await trackedReleaseItems(), { force: opts.force })
}

const entryTime = (e: AiringEntry) => Date.parse(e.airDate)

/** Everything airing / released inside the window, across all media, in time order. */
export async function calendarWindow(daysBack: number, daysAhead: number): Promise<AiringEntry[]> {
  const [tv, rel] = await Promise.all([
    trackedTvItems().then((items) => airingWindow(items, daysBack, daysAhead)),
    trackedReleaseItems().then((items) => releaseWindow(items, daysBack, daysAhead)),
  ])
  return [...tv, ...rel].sort((a, b) => entryTime(a) - entryTime(b))
}

export async function upcomingEntries(daysBack = DAYS_BACK, daysAhead = DAYS_AHEAD): Promise<AiringEntry[]> {
  return calendarWindow(daysBack, daysAhead)
}

const keyOf = (e: AiringEntry) => `${e.item.id}:${e.episode.season}:${e.episode.number}`
const hasAired = (e: AiringEntry) => entryTime(e) <= Date.now()

async function loadSeen(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await getMeta(SEEN_KEY)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/** Aired, unwatched episodes the user hasn't looked at on "Diese Woche" yet. */
export async function unseenAiredCount(): Promise<number> {
  const seen = await loadSeen()
  const entries = await calendarWindow(DAYS_BACK, 0)
  return entries.filter((e) => !e.watched && hasAired(e) && !seen.has(keyOf(e))).length
}

/** Remember exactly which episodes were on screen, so tomorrow's still count as new. */
export async function markAiringSeen(): Promise<void> {
  const seen = await loadSeen()
  const before = seen.size
  const entries = await calendarWindow(DAYS_BACK, 0)
  for (const e of entries) if (!e.watched && hasAired(e)) seen.add(keyOf(e))
  if (seen.size === before) return
  await setMeta(SEEN_KEY, JSON.stringify([...seen].slice(-MAX_SEEN)))
}
