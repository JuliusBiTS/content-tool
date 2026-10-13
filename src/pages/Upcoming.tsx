import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { markAiringSeen } from '../lib/airing'
import { refreshAll } from '../lib/refresh'
import { setPosition } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import { useUpcoming } from '../hooks/useAiring'
import { useRefreshState } from '../hooks/useRefresh'
import { hasTime, localDayKey } from '../lib/showLogic'
import type { AiringEntry } from '../lib/shows'

/** "S2 E5" for TMDB series, "Folge 1357" for anime, "Kapitel 1195" for manga. */
function unitLabel(e: AiringEntry): string {
  if (e.unit === 'chapter') return `Kapitel ${e.episode.number}`
  if (e.item.kind === 'anime' || e.item.metadata.absoluteNumbering)
    return `Folge ${e.episode.number}`
  return `S${e.episode.season} E${e.episode.number}`
}

function statusText(e: AiringEntry, aired: boolean): string {
  if (e.unit === 'chapter') return e.watched ? 'gelesen' : 'erschienen'
  return e.watched ? 'gesehen' : aired ? 'ausgestrahlt' : 'geplant'
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

function ago(ms: number | null): string {
  if (!ms) return 'noch nie'
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std`
  return `vor ${Math.round(h / 24)} Tagen`
}

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
  const entries = useUpcoming()
  const refresh = useRefreshState()

  // Whatever is on screen counts as seen — including episodes that arrive
  // while the page is open after a background refresh.
  useEffect(() => {
    if (entries) void markAiringSeen()
  }, [entries])

  const groups = useMemo(() => {
    const map = new Map<string, AiringEntry[]>()
    for (const e of entries ?? []) {
      const day = localDayKey(e.airDate)
      const list = map.get(day)
      if (list) list.push(e)
      else map.set(day, [e])
    }
    return [...map.entries()]
  }, [entries])

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Diese Woche</h1>
        <button
          onClick={() => void refreshAll({ force: true })}
          disabled={refresh.refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          <span className={refresh.refreshing ? 'inline-block animate-spin' : ''} aria-hidden>
            ↻
          </span>
          {refresh.refreshing ? 'Prüfe…' : 'Aktualisieren'}
        </button>
      </div>
      <p className="mb-5 text-sm text-muted">
        Neue Folgen &amp; Kapitel · zuletzt geprüft {ago(refresh.lastAt)}
        {refresh.error ? ' · Fehler beim Prüfen' : ''}
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
          {unitLabel(e)}
          {e.episode.name ? ` · ${e.episode.name}` : ''}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {statusText(e, aired)}
          {hasTime(e.airDate) && !aired ? ` · ${timeOf(e.airDate)}` : ''}
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
          {e.unit === 'chapter' ? '📖 Gelesen' : '▶ Gesehen'}
        </button>
      )}
    </div>
  )
}
