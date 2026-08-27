import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { Stage } from '../components/Stage'
import { TitleTreatment } from '../components/TitleTreatment'
import { StarRating } from '../components/StarRating'
import { QuickPositionSheet } from '../components/QuickPositionSheet'
import { useToast } from '../components/Toast'
import { useItem, useItemEvents } from '../hooks/useData'
import { useShow, useNextEpisode, usePosterAccent } from '../hooks/useShow'
import { bumpProgress, setMetadata, setPosition, setRating, setStatus, softDelete } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import { nextActionLabel, positionLabel, progressFraction, realSeasons } from '../lib/progress'
import type { ItemStatus } from '../lib/types'

const STATUS_LABELS: Record<ItemStatus, string> = {
  watching: 'Schaue',
  planned: 'Geplant',
  paused: 'Pausiert',
  done: 'Fertig',
  dropped: 'Abgebrochen',
}
const KIND_LABEL = { series: 'Serie', movie: 'Film', anime: 'Anime', book: 'Buch' }

function relDays(iso: string | null): string | null {
  if (!iso) return null
  const d = Math.round((Date.parse(iso) - Date.now()) / 864e5)
  if (d === 0) return 'heute'
  if (d === 1) return 'morgen'
  if (d > 1) return `in ${d} Tagen`
  if (d === -1) return 'gestern'
  return null
}

