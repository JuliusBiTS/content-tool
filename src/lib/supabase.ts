import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(url && anonKey)

if (!hasSupabaseConfig) {
  // Not fatal: the app still runs local-only until env is filled in.
  console.warn(
    '[MediaLog] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — running in local-only mode.',
  )
}

export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
