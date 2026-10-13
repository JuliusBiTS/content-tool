// Cron target (hourly): push "new episode / chapter" notifications.
//
// Deploy:  supabase functions deploy notify-airing --no-verify-jwt
// Secrets: TMDB_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//
// Sources:  TMDB (series, date only) · AniList (anime, exact time) · MangaDex (manga chapters)
//
// Each user has a cursor (push_subscriptions.last_notified_at): we notify for
// everything released *since the last run*, so nothing is sent twice and
// nothing is missed if a run is skipped. Between 22:00 and 07:00 Berlin time we
// stay quiet and leave the cursor untouched, so the morning run catches up.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const TMDB = 'https://api.themoviedb.org/3'
const ANILIST = 'https://graphql.anilist.co'
const MANGADEX = 'https://api.mangadex.org'

const TZ = 'Europe/Berlin'
const QUIET_FROM = 22
const QUIET_TO = 7
const DEFAULT_LOOKBACK_MS = 26 * 3600e3
/** Wide enough that a weekly cron never loses anything. */
const MAX_LOOKBACK_MS = 9 * 24 * 3600e3
/** More hits than this in one run collapse into a single summary push. */
const DIGEST_ABOVE = 4
/** TMDB only knows the date; treat an episode as available at noon UTC that day. */
const TMDB_AVAILABLE_AT = 'T12:00:00Z'
const CHAPTER_NOISE_GAP = 15

interface SeasonMeta {
  number: number
  episodeCount: number
}

interface ItemRow {
  id: string
  user_id: string
  title: string
  kind: string
  status: string
  source: string
  source_id: string | null
  current_position: number
  metadata: { seasons?: SeasonMeta[]; mangadexId?: string } | null
  deleted_at?: string | null
}

interface Hit {
  title: string
  body: string
  tag: string
  at: number
}

// ------------------------------------------------------------------ helpers

export function berlinHour(now: number): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date(now))
  return Number(h)
}

export const isQuietHour = (hour: number): boolean => hour >= QUIET_FROM || hour < QUIET_TO

export function absoluteIndex(
  seasons: SeasonMeta[],
  season: number,
  episode: number,
): number | null {
  if (!seasons?.length) return null
  let abs = 0
  for (const s of [...seasons].sort((a, b) => a.number - b.number)) {
    if (s.number < season) abs += s.episodeCount
    else if (s.number === season) return abs + episode
  }
  return abs + episode
}

/** Distinct integer chapters with their earliest release; old re-uploads dropped. */
export function chapterEntries(
  feed: { attributes: { chapter: string | null; publishAt?: string } }[],
): { number: number; at: number }[] {
  const earliest = new Map<number, number>()
  for (const c of feed) {
    const n = Number(c.attributes.chapter)
    const t = Date.parse(c.attributes.publishAt ?? '')
    if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(t)) continue
    const prev = earliest.get(n)
    if (prev == null || t < prev) earliest.set(n, t)
  }
  if (!earliest.size) return []
  const latest = Math.max(...earliest.keys())
  return [...earliest.entries()]
    .filter(([n]) => n >= latest - CHAPTER_NOISE_GAP)
    .map(([number, at]) => ({ number, at }))
}

/** The user's cursor: oldest `last_notified_at` among their devices, bounded. */
export function sinceFor(lastNotified: (string | null)[], now: number): number {
  const times = lastNotified.map((l) => (l ? Date.parse(l) : NaN))
  const oldest = times.some((t) => !Number.isFinite(t))
    ? now - DEFAULT_LOOKBACK_MS
    : Math.min(...times)
  return Math.max(oldest, now - MAX_LOOKBACK_MS)
}

/** One push per release, or a single summary after a long gap. */
export function buildPushes(hits: Hit[]): { title: string; body: string; tag: string }[] {
  const sorted = [...hits].sort((a, b) => a.at - b.at)
  if (sorted.length <= DIGEST_ABOVE) {
    return sorted.map((h) => ({ title: h.title, body: h.body, tag: h.tag }))
  }
  const titles = [...new Set([...sorted].reverse().map((h) => h.title))]
  const more = titles.length > 3 ? ` und ${titles.length - 3} weitere` : ''
  return [
    {
      title: 'MediaLog',
      body: `${sorted.length} Neuerscheinungen: ${titles.slice(0, 3).join(', ')}${more}`,
      tag: 'digest',
    },
  ]
}

