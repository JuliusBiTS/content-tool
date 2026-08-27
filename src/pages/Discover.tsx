import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'
import { useAllItems } from '../hooks/useData'
import { forYou, trendingForYou, pickFromWatchlist, PROVIDERS, type PickFilters } from '../lib/discover'
import { addFromSearch, softDelete } from '../lib/repo'
import { KIND_LABEL } from '../lib/kinds'
import { bumpFx } from '../lib/fx'
import type { Item, MediaKind, SearchResult } from '../lib/types'

export function Discover() {
  const items = useAllItems()
  const { userId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [recs, setRecs] = useState<SearchResult[] | null>(null)
  const [trend, setTrend] = useState<SearchResult[] | null>(null)

  useEffect(() => {
    if (!items) return
    forYou(items).then(setRecs)
    trendingForYou(items).then(setTrend)
  }, [items])

  async function add(r: SearchResult) {
    if (!userId) return
    bumpFx()
    const item = await addFromSearch(r, { userId, status: 'planned' })
    toast.show(`„${r.title}" auf die Watchlist`, {
      label: 'Rückgängig',
      run: () => void softDelete(item),
    })
  }

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <h1 className="mb-1 text-xl font-bold lg:text-2xl">Entdecken</h1>
      <p className="mb-5 text-sm text-muted">Was als Nächstes.</p>

      <RandomPicker items={items ?? []} onOpen={(id) => navigate(`/item/${id}`)} />

      {recs && recs.length > 0 && (
        <Shelf title="Für dich" results={recs} onAdd={add} />
      )}
      {recs && recs.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Bewerte ein paar abgeschlossene Titel mit 4★+, dann erscheinen hier Empfehlungen.
        </p>
      )}
      {trend && trend.length > 0 && (
        <Shelf title="Angesagt diese Woche" results={trend} onAdd={add} />
      )}
    </div>
  )
}

function Shelf({
  title,
  results,
  onAdd,
}: {
  title: string
  results: SearchResult[]
  onAdd: (r: SearchResult) => void
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {results.map((r) => (
          <button
            key={r.source_id}
            onClick={() => onAdd(r)}
            className="w-28 shrink-0 text-left lg:w-32"
          >
            <div className="relative">
              <Poster
                url={r.poster_url}
                title={r.title}
                kind={r.kind}
                className="aspect-[2/3] w-full"
              />
              <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs">
                +
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs">{r.title}</p>
            <p className="text-[11px] text-muted">
              {r.year ?? ''} · {KIND_LABEL[r.kind]}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}

function RandomPicker({
  items,
  onOpen,
}: {
  items: Item[]
  onOpen: (id: string) => void
}) {
  const [filters, setFilters] = useState<PickFilters>({
    kind: 'all',
    maxRuntime: null,
    provider: null,
  })
  const [pick, setPick] = useState<Item | null>(null)
  const [spinning, setSpinning] = useState(false)

  const watchlistCount = useMemo(
    () => items.filter((i) => !i.deleted_at && i.status === 'planned').length,
    [items],
  )

  async function roll() {
    setSpinning(true)
    setPick(null)
    // brief suspense
    await new Promise((r) => setTimeout(r, 450))
    const result = await pickFromWatchlist(items, filters)
    setPick(result)
    setSpinning(false)
    bumpFx()
  }

  const kinds: (MediaKind | 'all')[] = ['all', 'series', 'movie', 'anime', 'manga', 'book']

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Zufalls-Picker</h2>
        <span className="text-xs text-muted">{watchlistCount} auf der Watchlist</span>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {kinds.map((k) => (
          <Chip
            key={k}
            active={filters.kind === k}
            onClick={() => setFilters((f) => ({ ...f, kind: k }))}
          >
            {k === 'all' ? 'Alle' : KIND_LABEL[k]}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
        <Chip
          active={filters.maxRuntime === 100}
          onClick={() =>
            setFilters((f) => ({ ...f, maxRuntime: f.maxRuntime === 100 ? null : 100 }))
          }
        >
          &lt; 100 Min
        </Chip>
        {PROVIDERS.map((p) => (
          <Chip
            key={p}
            active={filters.provider === p}
            onClick={() =>
              setFilters((f) => ({ ...f, provider: f.provider === p ? null : p }))
            }
          >
            {p}
          </Chip>
        ))}
      </div>

      <button
        onClick={() => void roll()}
        disabled={spinning || watchlistCount === 0}
        className="mt-4 w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
      >
        {spinning ? '🎲 …' : '🎲 Würfeln'}
      </button>

      {pick && (
        <button
          onClick={() => onOpen(pick.id)}
          className="mt-4 flex w-full animate-[fadein_0.2s_ease-out] gap-3 rounded-lg border border-accent bg-accent-soft/40 p-3 text-left"
        >
          <Poster
            url={pick.poster_url}
            title={pick.title}
            kind={pick.kind}
            accent={pick.metadata.accent}
            className="h-24 w-16"
          />
          <div className="flex flex-col justify-center">
            <span className="font-semibold">{pick.title}</span>
            <span className="text-xs text-muted">
              {pick.metadata.year ?? ''} · {KIND_LABEL[pick.kind]}
              {pick.metadata.runtimeMinutes ? ` · ${pick.metadata.runtimeMinutes} Min` : ''}
            </span>
          </div>
        </button>
      )}
    </section>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'shrink-0 rounded-full border px-3 py-1.5 text-xs ' +
        (active ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted')
      }
    >
      {children}
    </button>
  )
}