export function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const item = useItem(id)
  const events = useItemEvents(id)
  const show = useShow(item)
  const next = useNextEpisode(item)
  const accent = usePosterAccent(item)
  const [quickOpen, setQuickOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)

  const seasons = useMemo(() => (item ? realSeasons(item) : []), [item])

  if (item === undefined) return <div className="p-8 text-center text-muted">Lädt…</div>
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
    bumpFx()
    posterRef.current?.classList.remove('animate-punch')
    void posterRef.current?.offsetWidth
    posterRef.current?.classList.add('animate-punch')
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

  const nextLabel =
    next?.name && !next.upcoming
      ? `${nextActionLabel(item)} · ${next.name}`
      : nextActionLabel(item)

  return (
    <div
      className="mx-auto max-w-5xl pb-28 lg:pb-10"
      style={accent ? ({ ['--scene-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <Stage backdrop={item.backdrop_url} accent={accent} minH="20rem" className="px-4 pb-5 pt-16 lg:px-8 lg:pt-20">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-3 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-lg backdrop-blur"
        >
          ‹
        </button>

        <div className="flex items-end gap-4">
          <div ref={posterRef}>
            <Poster
              url={item.poster_url}
              title={item.title}
              kind={item.kind}
              className="h-40 w-28 shrink-0 shadow-2xl sm:h-48 sm:w-32"
            />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <TitleTreatment logo={item.metadata.logo_url} title={item.title} maxH="4.5rem" />
            {item.metadata.tagline && (
              <p className="mt-1.5 line-clamp-2 text-sm italic text-muted">
                {item.metadata.tagline}
              </p>
            )}
            <p className="mt-1.5 text-sm text-muted">
              {item.metadata.year ?? '—'} · {KIND_LABEL[item.kind]}
              {show?.status === 'Ended' ? ' · abgeschlossen' : ''}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm font-medium">{positionLabel(item)}</p>
        {frac != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.round(frac * 100)}%`, background: 'var(--scene-accent)' }}
            />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void bump()}
            disabled={busy}
            className="flex-1 truncate rounded-lg py-3 font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'var(--scene-accent)' }}
          >
            ▶ {nextLabel}
          </button>
          <button
            onClick={() => setQuickOpen(true)}
            className="rounded-lg border border-white/20 bg-black/30 px-4 py-3 font-medium backdrop-blur"
          >
            Position
          </button>
        </div>
      </Stage>

      <div className="px-4 lg:grid lg:grid-cols-[1fr_18rem] lg:gap-10 lg:px-8">
        {/* main */}
        <div className="mt-6 min-w-0">
          {next && (next.still || next.airDate) && (
            <div className="mb-6 flex gap-3 rounded-card border border-border bg-surface p-3">
              {next.still && (
                <img
                  src={next.still}
                  alt=""
                  className="h-20 w-32 shrink-0 rounded-md object-cover"
                />
              )}
              <div className="flex min-w-0 flex-col justify-center">
                <span className="text-xs uppercase tracking-wide text-muted">
                  {next.upcoming ? 'Als Nächstes' : 'Weiter'}
                </span>
                <span className="truncate font-medium">
                  S{next.season} E{next.number}
                  {next.name ? ` – ${next.name}` : ''}
                </span>
                <span className="text-xs text-muted">
                  {next.runtime ? `${next.runtime} Min` : ''}
                  {next.upcoming && relDays(next.airDate)
                    ? `${next.runtime ? ' · ' : ''}${relDays(next.airDate)}`
                    : ''}
                </span>
              </div>
            </div>
          )}

          {item.metadata.overview && (
            <p className="text-sm leading-relaxed text-muted">{item.metadata.overview}</p>
          )}

          {isEpisodic && seasons.length > 0 && !item.metadata.absoluteNumbering && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-muted">Staffeln</h2>
              <div className="space-y-4">
                {seasonBlocks.map(({ season, start }) => (
                  <SeasonBlock
                    key={season.number}
                    seasonNum={season.number}
                    seasonName={season.name}
                    count={season.episodeCount}
                    start={start}
                    position={item.current_position}
                    episodes={show?.episodes ?? []}
                    onSet={(abs) => void setPosition(item, abs)}
                  />
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
        </div>

        {/* aside */}
        <div className="mt-6 space-y-4 lg:mt-6">
          <div className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-wrap">
            {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => void setStatus(item, s)}
                className={
                  'shrink-0 rounded-full border px-3 py-1.5 text-sm ' +
                  (item.status === s
                    ? 'border-[var(--scene-accent)] bg-accent-soft text-text'
                    : 'border-border text-muted')
                }
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-card border border-border bg-surface p-4">
            <span className="text-sm text-muted">Bewertung</span>
            <StarRating value={item.rating} onChange={(v) => void setRating(item, v)} />
          </div>

          {canToggleNumbering && (
            <label className="flex items-center justify-between rounded-card border border-border bg-surface p-4 text-sm">
              <span>
                Absolute Nummerierung
                <span className="block text-xs text-muted">„Folge 137" statt „S6 E12"</span>
              </span>
              <input
                type="checkbox"
                checked={!!item.metadata.absoluteNumbering}
                onChange={(e) => void setMetadata(item, { absoluteNumbering: e.target.checked })}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
            </label>
          )}

          <button
            onClick={async () => {
              if (confirm('Wirklich entfernen?')) {
                await softDelete(item)
                navigate('/library')
              }
            }}
            className="w-full rounded-lg border border-danger/40 py-2.5 text-sm text-danger"
          >
            Entfernen
          </button>
        </div>
      </div>

      <QuickPositionSheet item={item} open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}

function SeasonBlock({
  seasonNum,
  seasonName,
  count,
  start,
  position,
  episodes,
  onSet,
}: {
  seasonNum: number
  seasonName: string
  count: number
  start: number
  position: number
  episodes: { season: number; number: number; name: string; runtime: number | null; still: string | null }[]
  onSet: (abs: number) => void
}) {
  const rich = episodes.filter((e) => e.season === seasonNum)
  const useRich = rich.length >= count - 1 && rich.length > 0

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">{seasonName}</span>
        <button className="text-xs text-[var(--scene-accent)]" onClick={() => onSet(start + count)}>
          Staffel fertig
        </button>
      </div>

      {useRich ? (
        <div className="space-y-1.5">
          {Array.from({ length: count }, (_, i) => i + 1).map((ep) => {
            const abs = start + ep
            const watched = position >= abs
            const meta = rich.find((e) => e.number === ep)
            return (
              <button
                key={ep}
                onClick={() => onSet(watched ? abs - 1 : abs)}
                className={
                  'flex w-full items-center gap-3 rounded-lg border p-1.5 text-left ' +
                  (watched ? 'border-[var(--scene-accent)] bg-accent-soft' : 'border-border')
                }
              >
                <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded bg-surface-2">
                  {meta?.still && (
                    <img
                      src={meta.still}
                      alt=""
                      loading="lazy"
                      className={'h-full w-full object-cover ' + (watched ? '' : 'opacity-70')}
                    />
                  )}
                  <span className="absolute bottom-0.5 left-1 text-[10px] font-bold tabular-nums drop-shadow">
                    {ep}
                  </span>
                </div>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {meta?.name ?? `Folge ${ep}`}
                </span>
                {watched && <span className="pr-1 text-xs text-[var(--scene-accent)]">✓</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: count }, (_, i) => i + 1).map((ep) => {
            const abs = start + ep
            const watched = position >= abs
            return (
              <button
                key={ep}
                onClick={() => onSet(watched ? abs - 1 : abs)}
                className={
                  'h-8 w-8 rounded-md text-xs tabular-nums ' +
                  (watched ? 'bg-[var(--scene-accent)] text-white' : 'border border-border text-muted')
                }
              >
                {ep}
              </button>
            )
          })}
        </div>
      )}
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
      return to ? `Bewertet: ${(to / 2).toFixed(1)}★` : 'Bewertung entfernt'
    case 'progress':
      return `Fortschritt ${from ?? 0} → ${to ?? 0}`
    default:
      return kind
  }
}
