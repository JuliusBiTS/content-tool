import { useEffect, useState } from 'react'
import { subscribeSync, type SyncState } from '../lib/sync'
import { useAuth } from '../lib/auth'

export function SyncPill() {
  const { localOnly } = useAuth()
  const [s, setS] = useState<SyncState | null>(null)
  useEffect(() => subscribeSync(setS), [])

  if (!s) return null

  let label = 'Synchron'
  let color = 'text-muted'
  if (localOnly) {
    label = 'Nur lokal'
  } else if (!s.online) {
    label = 'Offline'
    color = 'text-danger'
  } else if (s.syncing) {
    label = 'Sync…'
    color = 'text-accent'
  } else if (s.pending > 0) {
    label = `${s.pending} offen`
    color = 'text-accent'
  }

  return (
    <span className={`flex items-center gap-1.5 text-xs ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
