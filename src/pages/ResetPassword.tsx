import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function ResetPassword() {
  const { updatePassword, passwordRecovery, userId } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Reached only with a valid recovery link (which creates a session) — or by a
  // signed-in user who wants to change their password.
  const allowed = passwordRecovery || Boolean(userId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setErr('Die Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => navigate('/', { replace: true }), 1500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">Neues Passwort</h1>

      {!allowed ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="mt-4 rounded-lg border border-border py-2.5 text-sm"
          >
            Zurück zur Anmeldung
          </button>
        </>
      ) : done ? (
        <p className="mt-1 text-sm text-success">Passwort geändert. Weiterleitung…</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Neues Passwort"
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Passwort bestätigen"
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
          />
          {err && <p className="text-sm text-danger">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? '…' : 'Passwort setzen'}
          </button>
        </form>
      )}
    </div>
  )
}
