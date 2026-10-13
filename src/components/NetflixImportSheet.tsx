import { useMemo, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { useAuth } from '../lib/auth'
import { readNetflixFile, type ParsedNetflix } from '../lib/import/netflix'
import {
  analyzeNetflix,
  runNetflixImport,
  type NetflixPlan,
  type NetflixResult,
} from '../lib/import/netflixImport'

type Phase = 'pick' | 'profile' | 'analyzing' | 'review' | 'importing' | 'done'

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

/** "S2 E4" for a running position, given the show's season sizes. */
function where(position: number, seasons: { number: number; episodeCount: number }[]): string {
  let rest = position
  for (const s of [...seasons].filter((x) => x.number > 0 && x.episodeCount > 0).sort((a, b) => a.number - b.number)) {
    if (rest <= s.episodeCount) return `S${s.number} E${rest}`
    rest -= s.episodeCount
  }
  return `Folge ${position}`
}

export function NetflixImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('pick')
  const [parsed, setParsed] = useState<ParsedNetflix | null>(null)
  const [profile, setProfile] = useState('')
  const [plan, setPlan] = useState<NetflixPlan | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<NetflixResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPhase('pick')
    setParsed(null)
    setProfile('')
    setPlan(null)
    setProgress({ done: 0, total: 0 })
    setResult(null)
    setError(null)
  }

  async function analyze(p: ParsedNetflix, prof: string) {
    setPhase('analyzing')
    const rows = prof ? p.rows.filter((r) => r.profile === prof) : p.rows
    if (!rows.length) {
      setError('Für dieses Profil wurden keine Einträge gefunden.')
      setPhase(p.profiles.length > 1 ? 'profile' : 'pick')
      return
    }
    try {
      setPlan(await analyzeNetflix(rows, (done, total) => setProgress({ done, total })))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Abgleich fehlgeschlagen')
      setPhase('pick')
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const p = await readNetflixFile(file, navigator.language.startsWith('en-US') ? 'MDY' : 'DMY')
      if (!p.rows.length) {
        setError('Keine Einträge gefunden. Ist das die Netflix-Wiedergabeaktivität (CSV oder ZIP)?')
        return
      }
      setParsed(p)
      if (p.profiles.length > 1) {
        // the profile with the most plays is the likely candidate
        const counts = new Map<string, number>()
        for (const r of p.rows) counts.set(r.profile ?? '', (counts.get(r.profile ?? '') ?? 0) + 1)
        setProfile([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
        setPhase('profile')
      } else {
        void analyze(p, '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden.')
    }
  }

  async function start() {
    if (!plan || !userId) return
    setPhase('importing')
    setProgress({ done: 0, total: 0 })
    try {
      const r = await runNetflixImport(plan, {
        userId,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(r)
      setPhase('done')
      toast.show(`${r.showsAdded + r.showsUpdated} Serien, ${r.moviesAdded} Filme übernommen`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen')
      setPhase('review')
    }
  }

  const toggleShow = (i: number) =>
    setPlan((p) => p && { ...p, shows: p.shows.map((s, k) => (k === i ? { ...s, selected: !s.selected } : s)) })
  const toggleMovie = (i: number) =>
    setPlan((p) => p && { ...p, movies: p.movies.map((m, k) => (k === i ? { ...m, selected: !m.selected } : m)) })
  const setAll = (on: boolean) =>
    setPlan((p) => p && {
      ...p,
      shows: p.shows.map((s) => ({ ...s, selected: on })),
      movies: p.movies.map((m) => ({ ...m, selected: on })),
    })

  const selected = useMemo(
    () => (plan ? plan.shows.filter((s) => s.selected).length + plan.movies.filter((m) => m.selected).length : 0),
    [plan],
  )
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const busy = phase === 'analyzing' || phase === 'importing'

  return (
    <Sheet
      open={open}
      tall={phase === 'review'}
      title="Aus Netflix importieren"
      onClose={() => {
        if (busy) return
        onClose()
        setTimeout(reset, 200)
      }}
    >
      {phase === 'pick' && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface-2 p-4 text-sm">
            <p className="mb-2 font-medium">So kommst du an die Datei</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                Auf <b>netflix.com</b> im Browser (nicht in der App) einloggen → Profilbild → <b>Konto</b>
              </li>
              <li>
                Unter „Profile &amp; Jugendschutz" dein Profil aufklappen → bei <b>Wiedergabeaktivität</b> auf „Anzeigen"
              </li>
              <li>
                Ganz nach unten scrollen → <b>Alle herunterladen</b> (Download all). Du bekommst{' '}
                <code>NetflixViewingHistory.csv</code>
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Gründlichere Variante: Konto → „Persönliche Daten herunterladen" (kommt per Mail, dauert
              Stunden bis Tage). Die ZIP kannst du direkt hier hochladen — sie enthält
              <code> CONTENT_INTERACTION/ViewingActivity.csv</code>.
            </p>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-border py-6 text-sm text-muted"
          >
            Datei auswählen (.csv / .zip)
          </button>
          <input ref={fileRef} type="file" accept=".csv,.zip,text/csv,application/zip" onChange={onFile} className="hidden" />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {phase === 'profile' && parsed && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Die Datei enthält mehrere Profile. Welches soll importiert werden?
          </p>
          <div className="space-y-2">
            {parsed.profiles.map((p) => (
              <label key={p} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                <input type="radio" name="profile" checked={profile === p} onChange={() => setProfile(p)} />
                {p}
                <span className="ml-auto text-xs text-muted">
                  {parsed.rows.filter((r) => r.profile === p).length} Einträge
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            onClick={() => void analyze(parsed, profile)}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-white"
          >
            Weiter
          </button>
        </div>
      )}

      {(phase === 'analyzing' || phase === 'importing') && (
        <div className="space-y-4 py-6 text-center">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted">
            {phase === 'analyzing' ? 'Abgleich mit TMDB' : 'Importiere'} · {progress.done} / {progress.total}
          </p>
          <p className="text-xs text-muted">Fenster offen lassen.</p>
        </div>
      )}

      {phase === 'review' && plan && (
        <div className="space-y-5 pb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              {plan.shows.length} Serien · {plan.movies.length} Filme
            </span>
            <span className="flex gap-3 text-accent">
              <button onClick={() => setAll(true)}>Alle</button>
              <button onClick={() => setAll(false)}>Keine</button>
            </span>
          </div>

          {plan.shows.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Serien</h3>
              <ul className="space-y-1.5">
                {plan.shows.map((s, i) => (
                  <li key={s.match.source_id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-2.5">
                      <input type="checkbox" checked={s.selected} onChange={() => toggleShow(i)} className="mt-1" />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="truncate font-medium">
                          {s.match.title}
                          {s.match.year ? ` (${s.match.year})` : ''}
                          {!s.confident && <span className="ml-2 text-xs text-danger">prüfen</span>}
                        </div>
                        <div className="text-xs text-muted">
                          bis {where(s.progress.position, s.detail.seasons)}
                          {s.progress.estimated ? ' (geschätzt)' : ''} · {s.watch.entries.length} Folgen · zuletzt{' '}
                          {fmtDate(s.watch.lastDate)}
                        </div>
                        <div className="text-xs text-muted">
                          {s.existing
                            ? s.progress.position > s.existing.current_position
                              ? `bereits in der Bibliothek – weiter bei ${where(s.existing.current_position, s.detail.seasons)}`
                              : 'bereits in der Bibliothek, kein neuer Fortschritt'
                            : s.status === 'done'
                              ? 'wird als „Fertig" angelegt'
                              : s.status === 'paused'
                                ? 'wird als „Pausiert" angelegt'
                                : 'wird als „Schaue" angelegt'}
                        </div>
                        {s.watch.title !== s.match.title && (
                          <div className="truncate text-[11px] text-muted">Netflix: {s.watch.title}</div>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.movies.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                Filme ({plan.movies.filter((m) => m.selected).length} / {plan.movies.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {plan.movies.map((m, i) => (
                  <li key={m.match.source_id + i}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-2.5 py-2 text-sm">
                      <input type="checkbox" checked={m.selected} onChange={() => toggleMovie(i)} />
                      <span className="min-w-0 flex-1 truncate">
                        {m.match.title}
                        {m.match.year ? ` (${m.match.year})` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {m.exists ? 'schon da' : !m.confident ? 'prüfen' : fmtDate(m.watch.date)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {plan.unmatched.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Nicht gefunden ({plan.unmatched.length})</summary>
              <p className="mt-1">{plan.unmatched.join(', ')}</p>
            </details>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            onClick={() => void start()}
            disabled={selected === 0}
            className="sticky bottom-0 w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
          >
            {selected} {selected === 1 ? 'Eintrag' : 'Einträge'} importieren
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface-2 p-4 text-sm">
            <Row label="Neue Serien" value={result.showsAdded} />
            <Row label="Fortschritt aktualisiert" value={result.showsUpdated} />
            <Row label="Neue Filme" value={result.moviesAdded} />
            {result.failed.length > 0 && <Row label="Fehlgeschlagen" value={result.failed.length} />}
          </div>
          <p className="text-xs text-muted">
            Die Sehzeit und die Aktivität-Heatmap enthalten jetzt deine Netflix-Historie mit den echten Tagen.
          </p>
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
