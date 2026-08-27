import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Poster } from './Poster'
import { QuickPositionSheet } from './QuickPositionSheet'
import { bumpProgress, setPosition } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import { nextActionLabel, positionLabel, progressFraction } from '../lib/progress'
import { useNextEpisode, usePosterAccent } from '../hooks/useShow'
import { useToast } from './Toast'
import type { Item } from '../lib/types'

export function ContinueCard({ item }: { item: Item }) {
  const navigate = useNavigate()
  const toast = useToast()
  const next = useNextEpisode(item)
  const accent = usePosterAccent(item)
  const [busy, setBusy] = useState(false)
  const [popKey, setPopKey] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)

  const frac = progressFraction(item)

  const actionLabel = nextActionLabel(item)
  const subLabel =
    next?.name && !next.upcoming ? `${actionLabel} · ${next.name}` : positionLabel(item)

  async function onBump() {
    if (busy) return
    setBusy(true)
    bumpFx()
    posterRef.current?.classList.remove('animate-punch')
    void posterRef.current?.offsetWidth
    posterRef.current?.classList.add('animate-punch')
    const prev = item.current_position
    try {
      const updated = await bumpProgress(item)
      setPopKey((k) => k + 1)
      toast.show(`${item.title}: ${positionLabel(updated)}`, {
        label: 'Rückgängig',
        run: () => void setPosition(updated, prev),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className="flex gap-3 rounded-card border border-border bg-surface p-3"
        style={accent ? ({ ['--scene-accent' as string]: accent } as React.CSSProperties) : undefined}
        onClick={() => navigate(`/item/${item.id}`, { viewTransition: true })}
        role="button"
        tabIndex={0}
      >
        <div ref={posterRef}>
          <Poster url={item.poster_url} title={item.title} kind={item.kind} className="h-24 w-16" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate font-semibold leading-tight">{item.title}</div>
          <div
            key={popKey}
            className={'mt-0.5 truncate text-sm text-muted ' + (popKey ? 'inline-block animate-pop' : '')}
          >
            {subLabel}
          </div>

          {frac != null && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.round(frac * 100)}%`, background: 'var(--scene-accent)' }}
              />
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onBump()
              }}
              disabled={busy}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'var(--scene-accent)' }}
            >
              ▶ {actionLabel}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setQuickOpen(true)
              }}
              aria-label="Genaue Position setzen"
              className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted active:scale-[0.97]"
            >
              ⋯
            </button>
          </div>
        </div>
      </div>

      <QuickPositionSheet item={item} open={quickOpen} onClose={() => setQuickOpen(false)} />
    </>
  )
}
