import { createClient } from '@supabase/supabase-js'

/**
 * These are the project's *public* credentials. The anon key is safe to ship in
 * the client — every table is protected by Row Level Security, and only the
 * (never-committed) service_role key can bypass it. Env vars override them so
 * a fork / second environment can point elsewhere.
 */
const DEFAULT_URL = 'https://letwjhkoizobagwwcawu.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxldHdqaGtvaXpvYmFnd3djYXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODAzMzQsImV4cCI6MjEwMzM1NjMzNH0.D_zzrfOtk2uVV4u8oqUwS2703LFuGCCffBrPatsF2_0'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

export const hasSupabaseConfig = Boolean(url && anonKey)

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
