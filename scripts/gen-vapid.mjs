// Generate a VAPID keypair for Web Push.
//   node scripts/gen-vapid.mjs
// Put the public key in src/lib/vapid.ts, set the private key + subject as
// Supabase Edge Function secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log(JSON.stringify(keys, null, 2))
