import { Link } from 'react-router-dom'
import { ContinueCard } from '../components/ContinueCard'
import { Poster } from '../components/Poster'
import { SyncPill } from '../components/SyncPill'
import { useContinueWatching, useUpNext } from '../hooks/useData'

export function Home({ onAdd }: { onAdd: () => void }) {
  const watching = useContinueWatching()
  const upNext = useUpNext()

  const loading = watching === undefined
  const empty = !loading && watching.length === 0 && (upNext?.length ?? 0) === 0

  return (
    <div className="px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <header className="mb-5 flex items-center justify-between lg:mb-7">
        <h1 className="text-xl font-bold lg:text-2xl">Weiterschauen</h1>
        <div className="lg:hidden">
          <SyncPill />
        </div>
      </header>

      {loading && <SkeletonList />}

      {empty && (
        <div className="mt-16 text-center lg:mt-24">
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

      {!loading && watching.length > 0 && (
        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {watching.map((item) => (
            <ContinueCard key={item.id} item={item} />
          ))}
        </section>
      )}

      {upNext && upNext.length > 0 && (
        <section className="mt-8 lg:mt-12">
          <h2 className="mb-3 text-sm font-semibold text-muted">Als Nächstes</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {upNext.map((item) => (
              <Link
                key={item.id}
                to={`/item/${item.id}`}
                className="w-24 shrink-0 lg:w-28"
              >
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

function SkeletonList() {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-card bg-surface" />
      ))}
    </div>
  )
}
