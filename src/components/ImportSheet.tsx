import { useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { useAuth } from '../lib/auth'
import { queueSync } from '../lib/sync'
import {
  readLetterboxdFile,
  runImport,
  type ImportPlan,
  type ImportResult,
} from '../lib/import/letterboxd'

type Phase = 'pick' | 'confirm' | 'running' | 'done'

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('pick')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [includeWatchlist, setIncludeWatchlist] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPhase('pick')
    setPlan(null)
    setProgress({ done: 0, total: 0 })
    setResult(null)
    setError(null)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const p = await readLetterboxdFile(file)
      if (p.rated.length === 0 && p.watchlist.length === 0) {
        setError('Keine Filme gefunden. Lade den ZIP-Export oder ratings.csv hoch.')
        return
      }
      setPlan(p)
      setPhase('confirm')
    } catch {
      setError('Datei konnte nicht gelesen werden. ZIP-Export oder ratings.csv erwartet.')
    }
  }

  async function start() {
    if (!plan || !userId) return
    setPhase('running')
    try {
      const r = await runImport(plan, {
        userId,
        includeWatchlist,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(r)
      setPhase('done')
      queueSync(300)
      toast.show(`${r.added} Filme importiert`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
      setPhase('confirm')
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (phase !== 'running') {
          onClose()
          setTimeout(reset, 200)
        }
      }}
      title="Aus Letterboxd importieren"
    >
      {phase === 'pick' && (
        <div className="space-y-4">
          <ol className="space-y-1 text-sm text-muted">
            <li>1. Auf letterboxd.com → Settings → <b>Import &amp; Export</b> → <b>Export Your Data</b></li>
            <li>2. Die heruntergeladene <b>.zip</b> (oder die <b>ratings.csv</b> daraus) hier hochladen</li>
          </ol>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-border py-6 text-sm text-muted"
          >
            Datei auswählen (.zip / .csv)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.csv,text/csv,application/zip"
            onChange={onFile}
            className="hidden"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {phase === 'confirm' && plan && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface-2 p-4 text-sm">
            <Row label="Bewertete Filme" value={plan.rated.length} />
            <Row label="Watchlist" value={plan.watchlist.length} />
          </div>
          <label className="flex items-center justify-between text-sm">
            <span>Watchlist als „Geplant" mitimportieren</span>
            <input
              type="checkbox"
              checked={includeWatchlist}
              onChange={(e) => setIncludeWatchlist(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-accent)]"
            />
          </label>
          <p className="text-xs text-muted">
            Titel werden über TMDB abgeglichen (für Poster). Bereits vorhandene Filme
            werden übersprungen. Das kann bei großen Listen ein paar Minuten dauern.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            onClick={() => void start()}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-white"
          >
            {plan.rated.length + (includeWatchlist ? plan.watchlist.length : 0)} Einträge
            importieren
          </button>
        </div>
      )}

      {phase === 'running' && (
        <div className="space-y-4 py-4 text-center">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {progress.done} / {progress.total} verarbeitet
          </p>
          <p className="text-xs text-muted">Fenster offen lassen.</p>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface-2 p-4 text-sm">
            <Row label="Importiert" value={result.added} />
            <Row label="Übersprungen (schon da)" value={result.skipped} />
            <Row label="Ohne TMDB-Treffer" value={result.unmatched.length} />
          </div>
          {result.unmatched.length > 0 && (
            <details className="text-xs text-muted">
              <summary>Ohne Poster angelegt</summary>
              <p className="mt-1">{result.unmatched.join(', ')}</p>
            </details>
          )}
          <button
            onClick={() => {
              onClose()
              setTimeout(reset, 200)
            }}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-white"
          >
            Fertig
          </button>
        </div>
      )}
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
