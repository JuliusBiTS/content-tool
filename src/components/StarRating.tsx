interface Props {
  value: number | null
  onChange: (v: number | null) => void
  /** out of how many stars */
  max?: number
}

export function StarRating({ value, onChange, max = 5 }: Props) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`${n} Sterne`}
          className="text-2xl leading-none"
        >
          <span className={n <= (value ?? 0) ? 'text-accent' : 'text-border'}>★</span>
        </button>
      ))}
    </div>
  )
}
