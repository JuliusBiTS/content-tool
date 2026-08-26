import { useMemo } from 'react'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** GitHub-style activity grid for the last ~26 weeks. */
export function Heatmap({ counts }: { counts: Map<string, number> }) {
  const { weeks, max } = useMemo(() => {
    const days = 182
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // start on a Monday
    const start = new Date(today)
    start.setDate(start.getDate() - days)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

    const cells: { date: string; count: number }[] = []
    let max = 0
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = ymd(d)
      const count = counts.get(key) ?? 0
      max = Math.max(max, count)
      cells.push({ date: key, count })
    }
    const weeks: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return { weeks, max }
  }, [counts])

  const level = (c: number) => {
    if (c === 0) return 'var(--color-surface-2)'
    const t = max <= 1 ? 1 : c / max
    if (t > 0.66) return 'var(--color-accent)'
    if (t > 0.33) return 'color-mix(in oklab, var(--color-accent) 65%, var(--color-bg))'
    return 'color-mix(in oklab, var(--color-accent) 35%, var(--color-bg))'
  }

  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-1">
            {week.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count}`}
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: level(cell.count) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
