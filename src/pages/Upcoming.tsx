import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { upcomingEntries, markAiringSeen } from '../lib/airing'
import { setPosition } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import type { AiringEntry } from '../lib/shows'

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff === -1) return 'Gestern'
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString('de-DE', { weekday: 'long' })
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function Upcoming() {
  const [entries, setEntries] = useState<AiringEntry[] | null>(null)

  useEffect(() => {
    let alive = true
    upcomingEntries().then((e) => alive && setEntries(e))
    void markAiringSeen()
    return () => {
      alive = false
    }
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, AiringEntry[]>()
    for (const e of entries ?? []) {
      const day = e.airDate.slice(0, 10)
      const list = map.get(day)
      if (list) list.push(e)
      else map.set(day, [e])
    }
    return [...map.entries()]
  }, [entries])

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <h1 className="mb-1 text-xl font-bold lg:text-2xl">Diese Woche</h1>
      <p className="mb-5 text-sm text-muted">
        Neue Folgen deiner laufenden Serien.
      </p>

      {entries === null && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      )}

      {entries?.length === 0 && (
        <div className="mt-16 text-center">
          <div className="text-4xl">📡</div>
          <p className="mt-3 font-medium">Nichts angekündigt.</p>
          <p className="mt-1 text-sm text-muted">
            Für deine laufenden Serien sind gerade keine Folgen im Zeitraum.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([day, rows]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{dayLabel(day)}</h2>
            <div className="space-y-2">
              {rows.map((e) => (
                <Row key={`${e.item.id}-${e.episode.season}-${e.episode.number}`} e={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Row({ e }: { e: AiringEntry }) {
  const [busy, setBusy] = useState(false)
  const aired = Date.parse(e.airDate) <= Date.now()
  const canLog = aired && !e.watched && e.item.current_position + 1 === e.absolute

  return (
    <div className="flex gap-3 rounded-card border border-border bg-surface p-2.5">
      <Link to={`/item/${e.item.id}`} viewTransition className="shrink-0">
        <div className="h-16 w-28 overflow-hidden rounded-md bg-surface-2">
          {e.episode.still ? (
            <img
              src={e.episode.still}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : e.item.poster_url ? (
            <img
              src={e.item.poster_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-80"
            />
          ) : null}
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <Link to={`/item/${e.item.id}`} viewTransition className="truncate text-sm font-medium">
          {e.item.title}
        </Link>
        <div className="truncate text-xs text-muted">
          S{e.episode.season} E{e.episode.number}
          {e.episode.name ? ` · ${e.episode.name}` : ''}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {e.watched ? 'gesehen' : aired ? 'ausgestrahlt' : 'geplant'}
        </div>
      </div>

      {canLog && (
        <button
          onClick={async () => {
            if (busy) return
            setBusy(true)
            bumpFx()
            try {
              await setPosition(e.item, e.absolute)
            } finally {
              setBusy(false)
            }
          }}
          className="my-auto shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          ▶ Gesehen
        </button>
      )}
    </div>
  )
}
