import { db } from './db'
import { tvId, nextEpisode } from './shows'
import { freshReleaseAt, releaseKey } from './releaseLogic'
import type { Item } from './types'

/** The next unread episode / chapter counts as "new" for this many days. */
export const FRESH_DAYS = 14

export interface ContinueRow {
  item: Item
  /** when the next unread unit came out, if that was recent */
  freshAt: number | null
  /** the user's own last progress, not the last background touch */
  lastActivity: number
}

/**
 * Titles with something new waiting come first (newest release on top), the
 * rest by when the user last actually watched or read them.
 */
export function rankContinue(rows: ContinueRow[]): ContinueRow[] {
  return [...rows].sort((a, b) => {
    if (a.freshAt != null && b.freshAt != null) return b.freshAt - a.freshAt
    if (a.freshAt != null) return -1
    if (b.freshAt != null) return 1
    return b.lastActivity - a.lastActivity
  })
}

async function lastActivityOf(item: Item): Promise<number> {
  const events = await db.events.where('item_id').equals(item.id).toArray()
  let last = 0
  for (const e of events) {
    if (e.kind !== 'progress' && e.kind !== 'rewatch') continue
    const t = Date.parse(e.occurred_at)
    if (t > last) last = t
  }
  if (last) return last
  return Date.parse(item.started_at ?? item.created_at) || 0
}

async function freshAtOf(item: Item, now: number): Promise<number | null> {
  const id = tvId(item)
  if (id != null) {
    const ne = nextEpisode(item, (await db.shows.get(id)) ?? null)
    if (!ne?.airDate || ne.upcoming) return null
    const t = Date.parse(ne.airDate)
    return Number.isFinite(t) && now - t <= FRESH_DAYS * 864e5 ? t : null
  }
  const key = releaseKey(item)
  if (key) return freshReleaseAt(item, await db.releases.get(key), FRESH_DAYS, now)
  return null
}

export async function loadContinueRows(now = Date.now()): Promise<ContinueRow[]> {
  const items = (await db.items.where('status').equals('watching').toArray()).filter(
    (i) => !i.deleted_at,
  )
  const rows = await Promise.all(
    items.map(async (item) => ({
      item,
      freshAt: await freshAtOf(item, now),
      lastActivity: await lastActivityOf(item),
    })),
  )
  return rankContinue(rows)
}
