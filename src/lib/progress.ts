import type { Item, SeasonMeta } from './types'

/** Real seasons (excludes specials / season 0), sorted. */
export function realSeasons(item: Item): SeasonMeta[] {
  return (item.metadata.seasons ?? [])
    .filter((s) => s.number > 0 && s.episodeCount > 0)
    .sort((a, b) => a.number - b.number)
}

export function totalEpisodes(item: Item): number | null {
  const seasons = realSeasons(item)
  if (seasons.length) return seasons.reduce((n, s) => n + s.episodeCount, 0)
  return item.total_units
}

/** Convert an absolute episode index (1-based) to { season, episode }. */
export function absoluteToSeasonEpisode(
  item: Item,
  absolute: number,
): { season: number; episode: number } | null {
  const seasons = realSeasons(item)
  if (!seasons.length) return null
  let remaining = absolute
  for (const s of seasons) {
    if (remaining <= s.episodeCount) return { season: s.number, episode: remaining }
    remaining -= s.episodeCount
  }
  const last = seasons[seasons.length - 1]
  return { season: last.number, episode: last.episodeCount }
}

/** Human label for where the user currently is. */
export function positionLabel(item: Item): string {
  const pos = item.current_position
  switch (item.kind) {
    case 'movie': {
      if (!item.total_units) return pos > 0 ? 'Angesehen' : 'Nicht gestartet'
      const pct = Math.round((pos / item.total_units) * 100)
      return `${pct}%`
    }
    case 'book': {
      if (!item.total_units) return `Seite ${pos}`
      return `S. ${pos} / ${item.total_units}`
    }
    default: {
      if (pos <= 0) return 'Noch nicht gestartet'
      if (item.metadata.absoluteNumbering) {
        const t = totalEpisodes(item)
        return t ? `Folge ${pos} / ${t}` : `Folge ${pos}`
      }
      const se = absoluteToSeasonEpisode(item, pos)
      if (se) return `S${se.season} E${se.episode}`
      return `Folge ${pos}`
    }
  }
}

/** Label for the primary "+1" button. */
export function nextActionLabel(item: Item): string {
  switch (item.kind) {
    case 'movie':
      return item.current_position > 0 ? 'Erneut ansehen' : 'Als gesehen markieren'
    case 'book':
      return '+10 Seiten'
    default: {
      const next = item.current_position + 1
      if (item.metadata.absoluteNumbering) return `Folge ${next}`
      const se = absoluteToSeasonEpisode(item, next)
      return se ? `S${se.season} E${se.episode}` : `Folge ${next}`
    }
  }
}

/** How much a single "+1" tap advances the position. */
export function stepSize(item: Item): number {
  if (item.kind === 'book') return 10
  if (item.kind === 'movie') return item.total_units ?? 1
  return 1
}

export function progressFraction(item: Item): number | null {
  const total =
    item.kind === 'series' || item.kind === 'anime' ? totalEpisodes(item) : item.total_units
  if (!total || total <= 0) return null
  return Math.max(0, Math.min(1, item.current_position / total))
}

export function isComplete(item: Item, nextPos: number): boolean {
  const total =
    item.kind === 'series' || item.kind === 'anime' ? totalEpisodes(item) : item.total_units
  if (!total) return false
  return nextPos >= total
}
