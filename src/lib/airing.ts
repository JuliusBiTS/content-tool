import { db, getMeta, setMeta } from './db'
import { getShow, airingWindow, tvId, type AiringEntry } from './shows'
import type { Item } from './types'

const SEEN_KEY = 'airing:seenKeys'
const MAX_SEEN = 400
/** The calendar, the badge and "seen" must all look at the same window. */
export const DAYS_BACK = 10
export const DAYS_AHEAD = 21

const isEpisodic = (i: Item) => i.kind === 'series' || i.kind === 'anime'

/**
 * Everything that can have new episodes: shows being watched or paused, plus
 * finished ones — a finished show gets a new season sooner or later.
 */
export async function trackedItems(): Promise<Item[]> {
  const items = await db.items.where('kind').anyOf('series', 'anime').toArray()
  return items.filter(
    (i) =>
      !i.deleted_at &&
      isEpisodic(i) &&
      tvId(i) != null &&
      (i.status === 'watching' || i.status === 'paused' || i.status === 'done'),
  )
}

/** Cheap fingerprint of "which shows are we following?" — change ⇒ refresh. */
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
 * Bring the per-show TMDB cache up to date. Only airing shows are re-fetched
 * often; finished ones get a cheap probe and are upgraded to a full fetch if
 * TMDB says something new is coming.
 */
export async function refreshAiringCache(opts: RefreshOptions = {}): Promise<void> {
  const items = await trackedItems()
  const queue = [...items]
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      const done = item.status === 'done'
      await getShow(item, { probe: done, force: !done && opts.force }).catch(() => null)
    }
  })
  await Promise.all(workers)
}

export async function upcomingEntries(daysBack = DAYS_BACK, daysAhead = DAYS_AHEAD): Promise<AiringEntry[]> {
  return airingWindow(await trackedItems(), daysBack, daysAhead)
}

const keyOf = (e: AiringEntry) => `${e.item.id}:${e.episode.season}:${e.episode.number}`
const hasAired = (e: AiringEntry) => Date.parse(e.airDate) <= Date.now()

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
  const entries = await airingWindow(await trackedItems(), DAYS_BACK, 0)
  return entries.filter((e) => !e.watched && hasAired(e) && !seen.has(keyOf(e))).length
}

/** Remember exactly which episodes were on screen, so tomorrow's still count as new. */
export async function markAiringSeen(): Promise<void> {
  const seen = await loadSeen()
  const before = seen.size
  const entries = await airingWindow(await trackedItems(), DAYS_BACK, 0)
  for (const e of entries) if (!e.watched && hasAired(e)) seen.add(keyOf(e))
  if (seen.size === before) return
  await setMeta(SEEN_KEY, JSON.stringify([...seen].slice(-MAX_SEEN)))
}
