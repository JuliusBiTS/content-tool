import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { getShow, nextEpisode, tvId, type NextEpisode } from '../lib/shows'
import { refreshReleasesFor } from '../lib/releases'
import { releaseKey } from '../lib/releaseLogic'
import { posterAccent } from '../lib/palette'
import type { Item, ReleaseCache, ShowCache } from '../lib/types'

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

/** Airing data for an AniList anime / manga; refreshed in the background if stale. */
export function useRelease(item: Item | undefined): ReleaseCache | null {
  const key = item ? releaseKey(item) : null
  const cached = useLiveQuery(() => (key ? db.releases.get(key) : undefined), [key])

  useEffect(() => {
    // only when the medium changes — refreshReleasesFor checks freshness itself
    if (item && key) void refreshReleasesFor(item)
  }, [key])

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
