import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { unseenAiredCount, upcomingEntries } from '../lib/airing'
import type { AiringEntry } from '../lib/shows'

/**
 * Fingerprint of everything the calendar depends on: the show cache (by fetch
 * time — a refresh keeps the row count constant, so count alone never changes)
 * and the followed items (status, progress, season sizes).
 */
function useAiringTick(): string | undefined {
  return useLiveQuery(async () => {
    const [shows, releases, items, seen] = await Promise.all([
      db.shows.toArray(),
      db.releases.toArray(),
      db.items.where('kind').anyOf('series', 'anime', 'manga').toArray(),
      db.meta.get('airing:seenKeys'),
    ])
    const seenSig = `${seen?.value.length ?? 0}:${seen?.value.slice(-40) ?? ''}`
    const s =
      shows.map((x) => `${x.tmdbId}@${x.fetchedAt}`).join('|') +
      releases.map((x) => `${x.key}@${x.fetchedAt}`).join('|') +
      seenSig
    const i = items
      .map(
        (x) =>
          `${x.id}:${x.status}:${x.current_position}:${x.deleted_at ? 'd' : ''}:${(x.metadata.seasons ?? []).map((z) => z.episodeCount).join('.')}`,
      )
      .join('|')
    return `${s}#${i}`
  })
}

/** Count of aired-but-unwatched episodes the user hasn't seen on "Diese Woche" yet. */
export function useUnseenAired(): number {
  const [n, setN] = useState(0)
  const tick = useAiringTick()

  useEffect(() => {
    let alive = true
    unseenAiredCount().then((c) => alive && setN(c))
    return () => {
      alive = false
    }
  }, [tick])

  return n
}

/** Live list of recently aired + upcoming episodes of the shows being followed. */
export function useUpcoming(): AiringEntry[] | null {
  const [rows, setRows] = useState<AiringEntry[] | null>(null)
  const tick = useAiringTick()

  useEffect(() => {
    let alive = true
    upcomingEntries().then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [tick])

  return rows
}