async function tmdb(path: string): Promise<any> {
  const res = await fetch(`${TMDB}${path}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('TMDB_TOKEN')}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

async function anilistSchedules(
  ids: number[],
  fromSec: number,
  toSec: number,
): Promise<Map<number, { episode: number; airingAt: number }[]>> {
  const out = new Map<number, { episode: number; airingAt: number }[]>()
  if (!ids.length) return out
  const q = `query($ids:[Int],$from:Int,$to:Int,$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}airingSchedules(mediaId_in:$ids,airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){mediaId episode airingAt}}}`
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: { ids, from: fromSec, to: toSec, page } }),
    })
    if (!res.ok) throw new Error(`AniList ${res.status}`)
    const json = await res.json()
    const p = json.data?.Page
    for (const n of p?.airingSchedules ?? []) {
      const list = out.get(n.mediaId) ?? []
      list.push({ episode: n.episode, airingAt: n.airingAt })
      out.set(n.mediaId, list)
    }
    if (!p?.pageInfo?.hasNextPage) break
  }
  return out
}

async function mangadexFeed(id: string): Promise<{ number: number; at: number }[]> {
  const res = await fetch(
    `${MANGADEX}/manga/${id}/feed?limit=40&order[publishAt]=desc` +
      `&translatedLanguage[]=en&translatedLanguage[]=de&includeExternalUrl=1`,
  )
  if (!res.ok) throw new Error(`MangaDex ${res.status}`)
  return chapterEntries((await res.json()).data ?? [])
}

// ------------------------------------------------------------------ handler

export async function handle(req: Request): Promise<Response> {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const now = Date.now()
  if (isQuietHour(berlinHour(now))) {
    return Response.json({ ok: true, sent: 0, quiet: true })
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

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, last_notified_at')
  if (!subs?.length) return Response.json({ ok: true, sent: 0 })

  const subsByUser = new Map<string, typeof subs>()
  for (const s of subs) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }
  const since = new Map<string, number>()
  for (const [uid, list] of subsByUser) {
    since.set(uid, sinceFor(list.map((s: any) => s.last_notified_at), now))
  }
  const oldest = Math.min(...since.values())

  const { data: rows } = await supabase
    .from('items')
    .select('id, user_id, title, kind, status, source, source_id, current_position, metadata, deleted_at')
    .in('user_id', [...subsByUser.keys()])
    .in('kind', ['series', 'anime', 'manga'])
    .in('status', ['watching', 'paused', 'done'])
    .is('deleted_at', null)
  const items = ((rows ?? []) as ItemRow[]).filter(
    (i) => !i.deleted_at && subsByUser.has(i.user_id),
  )

  const live = (i: ItemRow) => i.status === 'watching' || i.status === 'paused'
  const isTv = (i: ItemRow) =>
    i.source === 'tmdb' && !!i.source_id?.startsWith('tv:') && i.kind !== 'manga'
  const isAnime = (i: ItemRow) =>
    i.source === 'anilist' && i.kind === 'anime' && live(i) && !!i.source_id
  const isManga = (i: ItemRow) =>
    i.kind === 'manga' && live(i) && !!i.metadata?.mangadexId

  // ---- fetch each medium once, however many users follow it
  const tvShows = new Map<string, any>()
  for (const id of new Set(items.filter(isTv).map((i) => i.source_id!.slice(3)))) {
    try {
      tvShows.set(id, await tmdb(`/tv/${id}?language=de-DE`))
    } catch (e) {
      console.warn('tmdb failed', id, e)
    }
  }

  let animeSchedules = new Map<number, { episode: number; airingAt: number }[]>()
  try {
    animeSchedules = await anilistSchedules(
      [...new Set(items.filter(isAnime).map((i) => Number(i.source_id)))],
      Math.floor(oldest / 1000) - 1,
      Math.floor(now / 1000),
    )
  } catch (e) {
    console.warn('anilist failed', e)
  }

  const chapters = new Map<string, { number: number; at: number }[]>()
  for (const id of new Set(items.filter(isManga).map((i) => i.metadata!.mangadexId!))) {
    try {
      chapters.set(id, await mangadexFeed(id))
    } catch (e) {
      console.warn('mangadex failed', id, e)
    }
  }

  // ---- decide who gets what
  const hitsByUser = new Map<string, Hit[]>()
  const add = (uid: string, hit: Hit) => {
    const list = hitsByUser.get(uid) ?? []
    list.push(hit)
    hitsByUser.set(uid, list)
  }
  const behind = (n: number, pos: number) => (n - pos > 1 ? ` · ${n - pos} offen` : '')

  for (const item of items) {
    const from = since.get(item.user_id)!
    const pos = item.current_position

    if (isTv(item)) {
      const show = tvShows.get(item.source_id!.slice(3))
      const last = show?.last_episode_to_air
      if (!last?.air_date) continue
      const at = Date.parse(last.air_date + TMDB_AVAILABLE_AT)
      if (!(at > from && at <= now)) continue
      const abs = absoluteIndex(
        item.metadata?.seasons ?? [],
        last.season_number,
        last.episode_number,
      )
      if (abs != null && pos >= abs) continue
      add(item.user_id, {
        title: item.title,
        tag: `ep-${item.id}`,
        at,
        body:
          `S${last.season_number} E${last.episode_number}` +
          (last.name ? ` – ${last.name}` : '') +
          ' ist da.' +
          (abs != null ? behind(abs, pos) : ''),
      })
    } else if (isAnime(item)) {
      const hit = (animeSchedules.get(Number(item.source_id)) ?? [])
        .filter((n) => n.airingAt * 1000 > from && n.airingAt * 1000 <= now && n.episode > pos)
        .sort((a, b) => b.episode - a.episode)[0]
      if (!hit) continue
      add(item.user_id, {
        title: item.title,
        tag: `ep-${item.id}`,
        at: hit.airingAt * 1000,
        body: `Folge ${hit.episode} ist da.${behind(hit.episode, pos)}`,
      })
    } else if (isManga(item)) {
      const hit = (chapters.get(item.metadata!.mangadexId!) ?? [])
        .filter((c) => c.at > from && c.at <= now && c.number > pos)
        .sort((a, b) => b.number - a.number)[0]
      if (!hit) continue
      add(item.user_id, {
        title: item.title,
        tag: `ch-${item.id}`,
        at: hit.at,
        body: `Kapitel ${hit.number} ist erschienen.${behind(hit.number, pos)}`,
      })
    }
  }

  // ---- send, then advance every user's cursor
  const nowIso = new Date(now).toISOString()
  let sent = 0
  for (const [uid, list] of subsByUser) {
    for (const push of buildPushes(hitsByUser.get(uid) ?? [])) {
      for (const s of list as any[]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ ...push, url: '/upcoming' }),
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
    await supabase
      .from('push_subscriptions')
      .update({ last_notified_at: nowIso })
      .in('endpoint', (list as any[]).map((s) => s.endpoint))
  }

  return Response.json({ ok: true, sent })
}

Deno.serve(handle)
