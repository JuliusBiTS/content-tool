import { useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRefreshState, refreshAll, subscribeRefresh } from '../lib/refresh'
import { refreshAiringCache, trackedSignature } from '../lib/airing'

export function useRefreshState() {
  return useSyncExternalStore(subscribeRefresh, getRefreshState, getRefreshState)
}

const POLL_MS = 30 * 60 * 1000

/**
 * Keeps sync + air dates current without the user doing anything:
 *  - on start, when the app comes back to the foreground, when the network returns
 *  - every 30 min while it is open
 *  - right away (debounced) when the set of followed shows changes,
 *    e.g. a new series is added or set to "watching"
 * Each trigger is throttled inside refreshAll / per-show freshness.
 */
export function useAutoRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    void refreshAll()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAll()
    }
    const onOnline = () => void refreshAll()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    const t = setInterval(() => void refreshAll(), POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      clearInterval(t)
    }
  }, [enabled])

  // follow-set changed → fetch the newcomers (fresh shows are skipped)
  const signature = useLiveQuery(() => trackedSignature())
  useEffect(() => {
    if (!enabled || signature === undefined) return
    const t = setTimeout(() => void refreshAiringCache(), 2500)
    return () => clearTimeout(t)
  }, [enabled, signature])
}
