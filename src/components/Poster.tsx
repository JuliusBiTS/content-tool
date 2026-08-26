import clsx from 'clsx'
import type { MediaKind } from '../lib/types'

const KIND_EMOJI: Record<MediaKind, string> = {
  series: '📺',
  movie: '🎬',
  anime: '🌸',
  book: '📖',
}

interface Props {
  url: string | null
  title: string
  kind: MediaKind
  className?: string
}

export function Poster({ url, title, kind, className }: Props) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-lg bg-surface-2 shrink-0',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-2xl opacity-60">
          {KIND_EMOJI[kind]}
        </div>
      )}
    </div>
  )
}

export { KIND_EMOJI }
