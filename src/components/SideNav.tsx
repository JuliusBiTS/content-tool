import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { SyncPill } from './SyncPill'
import { useUnseenAired } from '../hooks/useAiring'

const links = [
  { to: '/', label: 'Weiterschauen', icon: '▶' },
  { to: '/upcoming', label: 'Diese Woche', icon: '📅' },
  { to: '/discover', label: 'Entdecken', icon: '✦' },
  { to: '/library', label: 'Bibliothek', icon: '▦' },
  { to: '/stats', label: 'Statistik', icon: '◔' },
  { to: '/profile', label: 'Profil', icon: '☰' },
]

export function SideNav({ onAdd }: { onAdd: () => void }) {
  const unseen = useUnseenAired()
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border px-4 py-6 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm text-white">
          ▶
        </span>
        <span className="font-display text-lg font-bold">MediaLog</span>
      </div>

      <button
        onClick={onAdd}
        className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 font-semibold text-white active:scale-[0.98]"
      >
        <span className="text-lg leading-none">+</span> Hinzufügen
      </button>

      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                isActive
                  ? 'bg-accent-soft font-medium text-text'
                  : 'text-muted hover:bg-surface',
              )
            }
          >
            <span className="w-4 text-center">{l.icon}</span>
            <span className="flex-1">{l.label}</span>
            {l.to === '/upcoming' && unseen > 0 && (
              <span className="min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-5 text-white">
                {unseen > 9 ? '9+' : unseen}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-3">
        <SyncPill />
      </div>
    </aside>
  )
}
