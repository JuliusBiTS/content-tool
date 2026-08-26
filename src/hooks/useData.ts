import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Item, ItemStatus, MediaKind, ProgressEvent } from '../lib/types'

const activeSort = (a: Item, b: Item) =>
  (b.updated_at ?? '').localeCompare(a.updated_at ?? '')

const titleSort = (a: Item, b: Item) => a.sort_title.localeCompare(b.sort_title)

export function useAllItems(): Item[] | undefined {
  return useLiveQuery(async () => {
    const items = await db.items.toArray()
    return items.filter((i) => !i.deleted_at)
  })
}

export function useContinueWatching(): Item[] | undefined {
  return useLiveQuery(async () => {
    const items = await db.items.where('status').equals('watching').toArray()
    return items.filter((i) => !i.deleted_at).sort(activeSort)
  })
}

export function useUpNext(): Item[] | undefined {
  return useLiveQuery(async () => {
    const items = await db.items.where('status').equals('planned').toArray()
    return items.filter((i) => !i.deleted_at).sort(titleSort)
  })
}

export interface LibraryFilter {
  kind: MediaKind | 'all'
  status: ItemStatus | 'all'
  query: string
}

export function useLibrary(filter: LibraryFilter): Item[] | undefined {
  return useLiveQuery(async () => {
    let items = (await db.items.toArray()).filter((i) => !i.deleted_at)
    if (filter.kind !== 'all') items = items.filter((i) => i.kind === filter.kind)
    if (filter.status !== 'all') items = items.filter((i) => i.status === filter.status)
    const q = filter.query.trim().toLowerCase()
    if (q) items = items.filter((i) => i.title.toLowerCase().includes(q))
    return items.sort(titleSort)
  }, [filter.kind, filter.status, filter.query])
}

export function useItem(id: string | undefined): Item | undefined {
  return useLiveQuery(() => (id ? db.items.get(id) : undefined), [id])
}

export function useItemEvents(id: string | undefined): ProgressEvent[] | undefined {
  return useLiveQuery(async () => {
    if (!id) return []
    const evs = await db.events.where('item_id').equals(id).toArray()
    return evs.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  }, [id])
}

export function useRecentEvents(limit = 400): ProgressEvent[] | undefined {
  return useLiveQuery(async () => {
    const evs = await db.events.orderBy('occurred_at').reverse().limit(limit).toArray()
    return evs
  }, [limit])
}
