import { useMemo } from 'react'
import { Heatmap } from '../components/Heatmap'
import { useAllItems, useRecentEvents } from '../hooks/useData'

export function Stats() {
  const events = useRecentEvents(1000)
  const items = useAllItems()

  const stats = useMemo(() => {
    const evs = events ?? []
    const progress = evs.filter((e) => e.kind === 'progress')

    const counts = new Map<string, number>()
    for (const e of progress) {
      const day = e.occurred_at.slice(0, 10)
      const delta = Math.max(1, (e.to_position ?? 0) - (e.from_position ?? 0))
      counts.set(day, (counts.get(day) ?? 0) + Math.min(delta, 20))
    }

    const now = Date.now()
    const since = (days: number) =>
      progress
        .filter((e) => now - Date.parse(e.occurred_at) < days * 864e5)
        .reduce((n, e) => n + Math.max(1, (e.to_position ?? 0) - (e.from_position ?? 0)), 0)

    // current streak (consecutive days with activity, ending today or yesterday)
    let streak = 0
    for (let i = 0; i < 400; i++) {
      const d = new Date(now - i * 864e5).toISOString().slice(0, 10)
      if (counts.has(d)) streak++
      else if (i > 0) break
    }

    const its = items ?? []
    return {
      counts,
      week: since(7),
      month: since(30),
      streak,
      active: its.filter((i) => i.status === 'watching').length,
      done: its.filter((i) => i.status === 'done').length,
      total: its.length,
      byKind: (['series', 'anime', 'movie', 'book'] as const).map((k) => ({
        k,
        n: its.filter((i) => i.kind === k).length,
      })),
    }
  }, [events, items])

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Statistik</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Diese Woche" value={stats.week} unit="Einheiten" />
        <Stat label="Letzte 30 Tage" value={stats.month} unit="Einheiten" />
        <Stat label="Streak" value={stats.streak} unit="Tage" />
        <Stat label="Aktiv" value={stats.active} unit="Titel" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Aktivität</h2>
          <Heatmap counts={stats.counts} />
        </section>

        <section className="min-w-0 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Sammlung</h2>
          <div className="space-y-2">
            {stats.byKind.map(({ k, n }) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{KIND_LABEL[k]}</span>
                <span className="tabular-nums text-muted">{n}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
              <span>Abgeschlossen</span>
              <span className="tabular-nums">{stats.done}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const KIND_LABEL = { series: 'Serien', anime: 'Anime', movie: 'Filme', book: 'Bücher' }

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">
        {label} · {unit}
      </div>
    </div>
  )
}
