import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Poster } from './Poster'
import { QuickPositionSheet } from './QuickPositionSheet'
import { bumpProgress } from '../lib/repo'
import { nextActionLabel, positionLabel, progressFraction } from '../lib/progress'
import type { Item } from '../lib/types'

function haptic() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* not supported */
  }
}

export function ContinueCard({ item }: { item: Item }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [popKey, setPopKey] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)

  const frac = progressFraction(item)

  async function onBump() {
    if (busy) return
    setBusy(true)
    haptic()
    try {
      await bumpProgress(item)
      setPopKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className="flex gap-3 rounded-card border border-border bg-surface p-3"
        onClick={() => navigate(`/item/${item.id}`)}
        role="button"
        tabIndex={0}
      >
        <Poster
          url={item.poster_url}
          title={item.title}
          kind={item.kind}
          className="h-24 w-16"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate font-semibold leading-tight">{item.title}</div>
          <div
            key={popKey}
            className={
              'mt-0.5 text-sm text-muted ' + (popKey ? 'inline-block animate-pop' : '')
            }
          >
            {positionLabel(item)}
          </div>

          {frac != null && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${Math.round(frac * 100)}%` }}
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
              className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.97] disabled:opacity-50"
            >
              ▶ {nextActionLabel(item)}
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

      <QuickPositionSheet
        item={item}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
      />
    </>
  )
}
