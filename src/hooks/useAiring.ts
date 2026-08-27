import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { unseenAiredCount, upcomingEntries } from '../lib/airing'
import type { AiringEntry } from '../lib/shows'

/** Count of aired-but-unwatched episodes since the user last opened "Diese Woche". */
export function useUnseenAired(): number {
  const [n, setN] = useState(0)
  // recompute when items or the show cache change
  const tick = useLiveQuery(async () => {
    const [a, b] = await Promise.all([db.items.count(), db.shows.count()])
    return `${a}:${b}`
  })

  useEffect(() => {
    let alive = true
    unseenAiredCount().then((c) => alive && setN(c))
    return () => {
      alive = false
    }
  }, [tick])

  return n
}

export function useUpcoming(): AiringEntry[] | null {
  const [rows, setRows] = useState<AiringEntry[] | null>(null)
  const tick = useLiveQuery(() => db.shows.count())
  useEffect(() => {
    let alive = true
    upcomingEntries().then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [tick])
  return rows
}
