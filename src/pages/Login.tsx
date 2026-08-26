import { useState } from 'react'
import { useAuth } from '../lib/auth'

export function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
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
      } else {
        await signUp(email, password)
        setMsg('Konto erstellt. Du kannst dich jetzt anmelden.')
        setMode('in')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
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

        {err && <p className="text-sm text-danger">{err}</p>}
        {msg && <p className="text-sm text-success">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? '…' : mode === 'in' ? 'Anmelden' : 'Konto erstellen'}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in')
          setErr(null)
        }}
        className="mt-4 text-center text-sm text-muted"
      >
        {mode === 'in' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
      </button>
    </div>
  )
}
