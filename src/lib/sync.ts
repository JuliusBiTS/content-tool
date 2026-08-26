import { db, getMeta, setMeta } from './db'
import { hasSupabaseConfig, supabase } from './supabase'
import type { Item, ProgressEvent } from './types'

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let pendingAgain = false

type Listener = (state: SyncState) => void
export interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  lastSyncedAt: string | null
  error: string | null
}

const listeners = new Set<Listener>()
let state: SyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
  error: null,
}

function emit() {
  for (const l of listeners) l(state)
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l)
  l(state)
  return () => listeners.delete(l)
}

async function refreshPending() {
  state = { ...state, pending: await db.outbox.count() }
  emit()
}

export function queueSync(delay = 800): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void runSync(), delay)
}

async function isAuthed(): Promise<boolean> {
  if (!hasSupabaseConfig) return false
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

export async function runSync(): Promise<void> {
  if (running) {
    pendingAgain = true
    return
  }
  if (!(await isAuthed())) {
    await refreshPending()
    return
  }
  running = true
  state = { ...state, syncing: true }
  emit()
  try {
    await pushOutbox()
    await pullDeltas()
    const at = new Date().toISOString()
    state = { ...state, lastSyncedAt: at, error: null }
    await setMeta('sync:lastAt', at)
  } catch (e) {
    console.warn('[sync] failed', e)
    const msg = e instanceof Error ? e.message : 'Sync fehlgeschlagen'
    state = { ...state, error: msg }
  } finally {
    running = false
    state = { ...state, syncing: false }
    await refreshPending()
    if (pendingAgain) {
      pendingAgain = false
      queueSync(200)
    }
  }
}

async function pushOutbox(): Promise<void> {
  const ops = await db.outbox.orderBy('created_at').toArray()
  for (const op of ops) {
    let error
    if (op.op === 'insert') {
      ;({ error } = await supabase.from(op.table).upsert(op.payload, { onConflict: 'id' }))
    } else {
      ;({ error } = await supabase.from(op.table).update(op.payload).eq('id', op.row_id))
    }
    if (error) {
      // Stop on first error; retry next cycle. Keeps ordering intact.
      throw error
    }
    await db.outbox.delete(op.id)
  }
}

async function pullDeltas(): Promise<void> {
  await pullTable<Item>('items', 'updated_at', (rows) => db.items.bulkPut(rows))
  await pullTable<ProgressEvent>('events', 'created_at', (rows) => db.events.bulkPut(rows))
}

async function pullTable<T>(
  table: 'items' | 'events',
  cursorCol: 'updated_at' | 'created_at',
  apply: (rows: T[]) => Promise<unknown>,
): Promise<void> {
  const key = `sync:${table}:cursor`
  let cursor = (await getMeta(key)) ?? '1970-01-01T00:00:00Z'
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt(cursorCol, cursor)
      .order(cursorCol, { ascending: true })
      .limit(500)
    if (error) throw error
    const rows = (data ?? []) as T[]
    if (!rows.length) break

    // Don't clobber rows that still have unsynced local edits.
    const pendingIds = new Set(
      (await db.outbox.toArray()).filter((o) => o.table === table).map((o) => o.row_id),
    )
    const safeRows = rows.filter((r) => !pendingIds.has((r as { id: string }).id))
    if (safeRows.length) await apply(safeRows)

    cursor = (rows[rows.length - 1] as Record<string, string>)[cursorCol]
    await setMeta(key, cursor)
    if (rows.length < 500) break
  }
}

/** Wipe the local cursors + cache so the next sync does a full pull. */
export async function resetSyncCache(): Promise<void> {
  await db.items.clear()
  await db.events.clear()
  await db.outbox.clear()
  await db.meta.where('key').startsWith('sync:').delete()
  await refreshPending()
}

/**
 * Subscribe to Postgres changes for this user so edits from another device
 * trigger a delta pull. Returns an unsubscribe function.
 */
export function startRealtime(): () => void {
  if (!hasSupabaseConfig) return () => {}
  const channel = supabase
    .channel('medialog-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () =>
      queueSync(400),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () =>
      queueSync(400),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Bind the local cache to an account. If the cache currently belongs to a
 * different account (or to local-only mode), drop it so we never push another
 * account's rows or leave orphans that fail RLS forever.
 */
export async function switchAccount(ownerId: string): Promise<void> {
  const key = 'account:owner'
  const current = await getMeta(key)
  if (current === ownerId) return
  await resetSyncCache()
  await setMeta(key, ownerId)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    state = { ...state, online: true }
    emit()
    queueSync(100)
  })
  window.addEventListener('offline', () => {
    state = { ...state, online: false }
    emit()
  })
  void refreshPending()
}
