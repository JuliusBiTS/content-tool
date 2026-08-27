import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stage } from './Stage'
import { TitleTreatment } from './TitleTreatment'
import { useToast } from './Toast'
import { bumpProgress, setPosition } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import { positionLabel, progressFraction, nextActionLabel } from '../lib/progress'
import { useNextEpisode, usePosterAccent } from '../hooks/useShow'
import type { Item } from '../lib/types'

export function HomeHero({ item }: { item: Item }) {
  const navigate = useNavigate()
  const toast = useToast()
  const next = useNextEpisode(item)
  const accent = usePosterAccent(item)
  const [busy, setBusy] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const frac = progressFraction(item)
  const label = nextActionLabel(item)
  const sub =
    next?.name && !next.upcoming
      ? `${label} · ${next.name}`
      : positionLabel(item)

  async function bump(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    bumpFx()
    const prev = item.current_position
    try {
      const updated = await bumpProgress(item)
      toast.show(`${item.title}: ${positionLabel(updated)}`, {
        label: 'Rückgängig',
        run: () => void setPosition(updated, prev),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stage
      backdrop={item.backdrop_url}
      accent={accent}
      minH="17rem"
      className="cursor-pointer overflow-hidden rounded-card px-4 pb-4 pt-10"
    >
      <div onClick={() => navigate(`/item/${item.id}`, { viewTransition: true })}>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
          Weiterschauen
        </span>
        <div className="mt-1">
          <TitleTreatment logo={item.metadata.logo_url} title={item.title} maxH="3.5rem" />
        </div>
        <p className="mt-1.5 line-clamp-1 text-sm text-white/80">{sub}</p>

        {frac != null && (
          <div ref={barRef} className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.round(frac * 100)}%`, background: 'var(--scene-accent)' }}
            />
          </div>
        )}
      </div>

      <button
        onClick={bump}
        disabled={busy}
        className="mt-3 w-full rounded-lg py-3 font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'var(--scene-accent)' }}
      >
        ▶ {label}
      </button>
    </Stage>
  )
}
