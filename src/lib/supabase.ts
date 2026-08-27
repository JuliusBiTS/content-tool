import { createClient } from '@supabase/supabase-js'

/**
 * These are the project's *public* credentials. The anon key is safe to ship in
 * the client — every table is protected by Row Level Security, and only the
 * (never-committed) service_role key can bypass it. Env vars override them, but
 * only when they actually look like Supabase credentials — a misconfigured
 * deploy var (e.g. a TMDB token pasted into the wrong field) is ignored.
 */
const DEFAULT_URL = 'https://letwjhkoizobagwwcawu.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxldHdqaGtvaXpvYmFnd3djYXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODAzMzQsImV4cCI6MjEwMzM1NjMzNH0.D_zzrfOtk2uVV4u8oqUwS2703LFuGCCffBrPatsF2_0'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const seg = token.split('.')[1]
    return JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

/** A Supabase anon key is a JWT with iss=supabase and role=anon. */
function isSupabaseAnonKey(key: string | undefined): key is string {
  if (!key) return false
  const p = decodeJwtPayload(key)
  return !!p && p.role === 'anon' && (p.iss === 'supabase' || typeof p.ref === 'string')
}

function isSupabaseUrl(u: string | undefined): u is string {
  return !!u && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)$/i.test(u)
}

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const url = isSupabaseUrl(envUrl) ? envUrl : DEFAULT_URL
const anonKey = isSupabaseAnonKey(envKey) ? envKey : DEFAULT_ANON_KEY

if (envKey && !isSupabaseAnonKey(envKey)) {
  console.warn(
    '[MediaLog] VITE_SUPABASE_ANON_KEY is set but is not a Supabase anon key — ignoring it.',
  )
}

export const hasSupabaseConfig = Boolean(url && anonKey)

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
