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
  /** freestanding title-treatment logo (transparent PNG) */
  logo_url?: string
  tagline?: string
  /** dominant colour sampled from the poster, "#rrggbb" */
  accent?: string
}

/** One episode, cached from TMDB (never synced). */
export interface EpisodeMeta {
  season: number
  number: number
  name: string
  overview: string
  airDate: string | null
  runtime: number | null
  still: string | null
}

/** Per-show TMDB cache: detail + all episodes. Keyed by numeric TMDB tv id. */
export interface ShowCache {
  tmdbId: number
  status: string | null
  /** "Returning Series" shows get refreshed more often */
  inProduction: boolean
  backdrop: string | null
  logo: string | null
  tagline: string | null
  nextAir: { season: number; number: number; name: string; airDate: string | null } | null
  episodes: EpisodeMeta[]
  fetchedAt: string
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
  /** failed push attempts; quarantined after a few */
  attempts?: number
  last_error?: string
  /** server kept rejecting this row — skipped until the user retries */
  quarantined?: boolean
}

/** A normalized search result from any metadata provider */
export interface SearchResult {
  source: MetaSource
  source_id: string
  kind: MediaKind
  title: string
  /** untranslated title, when the provider returns a localized one */
  original_title?: string
  year: number | null
  poster_url: string | null
  overview: string | null
}
