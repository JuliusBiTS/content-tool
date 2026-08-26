import Dexie, { type EntityTable } from 'dexie'
import type { Item, OutboxOp, ProgressEvent } from './types'

/**
 * Local-first cache. The app reads/writes here first; the sync engine
 * (see sync.ts) drains the outbox to Supabase and pulls deltas back.
 */
class MediaLogDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  events!: EntityTable<ProgressEvent, 'id'>
  outbox!: EntityTable<OutboxOp, 'id'>
  meta!: EntityTable<{ key: string; value: string }, 'key'>

  constructor() {
    super('medialog')
    this.version(1).stores({
      items: 'id, status, kind, updated_at, sort_title',
      events: 'id, item_id, occurred_at',
      outbox: 'id, created_at',
      meta: 'key',
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
