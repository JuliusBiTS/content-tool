import { useEffect, useState } from 'react'
import { subscribeSync, type SyncState } from '../lib/sync'
import { refreshAll } from '../lib/refresh'
import { useRefreshState } from '../hooks/useRefresh'
import { useAuth } from '../lib/auth'

/** Status + manual "update everything now" button. */
export function SyncPill() {
  const { localOnly } = useAuth()
  const [s, setS] = useState<SyncState | null>(null)
  const refresh = useRefreshState()
  useEffect(() => subscribeSync(setS), [])

  if (!s) return null

  const busy = s.syncing || refresh.refreshing

  let label = 'Aktuell'
  let color = 'text-muted'
  if (localOnly) {
    label = 'Nur lokal'
  } else if (!s.online) {
    label = 'Offline'
    color = 'text-danger'
  } else if (busy) {
    label = 'Aktualisiere…'
    color = 'text-accent'
  } else if (s.pending > 0) {
    label = `${s.pending} offen`
    color = 'text-accent'
  } else if (s.error) {
    label = 'Sync-Fehler'
    color = 'text-danger'
  }

  return (
    <button
      type="button"
      disabled={localOnly || busy || !s.online}
      onClick={() => void refreshAll({ force: true })}
      title="Jetzt synchronisieren & neue Folgen prüfen"
      className={`flex items-center gap-1.5 text-xs ${color} disabled:cursor-default`}
    >
      <span className={'inline-block ' + (busy ? 'animate-spin' : '')} aria-hidden>
        ↻
      </span>
      {label}
    </button>
  )
}
