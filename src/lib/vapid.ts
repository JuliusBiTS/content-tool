/**
 * VAPID public key for Web Push. Public by design (ships in the client).
 * The matching private key lives only as a Supabase Edge Function secret.
 * Regenerate with `node scripts/gen-vapid.mjs`.
 */
export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  'BN5u1s5Hua1LthZCAHVyUB8mErwtEVBxOkbl31xpfVx0EibKZGP4hXuMaD8rXzRxTsHd8ByRWEAz3m3e0Azbk4k'
