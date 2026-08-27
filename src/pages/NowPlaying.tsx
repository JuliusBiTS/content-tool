import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Stage } from '../components/Stage'
import { TitleTreatment } from '../components/TitleTreatment'
import { useToast } from '../components/Toast'
import { useItem } from '../hooks/useData'
import { useNextEpisode, usePosterAccent } from '../hooks/useShow'
import { bumpProgress, setPosition } from '../lib/repo'
import { bumpFx } from '../lib/fx'
import { nextActionLabel, positionLabel } from '../lib/progress'

export function NowPlaying() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const item = useItem(id)
  const next = useNextEpisode(item)
  const accent = usePosterAccent(item)
  const [busy, setBusy] = useState(false)

  if (!item) return <div className="grid min-h-dvh place-items-center text-muted">…</div>

  const label = nextActionLabel(item)

  async function go() {
    if (busy) return
    setBusy(true)
    bumpFx()
    const prev = item!.current_position
    try {
      const updated = await bumpProgress(item!)
      toast.show(positionLabel(updated), {
        label: 'Rückgängig',
        run: () => void setPosition(updated, prev),
      })
      navigate(`/item/${item!.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stage
      backdrop={item.backdrop_url}
      accent={accent}
      minH="100dvh"
      className="items-center justify-center px-6 text-center"
    >
      <button
        onClick={() => navigate(-1)}
        className="absolute left-4 top-5 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-lg backdrop-blur"
      >
        ‹
      </button>

      <div className="flex flex-col items-center">
        <TitleTreatment
          logo={item.metadata.logo_url}
          title={item.title}
          maxH="6rem"
          className="mx-auto"
        />
        <p className="mt-3 text-white/80">
          {next?.name && !next.upcoming
            ? `${label} · ${next.name}`
            : label}
        </p>

        <button
          onClick={() => void go()}
          disabled={busy}
          className="mt-8 rounded-full px-10 py-4 text-lg font-semibold text-white shadow-2xl active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--scene-accent)' }}
        >
          ▶ Los
        </button>
      </div>
    </Stage>
  )
}
