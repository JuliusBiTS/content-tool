import type { Item, SeasonMeta } from './types'

export const EPISODIC: Item['kind'][] = ['series', 'anime']

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
      if (item.status === 'done') return 'Gesehen'
      if (!item.total_units) return pos > 0 ? 'Angesehen' : 'Nicht gestartet'
      return `${Math.round((pos / item.total_units) * 100)}%`
    }
    case 'book': {
      if (!item.total_units) return `Seite ${pos}`
      return `S. ${pos} / ${item.total_units}`
    }
    case 'manga': {
      if (pos <= 0) return 'Noch nicht gestartet'
      return item.total_units ? `Kap. ${pos} / ${item.total_units}` : `Kapitel ${pos}`
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
  const next = item.current_position + 1
  switch (item.kind) {
    case 'movie':
      return item.current_position > 0 ? 'Erneut ansehen' : 'Als gesehen markieren'
    case 'book':
      return '+10 Seiten'
    case 'manga':
      return `Kapitel ${next}`
    default: {
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

function totalUnits(item: Item): number | null {
  return EPISODIC.includes(item.kind) ? totalEpisodes(item) : item.total_units
}

export function progressFraction(item: Item): number | null {
  const total = totalUnits(item)
  if (!total || total <= 0) return null
  return Math.max(0, Math.min(1, item.current_position / total))
}

export function isComplete(item: Item, nextPos: number): boolean {
  const total = totalUnits(item)
  if (!total) return false
  return nextPos >= total
}

/** Unit noun for the current kind, for labels. */
export function unitNoun(kind: Item['kind'], plural = false): string {
  switch (kind) {
    case 'movie':
      return plural ? 'Filme' : 'Film'
    case 'book':
      return plural ? 'Seiten' : 'Seite'
    case 'manga':
      return plural ? 'Kapitel' : 'Kapitel'
    default:
      return plural ? 'Folgen' : 'Folge'
  }
}
