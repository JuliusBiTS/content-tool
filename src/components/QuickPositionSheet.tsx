import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { setPosition, setStatus } from '../lib/repo'
import {
  absoluteToSeasonEpisode,
  positionLabel,
  realSeasons,
  totalEpisodes,
} from '../lib/progress'
import type { Item, ItemStatus } from '../lib/types'

const STATUS_LABELS: Record<ItemStatus, string> = {
  watching: 'Schaue',
  planned: 'Geplant',
  paused: 'Pausiert',
  done: 'Fertig',
  dropped: 'Abgebrochen',
}

function seasonEpisodeToAbsolute(item: Item, season: number, episode: number): number {
  const seasons = realSeasons(item)
  let abs = 0
  for (const s of seasons) {
    if (s.number < season) abs += s.episodeCount
    else if (s.number === season) return abs + episode
  }
  return abs + episode
}

export function QuickPositionSheet({
  item,
  open,
  onClose,
}: {
  item: Item
  open: boolean
  onClose: () => void
}) {
  const isEpisodic = item.kind === 'series' || item.kind === 'anime'
  const seasons = realSeasons(item)
  const useSeasons = isEpisodic && seasons.length > 0 && !item.metadata.absoluteNumbering

  const [pos, setPos] = useState(item.current_position)
  const [season, setSeasonState] = useState(1)
  const [episode, setEpisode] = useState(1)

  useEffect(() => {
    if (!open) return
    setPos(item.current_position)
    const se = absoluteToSeasonEpisode(item, Math.max(1, item.current_position))
    if (se) {
      setSeasonState(se.season)
      setEpisode(se.episode)
    }
  }, [open, item])

  const total =
    isEpisodic ? totalEpisodes(item) : item.total_units
  const unit = item.kind === 'book' ? 'Seite' : item.kind === 'movie' ? 'Minute' : 'Folge'

  async function save() {
    const target = useSeasons ? seasonEpisodeToAbsolute(item, season, episode) : pos
    await setPosition(item, Math.max(0, target))
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={item.title}>
      <p className="mb-4 text-sm text-muted">Aktuell: {positionLabel(item)}</p>

      {useSeasons ? (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Staffel</span>
            <select
              value={season}
              onChange={(e) => {
                setSeasonState(Number(e.target.value))
                setEpisode(1)
              }}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5"
            >
              {seasons.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.name} ({s.episodeCount} Folgen)
                </option>
              ))}
            </select>
          </label>
          <Stepper
            label="Folge"
            value={episode}
            min={0}
            max={seasons.find((s) => s.number === season)?.episodeCount ?? 99}
            onChange={setEpisode}
          />
        </div>
      ) : (
        <Stepper
          label={unit}
          value={pos}
          min={0}
          max={total ?? undefined}
          step={item.kind === 'book' ? 5 : item.kind === 'movie' ? 5 : 1}
          onChange={setPos}
        />
      )}

      <button
        onClick={() => void save()}
        className="mt-6 w-full rounded-lg bg-accent py-3 font-semibold text-white active:scale-[0.98]"
      >
        Speichern
      </button>

      <div className="mt-6">
        <span className="mb-2 block text-sm text-muted">Status</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
            <button
              key={s}
              onClick={async () => {
                await setStatus(item, s)
                onClose()
              }}
              className={
                'rounded-full border px-3 py-1.5 text-sm ' +
                (item.status === s
                  ? 'border-accent bg-accent-soft text-text'
                  : 'border-border text-muted')
              }
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function Stepper({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v)
  return (
    <div>
      <span className="mb-1 block text-sm text-muted">
        {label}
        {max != null ? ` (max ${max})` : ''}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(clamp(value - step))}
          className="h-11 w-11 rounded-lg border border-border text-xl"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="h-11 w-full rounded-lg border border-border bg-surface-2 text-center text-lg tabular-nums"
        />
        <button
          onClick={() => onChange(clamp(value + step))}
          className="h-11 w-11 rounded-lg border border-border text-xl"
        >
          +
        </button>
      </div>
    </div>
  )
}
