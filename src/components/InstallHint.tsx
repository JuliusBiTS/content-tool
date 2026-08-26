import { useEffect, useState } from 'react'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa:install-hint-dismissed'

export function InstallHint() {
  const [evt, setEvt] = useState<BIPEvent | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch {
      /* ignore */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BIPEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!evt) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setEvt(null)
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm shadow-lg lg:bottom-6">
      <span className="flex-1">MediaLog zur Startseite hinzufügen?</span>
      <button
        onClick={async () => {
          await evt.prompt()
          dismiss()
        }}
        className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white"
      >
        Hinzufügen
      </button>
      <button onClick={dismiss} className="text-muted" aria-label="Schließen">
        ✕
      </button>
    </div>
  )
}
