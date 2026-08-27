import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { getShow, nextEpisode, tvId, type NextEpisode } from '../lib/shows'
import { posterAccent } from '../lib/palette'
import type { Item, ShowCache } from '../lib/types'

/** Cached TMDB show data for a series; triggers a background fetch/refresh. */
export function useShow(item: Item | undefined): ShowCache | null {
  const id = item ? tvId(item) : null
  const cached = useLiveQuery(
    () => (id != null ? db.shows.get(id) : undefined),
    [id],
  )

  useEffect(() => {
    if (item && id != null) void getShow(item)
  }, [id, item])

  return cached ?? null
}

export function useNextEpisode(item: Item | undefined): NextEpisode | null {
  const show = useShow(item)
  if (!item) return null
  return nextEpisode(item, show)
}

/** Dominant colour sampled from the poster, as a hex string. */
export function usePosterAccent(item: Item | undefined): string | null {
  const stored = item?.metadata.accent ?? null
  const [hex, setHex] = useState<string | null>(stored)

  useEffect(() => {
    let alive = true
    if (stored) {
      setHex(stored)
      return
    }
    if (item?.poster_url) {
      posterAccent(item.poster_url).then((c) => alive && setHex(c))
    }
    return () => {
      alive = false
    }
  }, [item?.poster_url, stored])

  return hex
}
