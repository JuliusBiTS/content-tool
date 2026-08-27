import { useState } from 'react'
import { useAuth } from '../lib/auth'

const KEY = 'onboarding:done'

const SLIDES = [
  { icon: '▶', title: 'Ein Tap = geloggt', body: 'Auf der Startseite tippst du „+1" – die nächste Folge ist eingetragen. Fehltipp? Der Rückgängig-Toast fängt ihn ab.' },
  { icon: '📅', title: 'Diese Woche', body: 'Neue Folgen deiner laufenden Serien, nach Tag sortiert. Optional als Push-Benachrichtigung.' },
  { icon: '🎲', title: 'Was schauen?', body: 'Entdecken schlägt dir Titel nach deinem Geschmack vor und würfelt aus deiner Watchlist.' },
]

export function Onboarding() {
  const { userId } = useAuth()
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return true
    }
  })

  if (dismissed || !userId) return null

  function close() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  const s = SLIDES[step]
  const last = step === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-2xl">
          {s.icon}
        </div>
        <h2 className="mt-4 font-display text-lg font-bold">{s.title}</h2>
        <p className="mt-2 text-sm text-muted">{s.body}</p>

        <div className="mt-4 flex justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step ? 'w-4 bg-accent' : 'w-1.5 bg-border')
              }
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={close} className="flex-1 rounded-lg border border-border py-2.5 text-sm">
            Überspringen
          </button>
          <button
            onClick={() => (last ? close() : setStep(step + 1))}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white"
          >
            {last ? 'Los' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
