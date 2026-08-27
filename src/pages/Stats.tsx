import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap'
import { useAllItems, useRecentEvents } from '../hooks/useData'
import { computeInsights, formatHours } from '../lib/stats'
import { KIND_LABEL_PLURAL } from '../lib/kinds'

export function Stats() {
  const events = useRecentEvents(6000)
  const items = useAllItems()

  const s = useMemo(
    () => computeInsights(items ?? [], events ?? []),
    [items, events],
  )

  const maxMonth = Math.max(1, ...s.monthly.map((m) => m.minutes))

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Statistik</h1>
        <Link to="/review" className="text-sm text-accent">
          Rückblick →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Diese Woche" value={formatHours(s.minutesWindow(7))} />
        <Stat label="Letzte 30 Tage" value={formatHours(s.minutesWindow(30))} />
        <Stat label="Streak" value={`${s.streak}`} sub="Tage" />
        <Stat label="Insgesamt" value={formatHours(s.minutesTotal)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Aktivität</h2>
          <Heatmap counts={s.counts} />
          {s.bestWeekday && (
            <p className="mt-3 text-xs text-muted">
              Am aktivsten: <b className="text-text">{s.bestWeekday.day}</b>
            </p>
          )}
        </section>

        <section className="min-w-0 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Sammlung</h2>
          <div className="space-y-2 text-sm">
            {s.byKind
              .filter((k) => k.n > 0)
              .map(({ kind, n }) => (
                <Row key={kind} label={KIND_LABEL_PLURAL[kind]} value={n} />
              ))}
            <div className="border-t border-border pt-2">
              <Row label="Abgeschlossen" value={s.completed} bold />
              <Row label="Aktiv" value={s.active} bold />
              {s.dropRate > 0 && (
                <Row label="Abbruchquote" value={`${Math.round(s.dropRate * 100)}%`} bold />
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Monthly pace */}
      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted">Letzte 6 Monate</h2>
        <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
          {s.monthly.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${Math.max(3, (m.minutes / maxMonth) * 80)}px` }}
                title={formatHours(m.minutes)}
              />
              <span className="text-[10px] text-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Taste */}
      {(s.genres.length > 0 || s.creators.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {s.genres.length > 0 && (
            <section className="rounded-card border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted">Lieblings-Genres</h2>
              <div className="flex flex-wrap gap-2">
                {s.genres.map((g) => (
                  <span
                    key={g.name}
                    className="rounded-full border border-border px-3 py-1 text-sm"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            </section>
          )}
          {s.creators.length > 0 && (
            <section className="rounded-card border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted">Meistgesehen von</h2>
              <div className="space-y-1 text-sm">
                {s.creators.map((c) => (
                  <div key={c.name} className="text-muted">
                    {c.name}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {s.calibration && (
        <section className="mt-6 rounded-card border border-border bg-surface p-4 text-sm">
          <h2 className="mb-1 text-sm font-semibold text-muted">Bewertungs-Kalibrierung</h2>
          <p className="text-muted">
            Du bewertest im Schnitt{' '}
            <b className="text-text">
              {s.calibration.delta >= 0 ? '+' : ''}
              {(s.calibration.delta / 2).toFixed(1)}★
            </b>{' '}
            {s.calibration.delta >= 0 ? 'höher' : 'niedriger'} als die Community
            <span className="text-xs"> ({s.calibration.sample} Titel)</span>.
          </p>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">
        {label}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: number | string
  bold?: boolean
}) {
  return (
    <div className={'flex items-center justify-between py-0.5 ' + (bold ? 'font-medium' : '')}>
      <span className={bold ? '' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
