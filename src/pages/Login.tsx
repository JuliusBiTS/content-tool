import { useState } from 'react'
import { useAuth } from '../lib/auth'

type Mode = 'in' | 'up' | 'forgot'

export function Login() {
  const { signIn, signUp, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else if (mode === 'up') {
        await signUp(email, password)
        setMsg('Konto erstellt. Du kannst dich jetzt anmelden.')
        setMode('in')
      } else {
        await sendPasswordReset(email)
        setMsg('Falls es ein Konto gibt, ist eine E-Mail mit Link unterwegs.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'in' ? 'Anmelden' : mode === 'up' ? 'Konto erstellen' : 'Link senden'

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-2xl">
          ▶
        </div>
        <h1 className="text-2xl font-bold">MediaLog</h1>
        <p className="mt-1 text-sm text-muted">
          Serien, Filme, Anime &amp; Bücher — Fortschritt in einem Tap.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          autoComplete="email"
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
        {mode !== 'forgot' && (
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
          />
        )}

        {err && <p className="text-sm text-danger">{err}</p>}
        {msg && <p className="text-sm text-success">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? '…' : title}
        </button>
      </form>

      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted">
        {mode === 'in' && (
          <>
            <button onClick={() => switchMode('forgot')}>Passwort vergessen?</button>
            <button onClick={() => switchMode('up')}>
              Noch kein Konto? Registrieren
            </button>
          </>
        )}
        {mode === 'up' && (
          <button onClick={() => switchMode('in')}>Schon ein Konto? Anmelden</button>
        )}
        {mode === 'forgot' && (
          <button onClick={() => switchMode('in')}>Zurück zur Anmeldung</button>
        )}
      </div>
    </div>
  )

  function switchMode(m: Mode) {
    setMode(m)
    setErr(null)
    setMsg(null)
  }
}
