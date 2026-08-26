import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

const items = [
  { to: '/', label: 'Weiter', icon: '▶' },
  { to: '/library', label: 'Bibliothek', icon: '▦' },
  { to: '/stats', label: 'Statistik', icon: '◔' },
  { to: '/profile', label: 'Profil', icon: '☰' },
]

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 items-center px-2">
        {items.slice(0, 2).map((it) => (
          <Tab key={it.to} {...it} />
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

        {items.slice(2).map((it) => (
          <Tab key={it.to} {...it} />
        ))}
      </div>
    </nav>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex flex-col items-center gap-0.5 py-2 text-[11px]',
          isActive ? 'text-accent' : 'text-muted',
        )
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </NavLink>
  )
}
