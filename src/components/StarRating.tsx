interface Props {
  /** rating in half-star units: 1..10 (or null for unrated) */
  value: number | null
  onChange: (v: number | null) => void
  /** number of stars (max = 2 * this) */
  stars?: number
  size?: 'sm' | 'md'
}

export function StarRating({ value, onChange, stars = 5, size = 'md' }: Props) {
  const v = value ?? 0
  const cls = size === 'sm' ? 'text-lg' : 'text-2xl'

  const pick = (half: number) => onChange(value === half ? null : half)

  return (
    <div className="flex items-center gap-2">
      <div className={`flex gap-1 ${cls} leading-none`}>
        {Array.from({ length: stars }, (_, i) => {
          const n = i + 1
          const fill = Math.max(0, Math.min(1, v / 2 - (n - 1)))
          return (
            <span key={n} className="relative inline-block h-[1em] w-[1em]">
              <span className="absolute inset-0 text-border">★</span>
              <span
                className="absolute inset-0 overflow-hidden text-accent"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </span>
              <button
                type="button"
                aria-label={`${n - 0.5} Sterne`}
                onClick={() => pick(2 * n - 1)}
                className="absolute inset-y-0 left-0 w-1/2"
              />
              <button
                type="button"
                aria-label={`${n} Sterne`}
                onClick={() => pick(2 * n)}
                className="absolute inset-y-0 right-0 w-1/2"
              />
            </span>
          )
        })}
      </div>
      {value != null && (
        <span className="text-xs tabular-nums text-muted">{(value / 2).toFixed(1)}</span>
      )}
    </div>
  )
}
