import Dexie, { type EntityTable } from 'dexie'
import type {
  EpisodeNote,
  Item,
  OutboxOp,
  ProgressEvent,
  ShowCache,
} from './types'

/**
 * Local-first cache. The app reads/writes here first; the sync engine
 * (see sync.ts) drains the outbox to Supabase and pulls deltas back.
 *
 * `shows` and `palettes` are derived-from-TMDB caches — never synced, each
 * device refills them on demand.
 */
class MediaLogDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  events!: EntityTable<ProgressEvent, 'id'>
  episodeNotes!: EntityTable<EpisodeNote, 'id'>
  outbox!: EntityTable<OutboxOp, 'id'>
  meta!: EntityTable<{ key: string; value: string }, 'key'>
  shows!: EntityTable<ShowCache, 'tmdbId'>
  palettes!: EntityTable<{ url: string; hex: string }, 'url'>

  constructor() {
    super('medialog')
    this.version(1).stores({
      items: 'id, status, kind, updated_at, sort_title',
      events: 'id, item_id, occurred_at',
      outbox: 'id, created_at',
      meta: 'key',
    })
    this.version(2).stores({
      items: 'id, status, kind, updated_at, sort_title',
      events: 'id, item_id, occurred_at',
      outbox: 'id, created_at',
      meta: 'key',
      shows: 'tmdbId, fetchedAt',
      palettes: 'url',
    })
    this.version(3).stores({
      items: 'id, status, kind, updated_at, sort_title',
      events: 'id, item_id, occurred_at',
      episodeNotes: 'id, item_id, updated_at',
      outbox: 'id, created_at',
      meta: 'key',
      shows: 'tmdbId, fetchedAt',
      palettes: 'url',
    })
  }
}

export const db = new MediaLogDB()

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}
