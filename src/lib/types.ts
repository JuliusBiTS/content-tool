export type MediaKind = 'series' | 'movie' | 'anime' | 'book'

export type ItemStatus = 'watching' | 'done' | 'planned' | 'paused' | 'dropped'

export type MetaSource =
  | 'tmdb'
  | 'anilist'
  | 'openlibrary'
  | 'googlebooks'
  | 'manual'

/** A season/volume entry stored in item.metadata.seasons */
export interface SeasonMeta {
  /** season number (1-based). 0 = specials */
  number: number
  name: string
  episodeCount: number
}

export interface ItemMetadata {
  seasons?: SeasonMeta[]
  /** total across all seasons, for series/anime */
  overview?: string
  year?: number
  runtimeMinutes?: number
  /** anime: prefer absolute episode counting in the UI */
  absoluteNumbering?: boolean
}

export interface Item {
  id: string
  user_id: string
  kind: MediaKind
  title: string
  sort_title: string
  poster_url: string | null
  backdrop_url: string | null
  source: MetaSource
  source_id: string | null
  status: ItemStatus
  /** half-star units, 1..10 (→ 0.5..5.0 stars); null = unrated */
  rating: number | null
  /** episodes watched (series/anime), minutes (movie), pages (book) */
  current_position: number
  /** total episodes / total minutes / total pages */
  total_units: number | null
  metadata: ItemMetadata
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type EventKind = 'progress' | 'status' | 'rating' | 'add'

export interface ProgressEvent {
  id: string
  user_id: string
  item_id: string
  kind: EventKind
  from_position: number | null
  to_position: number | null
  note: string | null
  occurred_at: string
  created_at: string
}

/** Local-only outbox row for offline-first writes */
export interface OutboxOp {
  id: string
  table: 'items' | 'events'
  op: 'insert' | 'update'
  row_id: string
  payload: Record<string, unknown>
  created_at: string
}

/** A normalized search result from any metadata provider */
export interface SearchResult {
  source: MetaSource
  source_id: string
  kind: MediaKind
  title: string
  year: number | null
  poster_url: string | null
  overview: string | null
}
