import { db, getMeta, setMeta } from './db'
import { getShow, airingWindow, type AiringEntry } from './shows'
import type { Item } from './types'

const SEEN_KEY = 'airing:lastSeenAt'

async function watchingShows(): Promise<Item[]> {
  const items = await db.items.where('status').anyOf('watching', 'paused').toArray()
  return items.filter(
    (i) => !i.deleted_at && (i.kind === 'series' || i.kind === 'anime'),
  )
}

/** Warm / refresh the per-show TMDB cache for shows the user is watching. */
export async function refreshAiringCache(): Promise<void> {
  const shows = await watchingShows()
  // small concurrency
  const queue = [...shows]
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      await getShow(item).catch(() => null)
    }
  })
  await Promise.all(workers)
}

export async function upcomingEntries(
  daysBack = 10,
  daysAhead = 21,
): Promise<AiringEntry[]> {
  return airingWindow(await watchingShows(), daysBack, daysAhead)
}

/** Episodes that have aired since the user last looked, that they haven't watched. */
export async function unseenAiredCount(): Promise<number> {
  const seenAt = (await getMeta(SEEN_KEY)) ?? '1970-01-01'
  const entries = await airingWindow(await watchingShows(), 30, 0)
  const now = Date.now()
  return entries.filter(
    (e) => !e.watched && e.airDate > seenAt && Date.parse(e.airDate) <= now,
  ).length
}

export async function markAiringSeen(): Promise<void> {
  await setMeta(SEEN_KEY, new Date().toISOString().slice(0, 10))
}
