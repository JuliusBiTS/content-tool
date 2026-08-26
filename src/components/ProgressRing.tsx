interface Props {
  /** 0..1, or null for unknown */
  value: number | null
  size?: number
  stroke?: number
  children?: React.ReactNode
}

export function ProgressRing({ value, size = 44, stroke = 4, children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.35s ease' }}
          />
        )}
      </svg>
      <div className="absolute text-[11px] font-semibold tabular-nums">{children}</div>
    </div>
  )
}
