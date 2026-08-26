import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from './supabase'
import { getMeta, setMeta } from './db'
import { queueSync, resetSyncCache, switchAccount } from './sync'

const LOCAL_USER_KEY = 'auth:localUserId'

interface AuthValue {
  ready: boolean
  session: Session | null
  userId: string | null
  /** true when running without a Supabase backend (local-only mode) */
  localOnly: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [localUserId, setLocalUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!hasSupabaseConfig) {
      void (async () => {
        let id = await getMeta(LOCAL_USER_KEY)
        if (!id) {
          id = crypto.randomUUID()
          await setMeta(LOCAL_USER_KEY, id)
        }
        await switchAccount(`local:${id}`)
        setLocalUserId(id)
        setReady(true)
      })()
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await switchAccount(data.session.user.id)
      setSession(data.session)
      setReady(true)
      if (data.session) queueSync(200)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (s) await switchAccount(s.user.id)
      setSession(s)
      if (s) queueSync(200)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      localOnly: !hasSupabaseConfig,
      userId: hasSupabaseConfig ? (session?.user.id ?? null) : localUserId,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      },
      async signOut() {
        await supabase.auth.signOut()
        await resetSyncCache()
        await setMeta('account:owner', '')
        location.reload()
      },
    }),
    [ready, session, localUserId],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
