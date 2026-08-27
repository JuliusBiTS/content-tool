import { useState } from 'react'
import clsx from 'clsx'
import { KIND_EMOJI } from '../lib/kinds'
import type { MediaKind } from '../lib/types'

interface Props {
  url: string | null
  title: string
  kind: MediaKind
  /** dominant colour for the loading placeholder */
  accent?: string | null
  className?: string
}

export function Poster({ url, title, kind, accent, className }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className={clsx('relative shrink-0 overflow-hidden rounded-lg bg-surface-2', className)}
      style={
        accent && !loaded
          ? { background: `linear-gradient(160deg, ${accent}, var(--color-surface-2))` }
          : undefined
      }
    >
      {url ? (
        <img
          src={url}
          alt={title}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={clsx(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
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
