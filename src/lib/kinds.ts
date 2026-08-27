import type { MediaKind } from './types'

export const KIND_EMOJI: Record<MediaKind, string> = {
  series: '📺',
  movie: '🎬',
  anime: '🌸',
  book: '📖',
  manga: '📚',
}

export const KIND_LABEL: Record<MediaKind, string> = {
  series: 'Serie',
  movie: 'Film',
  anime: 'Anime',
  book: 'Buch',
  manga: 'Manga',
}

export const KIND_LABEL_PLURAL: Record<MediaKind, string> = {
  series: 'Serien',
  movie: 'Filme',
  anime: 'Anime',
  book: 'Bücher',
  manga: 'Manga',
}

export const ALL_KINDS: MediaKind[] = ['series', 'movie', 'anime', 'manga', 'book']
