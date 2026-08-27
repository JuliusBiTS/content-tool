import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllItems, useRecentEvents } from '../hooks/useData'
import { computeInsights, formatHours } from '../lib/stats'

export function Review() {
  const navigate = useNavigate()
  const items = useAllItems()
  const events = useRecentEvents(8000)
  const year = new Date().getFullYear()

  const data = useMemo(() => {
    const its = items ?? []
    const evs = (events ?? []).filter(
      (e) => new Date(e.occurred_at).getFullYear() === year,
    )
    const ins = computeInsights(its, evs)

    const finishedThisYear = its.filter(
      (i) => i.status === 'done' && i.finished_at?.startsWith(String(year)),
    )
    const topRated = [...finishedThisYear]
      .filter((i) => i.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]

    // longest single-day burst
    let peak = 0
    for (const n of ins.counts.values()) peak = Math.max(peak, n)

    const busiestMonth = [...ins.monthly].sort((a, b) => b.minutes - a.minutes)[0]

    return {
      minutes: ins.minutesTotal,
      finished: finishedThisYear.length,
      topGenre: ins.genres[0]?.name ?? null,
      topCreator: ins.creators[0]?.name ?? null,
      topRated,
      peak,
      busiestMonth: busiestMonth?.minutes ? busiestMonth.label : null,
      streak: ins.streak,
    }
  }, [items, events, year])

  const slides: { big: string; label: string }[] = [
    { big: formatHours(data.minutes), label: `hast du ${year} mit Schauen & Lesen verbracht` },
    { big: `${data.finished}`, label: `Titel abgeschlossen` },
    ...(data.topGenre ? [{ big: data.topGenre, label: 'dein meistgesehenes Genre' }] : []),
    ...(data.topRated
      ? [{ big: data.topRated.title, label: `dein Favorit – ${(data.topRated.rating! / 2).toFixed(1)}★` }]
      : []),
    ...(data.peak > 0 ? [{ big: `${data.peak}`, label: 'an einem einzigen Tag – dein Rekord' }] : []),
    ...(data.topCreator ? [{ big: data.topCreator, label: 'am häufigsten in deiner Liste' }] : []),
  ]

  async function share() {
    const text = `Mein ${year} auf MediaLog: ${formatHours(data.minutes)}, ${data.finished} Titel abgeschlossen${
      data.topGenre ? `, meistes Genre: ${data.topGenre}` : ''
    }.`
    try {
      if (navigator.share) await navigator.share({ text, title: `MediaLog ${year}` })
      else {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="min-h-dvh">
      <button
        onClick={() => navigate(-1)}
        className="fixed left-4 top-5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-lg backdrop-blur"
      >
        ‹
      </button>

      <div className="mx-auto max-w-md px-6 pb-24 pt-20">
        <p className="font-display text-sm uppercase tracking-widest text-accent">
          Rückblick {year}
        </p>

        <div className="mt-6 space-y-10">
          {slides.map((s, i) => (
            <div key={i}>
              <div className="font-display text-4xl font-bold leading-tight sm:text-5xl">
                {s.big}
              </div>
              <p className="mt-1 text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => void share()}
          className="mt-12 w-full rounded-lg bg-accent py-3 font-semibold text-white"
        >
          Teilen
        </button>
      </div>
    </div>
  )
}
