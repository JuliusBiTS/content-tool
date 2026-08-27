import { Link } from 'react-router-dom'
import { ContinueCard } from '../components/ContinueCard'
import { HomeHero } from '../components/HomeHero'
import { Poster } from '../components/Poster'
import { SyncPill } from '../components/SyncPill'
import { useContinueWatching, useUpNext } from '../hooks/useData'
import { useUpcoming } from '../hooks/useAiring'

export function Home({ onAdd }: { onAdd: () => void }) {
  const watching = useContinueWatching()
  const upNext = useUpNext()
  const airing = useUpcoming()

  const loading = watching === undefined
  const empty = !loading && watching.length === 0 && (upNext?.length ?? 0) === 0

  const [hero, ...rest] = watching ?? []
  const newThisWeek = (airing ?? []).filter(
    (e) => !e.watched && Date.parse(e.airDate) <= Date.now(),
  ).length

  return (
    <div className="pb-28 lg:pb-10">
      <header className="flex items-center justify-between px-4 pb-3 pt-4 lg:px-8 lg:pt-8">
        <h1 className="font-display text-xl font-bold lg:text-2xl">Weiterschauen</h1>
        <div className="flex items-center gap-3">
          <Link to="/stats" className="text-lg text-muted lg:hidden" aria-label="Statistik">
            ◔
          </Link>
          <div className="lg:hidden">
            <SyncPill />
          </div>
        </div>
      </header>

      {loading && (
        <div className="space-y-3 px-4 lg:px-8">
          <div className="h-64 animate-pulse rounded-card bg-surface" />
          <div className="h-32 animate-pulse rounded-card bg-surface" />
        </div>
      )}

      {empty && (
        <div className="mt-16 px-4 text-center lg:mt-24">
          <div className="text-4xl">🍿</div>
          <p className="mt-3 font-medium">Noch nichts hier.</p>
          <p className="mt-1 text-sm text-muted">
            Füge eine Serie, einen Film oder ein Buch hinzu.
          </p>
          <button
            onClick={onAdd}
            className="mt-4 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white"
          >
            + Hinzufügen
          </button>
        </div>
      )}

      {hero && (
        <div className="px-4 lg:px-8">
          <HomeHero item={hero} />
        </div>
      )}

      {newThisWeek > 0 && (
        <Link
          to="/upcoming"
          className="mx-4 mt-4 flex items-center justify-between rounded-card border border-[var(--color-accent)]/40 bg-accent-soft/50 px-4 py-3 text-sm lg:mx-8"
        >
          <span>
            <b>{newThisWeek}</b> neue {newThisWeek === 1 ? 'Folge' : 'Folgen'} diese Woche
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}

      {rest.length > 0 && (
        <section className="mt-6 grid gap-3 px-4 lg:grid-cols-2 lg:px-8 xl:grid-cols-3">
          {rest.map((item) => (
            <ContinueCard key={item.id} item={item} />
          ))}
        </section>
      )}

      {upNext && upNext.length > 0 && (
        <section className="mt-8 px-4 lg:mt-12 lg:px-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">Als Nächstes</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {upNext.map((item) => (
              <Link key={item.id} to={`/item/${item.id}`} viewTransition className="w-24 shrink-0 lg:w-28">
                <Poster
                  url={item.poster_url}
                  title={item.title}
                  kind={item.kind}
                  className="h-36 w-24 lg:h-[10.5rem] lg:w-28"
                />
                <p className="mt-1 line-clamp-2 text-xs text-muted">{item.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
