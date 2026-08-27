import { useState } from 'react'
import clsx from 'clsx'

/** Show the TMDB title-treatment logo, falling back to display type. */
export function TitleTreatment({
  logo,
  title,
  className,
  maxH = '5rem',
}: {
  logo?: string | null
  title: string
  className?: string
  maxH?: string
}) {
  const [broken, setBroken] = useState(false)

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt={title}
        onError={() => setBroken(true)}
        className={clsx('w-auto max-w-[80%] object-contain object-left drop-shadow-lg', className)}
        style={{ maxHeight: maxH }}
      />
    )
  }
  return (
    <h1
      className={clsx(
        'font-display text-2xl font-bold leading-[1.05] drop-shadow-md sm:text-3xl',
        className,
      )}
    >
      {title}
    </h1>
  )
}
