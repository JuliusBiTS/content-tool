import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * A cinematic backdrop stage: the image bleeds behind `children` and fades
 * into the page background. Falls back to a tinted gradient when no backdrop.
 */
export function Stage({
  backdrop,
  accent,
  className,
  children,
  minH = '18rem',
}: {
  backdrop?: string | null
  accent?: string | null
  className?: string
  children: ReactNode
  minH?: string
}) {
  return (
    <div
      className={clsx('stage scene-glow flex flex-col justify-end', className)}
      style={
        {
          minHeight: minH,
          ...(accent ? { ['--scene-accent' as string]: accent } : {}),
        } as React.CSSProperties
      }
    >
      <div className="stage-bg" aria-hidden>
        {backdrop ? (
          <img src={backdrop} alt="" loading="eager" decoding="async" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: accent
                ? `radial-gradient(120% 90% at 50% -10%, ${accent}, transparent 60%)`
                : 'linear-gradient(180deg,var(--color-surface-2),var(--color-bg))',
            }}
          />
        )}
      </div>
      {children}
    </div>
  )
}
