import { getMeta, setMeta } from './db'
import { refreshAiringCache } from './airing'
import { runSync } from './sync'

/**
 * One entry point for "make everything current": push/pull the user's data,
 * then refresh TMDB air dates for the shows they follow. Automatic triggers
 * are throttled; the manual button passes `force`.
 */

export interface RefreshState {
  refreshing: boolean
  /** epoch ms of the last completed refresh, or null */
  lastAt: number | null
  error: string | null
}

const MIN_GAP_MS = 10 * 60 * 1000
const META_KEY = 'refresh:lastAt'

let state: RefreshState = { refreshing: false, lastAt: null, error: null }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let loaded = false

function set(next: Partial<RefreshState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function getRefreshState(): RefreshState {
  return state
}

export function subscribeRefresh(l: () => void): () => void {
  listeners.add(l)
  if (!loaded) {
    loaded = true
    void getMeta(META_KEY).then((v) => {
      if (v && state.lastAt == null) set({ lastAt: Number(v) })
    })
  }
  return () => listeners.delete(l)
}

export interface RefreshOpts {
  /** user pressed the button: skip the throttle, re-check airing shows now */
  force?: boolean
}

export function refreshAll(opts: RefreshOpts = {}): Promise<void> {
  if (inflight) return inflight
  if (!opts.force && state.lastAt && Date.now() - state.lastAt < MIN_GAP_MS) {
    return Promise.resolve()
  }

  set({ refreshing: true, error: null })
  inflight = (async () => {
    try {
      await runSync()
      await refreshAiringCache({ force: opts.force })
      const at = Date.now()
      set({ lastAt: at })
      await setMeta(META_KEY, String(at))
    } catch (e) {
      console.warn('[refresh] failed', e)
      set({ error: e instanceof Error ? e.message : 'Aktualisierung fehlgeschlagen' })
    } finally {
      set({ refreshing: false })
      inflight = null
    }
  })()
  return inflight
}
