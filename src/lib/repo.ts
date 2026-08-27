import { db } from './db'
import { isComplete, stepSize } from './progress'
import type {
  Item,
  ItemMetadata,
  ItemStatus,
  MediaKind,
  ProgressEvent,
  SearchResult,
} from './types'
import { resolveMeta } from './search'
import { queueSync } from './sync'

function uuid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

async function enqueue(
  table: 'items' | 'events',
  op: 'insert' | 'update',
  row_id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.outbox.add({ id: uuid(), table, op, row_id, payload, created_at: now() })
  queueSync()
}

// ---------- Create ----------

export async function addFromSearch(
  result: SearchResult,
  opts: { userId: string; status: ItemStatus; kindOverride?: MediaKind },
): Promise<Item> {
  const resolved = await resolveMeta(result)
  const ts = now()
  const kind = opts.kindOverride ?? result.kind
  const item: Item = {
    id: uuid(),
    user_id: opts.userId,
    kind,
    title: result.title,
    sort_title: result.title.toLowerCase().replace(/^(the|a|an|der|die|das) /i, ''),
    poster_url: result.poster_url,
    backdrop_url: null,
    source: result.source,
    source_id: result.source_id,
    status: opts.status,
    rating: null,
    current_position: 0,
    total_units: resolved.total_units,
    metadata: resolved.metadata,
    started_at: opts.status === 'watching' ? ts : null,
    finished_at: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }
  await db.items.add(item)
  await enqueue('items', 'insert', item.id, item as unknown as Record<string, unknown>)
  await logEvent(item, 'add', null, null, null)
  return item
}

/**
 * Bulk-import a film without a metadata detail round-trip (used by the
 * Letterboxd importer). `result` may be a TMDB search hit or a manual stub.
 */
export async function importFilm(opts: {
  userId: string
  title: string
  year: number | null
  posterUrl: string | null
  source: Item['source']
  sourceId: string | null
  status: ItemStatus
  rating: number | null
  watchedAt: string | null
}): Promise<Item> {
  const ts = now()
  const done = opts.status === 'done'
  const item: Item = {
    id: uuid(),
    user_id: opts.userId,
    kind: 'movie',
    title: opts.title,
    sort_title: opts.title.toLowerCase().replace(/^(the|a|an|der|die|das) /i, ''),
    poster_url: opts.posterUrl,
    backdrop_url: null,
    source: opts.source,
    source_id: opts.sourceId,
    status: opts.status,
    rating: opts.rating,
    current_position: done ? 1 : 0,
    total_units: null,
    metadata: opts.year ? { year: opts.year } : {},
    started_at: done ? (opts.watchedAt ?? ts) : null,
    finished_at: done ? (opts.watchedAt ?? ts) : null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }
  await db.items.add(item)
  await enqueue('items', 'insert', item.id, item as unknown as Record<string, unknown>)
  await logEvent(item, 'add', null, null, null)
  if (opts.rating != null) await logEvent(item, 'rating', null, opts.rating, null)
  return item
}

export async function addManual(opts: {
  userId: string
  kind: MediaKind
  title: string
  status: ItemStatus
  totalUnits: number | null
}): Promise<Item> {
  const ts = now()
  const item: Item = {
    id: uuid(),
    user_id: opts.userId,
    kind: opts.kind,
    title: opts.title,
    sort_title: opts.title.toLowerCase(),
    poster_url: null,
    backdrop_url: null,
    source: 'manual',
    source_id: null,
    status: opts.status,
    rating: null,
    current_position: 0,
    total_units: opts.totalUnits,
    metadata: {},
    started_at: opts.status === 'watching' ? ts : null,
    finished_at: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }
  await db.items.add(item)
  await enqueue('items', 'insert', item.id, item as unknown as Record<string, unknown>)
  await logEvent(item, 'add', null, null, null)
  return item
}

// ---------- Progress ----------

async function logEvent(
  item: Item,
  kind: ProgressEvent['kind'],
  from: number | null,
  to: number | null,
  note: string | null,
): Promise<void> {
  const ev: ProgressEvent = {
    id: uuid(),
    user_id: item.user_id,
    item_id: item.id,
    kind,
    from_position: from,
    to_position: to,
    note,
    occurred_at: now(),
    created_at: now(),
  }
  await db.events.add(ev)
  await enqueue('events', 'insert', ev.id, ev as unknown as Record<string, unknown>)
}

async function patchItem(item: Item, patch: Partial<Item>): Promise<Item> {
  const updated: Item = { ...item, ...patch, updated_at: now() }
  await db.items.put(updated)
  await enqueue('items', 'update', item.id, { ...patch, updated_at: updated.updated_at })
  return updated
}

/** The core "+1" action. Returns the updated item. */
export async function bumpProgress(item: Item, deltaOverride?: number): Promise<Item> {
  const from = item.current_position
  const to = Math.max(0, from + (deltaOverride ?? stepSize(item)))
  return setPosition(item, to, from)
}

export async function setPosition(item: Item, to: number, from = item.current_position): Promise<Item> {
  const patch: Partial<Item> = { current_position: to }

  if (item.status === 'planned' && to > 0) {
    patch.status = 'watching'
    patch.started_at = item.started_at ?? now()
  }
  if (isComplete(item, to)) {
    patch.status = 'done'
    patch.finished_at = now()
  } else if (item.status === 'done' && !isComplete(item, to)) {
    patch.status = 'watching'
    patch.finished_at = null
  }

  const updated = await patchItem(item, patch)
  await logEvent(updated, 'progress', from, to, null)
  return updated
}

export async function setStatus(item: Item, status: ItemStatus): Promise<Item> {
  const patch: Partial<Item> = { status }
  if (status === 'watching' && !item.started_at) patch.started_at = now()
  if (status === 'done') patch.finished_at = now()
  const updated = await patchItem(item, patch)
  await logEvent(updated, 'status', null, null, status)
  return updated
}

export async function setRating(item: Item, rating: number | null): Promise<Item> {
  const updated = await patchItem(item, { rating })
  await logEvent(updated, 'rating', null, rating, null)
  return updated
}

export async function setMetadata(
  item: Item,
  patch: Partial<ItemMetadata>,
): Promise<Item> {
  return patchItem(item, { metadata: { ...item.metadata, ...patch } })
}

export async function softDelete(item: Item): Promise<void> {
  await patchItem(item, { deleted_at: now() })
}
