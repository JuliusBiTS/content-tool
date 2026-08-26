import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { StarRating } from '../components/StarRating'
import { QuickPositionSheet } from '../components/QuickPositionSheet'
import { useToast } from '../components/Toast'
import { useItem, useItemEvents } from '../hooks/useData'
import {
  bumpProgress,
  setMetadata,
  setPosition,
  setRating,
  setStatus,
  softDelete,
} from '../lib/repo'
import {
  nextActionLabel,
  positionLabel,
  progressFraction,
  realSeasons,
} from '../lib/progress'
import type { ItemStatus } from '../lib/types'

const STATUS_LABELS: Record<ItemStatus, string> = {
  watching: 'Schaue',
  planned: 'Geplant',
  paused: 'Pausiert',
  done: 'Fertig',
  dropped: 'Abgebrochen',
}

const KIND_LABEL = { series: 'Serie', movie: 'Film', anime: 'Anime', book: 'Buch' }

export function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const item = useItem(id)
  const events = useItemEvents(id)
  const [quickOpen, setQuickOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const seasons = useMemo(() => (item ? realSeasons(item) : []), [item])

  if (item === undefined) {
    return <div className="p-8 text-center text-muted">Lädt…</div>
  }
  if (!item) {
    return (
      <div className="p-8 text-center text-muted">
        Nicht gefunden.{' '}
        <button className="text-accent" onClick={() => navigate('/')}>
          Zur Startseite
        </button>
      </div>
    )
  }

  const frac = progressFraction(item)
  const isEpisodic = item.kind === 'series' || item.kind === 'anime'
  const canToggleNumbering = isEpisodic && seasons.length > 0
  const showSeasonList = isEpisodic && seasons.length > 0 && !item.metadata.absoluteNumbering

  const seasonBlocks = seasons.reduce<{ season: (typeof seasons)[number]; start: number }[]>(
    (acc, s) => {
      const start = acc.length
        ? acc[acc.length - 1].start + acc[acc.length - 1].season.episodeCount
        : 0
      acc.push({ season: s, start })
      return acc
    },
    [],
  )

  async function bump() {
    if (busy) return
    setBusy(true)
    const prev = item!.current_position
    try {
      const updated = await bumpProgress(item!)
      toast.show(positionLabel(updated), {
        label: 'Rückgängig',
        run: () => void setPosition(updated, prev),
      })
    } finally {
      setBusy(false)
    }
  }

  const LeftColumn = (
    <div className="lg:sticky lg:top-8 lg:self-start">
      <div className="-mt-10 flex gap-4 lg:mt-0 lg:block">
        <Poster
          url={item.poster_url}
          title={item.title}
          kind={item.kind}
          className="h-44 w-28 shrink-0 shadow-lg lg:aspect-[2/3] lg:h-auto lg:w-full lg:max-w-[16rem]"
        />
        <div className="min-w-0 pt-12 lg:pt-4">
          <h1 className="text-lg font-bold leading-tight lg:text-xl">{item.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {item.metadata.year ?? '—'} · {KIND_LABEL[item.kind]}
          </p>
          <p className="mt-1 text-sm">{positionLabel(item)}</p>
        </div>
      </div>

      {frac != null && (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round(frac * 100)}%` }}
          />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void bump()}
          disabled={busy}
          className="flex-1 rounded-lg bg-accent py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          ▶ {nextActionLabel(item)}
        </button>
        <button
          onClick={() => setQuickOpen(true)}
          className="rounded-lg border border-border px-4 py-3 font-medium text-muted"
        >
          Position
        </button>
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto lg:flex-wrap">
        {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => void setStatus(item, s)}
            className={
              'shrink-0 rounded-full border px-3 py-1.5 text-sm ' +
              (item.status === s
                ? 'border-accent bg-accent-soft text-text'
                : 'border-border text-muted')
            }
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-card border border-border bg-surface p-4">
        <span className="text-sm text-muted">Bewertung</span>
        <StarRating value={item.rating} onChange={(v) => void setRating(item, v)} />
      </div>
    </div>
  )

  const RightColumn = (
    <div className="mt-6 lg:mt-4">
      {item.metadata.overview && (
        <p className="text-sm leading-relaxed text-muted">{item.metadata.overview}</p>
      )}

      {canToggleNumbering && (
        <label className="mt-4 flex items-center justify-between rounded-card border border-border bg-surface p-4 text-sm">
          <span>
            Absolute Folgennummerierung
            <span className="block text-xs text-muted">
              „Folge 137" statt „S6 E12"
            </span>
          </span>
          <input
            type="checkbox"
            checked={!!item.metadata.absoluteNumbering}
            onChange={(e) =>
              void setMetadata(item, { absoluteNumbering: e.target.checked })
            }
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
        </label>
      )}

      {showSeasonList && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Staffeln</h2>
          <div className="space-y-3">
            {seasonBlocks.map(({ season, start }) => (
              <div key={season.number}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">{season.name}</span>
                  <button
                    className="text-xs text-accent"
                    onClick={() => void setPosition(item, start + season.episodeCount)}
                  >
                    Staffel fertig
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: season.episodeCount }, (_, i) => i + 1).map((ep) => {
                    const abs = start + ep
                    const watched = item.current_position >= abs
                    return (
                      <button
                        key={ep}
                        onClick={() => void setPosition(item, watched ? abs - 1 : abs)}
                        className={
                          'h-8 w-8 rounded-md text-xs tabular-nums ' +
                          (watched
                            ? 'bg-accent text-white'
                            : 'border border-border text-muted')
                        }
                      >
                        {ep}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">Verlauf</h2>
        <ul className="space-y-1.5 text-sm">
          {(events ?? []).slice(0, 40).map((e) => (
            <li key={e.id} className="flex justify-between text-muted">
              <span>{describeEvent(e.kind, e.from_position, e.to_position)}</span>
              <span className="tabular-nums">
                {new Date(e.occurred_at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
            </li>
          ))}
          {events && events.length === 0 && <li className="text-muted">Noch nichts.</li>}
        </ul>
      </section>

      <button
        onClick={async () => {
          if (confirm('Wirklich entfernen?')) {
            await softDelete(item)
            navigate('/library')
          }
        }}
        className="mt-8 w-full rounded-lg border border-danger/40 py-2.5 text-sm text-danger lg:w-auto lg:px-6"
      >
        Entfernen
      </button>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl pb-28 lg:pb-10">
      <div className="relative">
        {item.backdrop_url ? (
          <img
            src={item.backdrop_url}
            alt=""
            className="h-40 w-full object-cover opacity-40 lg:h-60 lg:rounded-b-2xl"
          />
        ) : (
          <div className="h-16 lg:h-8" />
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-lg backdrop-blur"
        >
          ‹
        </button>
      </div>

      <div className="px-4 lg:grid lg:grid-cols-[20rem_1fr] lg:gap-10 lg:px-8">
        {LeftColumn}
        {RightColumn}
      </div>

      <QuickPositionSheet item={item} open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}

function describeEvent(kind: string, from: number | null, to: number | null): string {
  switch (kind) {
    case 'add':
      return 'Hinzugefügt'
    case 'status':
      return 'Status geändert'
    case 'rating':
      return to ? `Bewertet: ${to}★` : 'Bewertung entfernt'
    case 'progress':
      return `Fortschritt ${from ?? 0} → ${to ?? 0}`
    default:
      return kind
  }
}
