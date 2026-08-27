import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Poster } from '../components/Poster'
import { useLibrary, type LibraryFilter } from '../hooks/useData'
import { positionLabel, progressFraction } from '../lib/progress'
import type { ItemStatus, MediaKind } from '../lib/types'

const KINDS: { key: MediaKind | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'series', label: 'Serien' },
  { key: 'movie', label: 'Filme' },
  { key: 'anime', label: 'Anime' },
  { key: 'book', label: 'Bücher' },
]

const STATUSES: { key: ItemStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'watching', label: 'Aktiv' },
  { key: 'planned', label: 'Geplant' },
  { key: 'paused', label: 'Pausiert' },
  { key: 'done', label: 'Fertig' },
  { key: 'dropped', label: 'Abgebrochen' },
]

export function Library() {
  const [filter, setFilter] = useState<LibraryFilter>({
    kind: 'all',
    status: 'all',
    query: '',
  })
  const items = useLibrary(filter)

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Bibliothek</h1>

      <input
        value={filter.query}
        onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        placeholder="Filtern…"
        className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 outline-none focus:border-accent"
      />

      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {KINDS.map((k) => (
          <Chip
            key={k.key}
            active={filter.kind === k.key}
            onClick={() => setFilter((f) => ({ ...f, kind: k.key }))}
          >
            {k.label}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {STATUSES.map((s) => (
          <Chip
            key={s.key}
            active={filter.status === s.key}
            onClick={() => setFilter((f) => ({ ...f, status: s.key }))}
          >
            {s.label}
          </Chip>
        ))}
      </div>

      {items === undefined ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">Keine Einträge.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {items.map((item) => {
            const frac = progressFraction(item)
            return (
              <Link key={item.id} to={`/item/${item.id}`} viewTransition>
                <div className="relative">
                  <Poster
                    url={item.poster_url}
                    title={item.title}
                    kind={item.kind}
                    className="aspect-[2/3] w-full"
                  />
                  {frac != null && (
                    <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/50">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs font-medium">{item.title}</p>
                <p className="line-clamp-1 text-[11px] text-muted">{positionLabel(item)}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
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
        'shrink-0 rounded-full border px-3 py-1.5 text-sm ' +
        (active ? 'border-accent bg-accent-soft' : 'border-border text-muted')
      }
    >
      {children}
    </button>
  )
}
