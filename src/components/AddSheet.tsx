import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from './Sheet'
import { useAuth } from '../lib/auth'
import { runSearch, type SearchScope } from '../lib/search'
import { addFromSearch, addManual } from '../lib/repo'
import { KIND_LABEL } from '../lib/kinds'
import type { ItemStatus, MediaKind, SearchResult } from '../lib/types'

const SCOPES: { key: SearchScope; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'series', label: 'Serien' },
  { key: 'movie', label: 'Filme' },
  { key: 'anime', label: 'Anime' },
  { key: 'manga', label: 'Manga' },
  { key: 'book', label: 'Bücher' },
]

const ADD_STATUS: { key: ItemStatus; label: string }[] = [
  { key: 'watching', label: 'Schaue jetzt' },
  { key: 'planned', label: 'Geplant' },
  { key: 'done', label: 'Schon fertig' },
]

const SOURCE_BADGE: Record<string, string> = {
  tmdb: 'TMDB',
  anilist: 'AniList',
  openlibrary: 'Books',
  googlebooks: 'Books',
  manual: 'Manuell',
}

export function AddSheet({
  open,
  onClose,
  prefill = '',
}: {
  open: boolean
  onClose: () => void
  prefill?: string
}) {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [scope, setScope] = useState<SearchScope>('all')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (open) {
      setQ(prefill)
      setTimeout(() => inputRef.current?.focus(), 150)
    } else {
      setQ('')
      setResults([])
      setExpanded(null)
      setScope('all')
    }
  }, [open, prefill])

  useEffect(() => {
    if (!open) return
    const id = ++reqId.current
    if (q.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await runSearch(q, scope)
        if (reqId.current === id) setResults(r)
      } finally {
        if (reqId.current === id) setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [q, scope, open])

  async function add(result: SearchResult, status: ItemStatus) {
    if (!userId || adding) return
    setAdding(true)
    try {
      const item = await addFromSearch(result, { userId, status })
      onClose()
      navigate(`/item/${item.id}`)
    } finally {
      setAdding(false)
    }
  }

  async function addManualEntry(status: ItemStatus) {
    if (!userId) return
    const kind: MediaKind =
      scope === 'all' || scope === 'series' ? 'series' : (scope as MediaKind)
    const item = await addManual({ userId, kind, title: q.trim(), status, totalUnits: null })
    onClose()
    navigate(`/item/${item.id}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Hinzufügen" tall>
      <div className="sticky top-0 -mx-5 bg-surface px-5 pb-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titel suchen…"
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent"
        />
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={
                'shrink-0 rounded-full border px-3 py-1.5 text-sm ' +
                (scope === s.key
                  ? 'border-accent bg-accent-soft'
                  : 'border-border text-muted')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-6 text-center text-sm text-muted">Suche…</p>}

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="py-6 text-center text-sm text-muted">
          <p>Nichts gefunden.</p>
          <button
            onClick={() => void addManualEntry('watching')}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-text"
          >
            „{q.trim()}" manuell anlegen
          </button>
        </div>
      )}

      <ul className="space-y-2 py-2">
        {results.map((r) => {
          const key = `${r.source}:${r.source_id}`
          const isOpen = expanded === key
          return (
            <li key={key} className="rounded-xl border border-border bg-surface-2">
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="flex w-full gap-3 p-2 text-left"
              >
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-surface">
                  {r.poster_url && (
                    <img
                      src={r.poster_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {r.year ?? '—'} · {SOURCE_BADGE[r.source]} · {KIND_LABEL[r.kind]}
                  </div>
                  {r.overview && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{r.overview}</p>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="flex flex-wrap gap-2 border-t border-border p-2">
                  {ADD_STATUS.map((s) => (
                    <button
                      key={s.key}
                      disabled={adding}
                      onClick={() => void add(r, s.key)}
                      className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

