import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useUnseenAired } from '../hooks/useAiring'

const left = [
  { to: '/', label: 'Weiter', icon: '▶' },
  { to: '/upcoming', label: 'Diese Woche', icon: '📅' },
]
const right = [
  { to: '/library', label: 'Bibliothek', icon: '▦' },
  { to: '/profile', label: 'Profil', icon: '☰' },
]

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const unseen = useUnseenAired()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 items-center px-2">
        {left.map((it) => (
          <Tab key={it.to} {...it} badge={it.to === '/upcoming' ? unseen : 0} />
        ))}

        <div className="flex justify-center">
          <button
            onClick={onAdd}
            aria-label="Hinzufügen"
            className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg shadow-accent/30 active:scale-95"
          >
            +
          </button>
        </div>

        {right.map((it) => (
          <Tab key={it.to} {...it} />
        ))}
      </div>
    </nav>
  )
}

function Tab({
  to,
  label,
  icon,
  badge = 0,
}: {
  to: string
  label: string
  icon: string
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx(
          'relative flex flex-col items-center gap-0.5 py-2 text-[11px]',
          isActive ? 'text-accent' : 'text-muted',
        )
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
      {badge > 0 && (
        <span className="absolute right-2 top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )
}
