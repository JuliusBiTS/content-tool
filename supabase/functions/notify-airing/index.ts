// Daily cron target: push "new episode" notifications.
// Deploy:  supabase functions deploy notify-airing --no-verify-jwt
// Secrets: supabase secrets set TMDB_TOKEN=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const TMDB = 'https://api.themoviedb.org/3'
const WINDOW_H = 30

interface SeasonMeta {
  number: number
  episodeCount: number
}

function absoluteIndex(seasons: SeasonMeta[], season: number, episode: number): number | null {
  if (!seasons?.length) return null
  let abs = 0
  for (const s of [...seasons].sort((a, b) => a.number - b.number)) {
    if (s.number < season) abs += s.episodeCount
    else if (s.number === season) return abs + episode
  }
  return abs + episode
}

async function tmdb(path: string): Promise<any> {
  const res = await fetch(`${TMDB}${path}`, {
    headers: {
      Authorization: `Bearer ${Deno.env.get('TMDB_TOKEN')}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // users with at least one push subscription
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
  if (!subs?.length) return Response.json({ ok: true, sent: 0 })

  const subsByUser = new Map<string, typeof subs>()
  for (const s of subs) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }

  const { data: items } = await supabase
    .from('items')
    .select('user_id, title, source_id, current_position, metadata, kind, status')
    .in('kind', ['series', 'anime'])
    .in('status', ['watching', 'paused'])
    .is('deleted_at', null)

  const now = Date.now()
  const showCache = new Map<string, any>()
  let sent = 0

  for (const item of items ?? []) {
    if (!subsByUser.has(item.user_id)) continue
    if (typeof item.source_id !== 'string' || !item.source_id.startsWith('tv:')) continue
    const tvId = item.source_id.slice(3)

    let show = showCache.get(tvId)
    if (!show) {
      try {
        show = await tmdb(`/tv/${tvId}?language=de-DE`)
      } catch {
        continue
      }
      showCache.set(tvId, show)
    }

    const last = show.last_episode_to_air
    if (!last?.air_date) continue
    const airedAgoH = (now - Date.parse(last.air_date + 'T00:00:00Z')) / 3.6e6
    if (airedAgoH < 0 || airedAgoH > WINDOW_H) continue

    const abs = absoluteIndex(
      item.metadata?.seasons ?? [],
      last.season_number,
      last.episode_number,
    )
    if (abs != null && item.current_position >= abs) continue // already watched

    const body =
      `S${last.season_number} E${last.episode_number}` +
      (last.name ? ` – ${last.name}` : '') +
      ' ist da.'

    for (const s of subsByUser.get(item.user_id)!) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: item.title, body, tag: `ep-${tvId}`, url: '/upcoming' }),
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
  }

  return Response.json({ ok: true, sent })
})
