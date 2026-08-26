import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { runSync, subscribeSync, resetSyncCache, type SyncState } from '../lib/sync'
import { useAllItems } from '../hooks/useData'

export function Profile() {
  const { session, localOnly, signOut } = useAuth()
  const items = useAllItems()
  const [s, setS] = useState<SyncState | null>(null)
  useEffect(() => subscribeSync(setS), [])

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Profil</h1>

      <div className="rounded-card border border-border bg-surface p-4">
        <div className="text-sm text-muted">Angemeldet als</div>
        <div className="font-medium">
          {localOnly ? 'Lokaler Modus (kein Backend)' : session?.user.email}
        </div>
      </div>

      <div className="mt-4 rounded-card border border-border bg-surface p-4 text-sm">
        <Row label="Titel gesamt" value={items?.length ?? '…'} />
        <Row label="Offene Syncs" value={s?.pending ?? 0} />
        <Row
          label="Letzter Sync"
          value={
            s?.lastSyncedAt
              ? new Date(s.lastSyncedAt).toLocaleTimeString('de-DE')
              : '—'
          }
        />
      </div>

      <div className="mt-4 space-y-2">
        {!localOnly && (
          <button
            onClick={() => void runSync()}
            className="w-full rounded-lg border border-border py-2.5 text-sm"
          >
            Jetzt synchronisieren
          </button>
        )}
        <button
          onClick={async () => {
            if (confirm('Lokalen Cache leeren und neu laden? (Server-Daten bleiben)')) {
              await resetSyncCache()
              location.reload()
            }
          }}
          className="w-full rounded-lg border border-border py-2.5 text-sm text-muted"
        >
          Lokalen Cache zurücksetzen
        </button>
        {!localOnly && (
          <button
            onClick={() => void signOut()}
            className="w-full rounded-lg border border-danger/40 py-2.5 text-sm text-danger"
          >
            Abmelden
          </button>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-muted">MediaLog · v0.1</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
