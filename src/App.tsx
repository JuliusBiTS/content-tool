import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { hasSupabaseConfig } from './lib/supabase'
import { runSync, startRealtime } from './lib/sync'
import { refreshAiringCache } from './lib/airing'
import { ToastProvider } from './components/Toast'
import { BottomNav } from './components/BottomNav'
import { SideNav } from './components/SideNav'
import { AddSheet } from './components/AddSheet'
import { InstallHint } from './components/InstallHint'
import { Onboarding } from './components/Onboarding'
import { Home } from './pages/Home'
import { Login } from './pages/Login'

const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })))
const Upcoming = lazy(() => import('./pages/Upcoming').then((m) => ({ default: m.Upcoming })))
const Discover = lazy(() => import('./pages/Discover').then((m) => ({ default: m.Discover })))
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })))
const Review = lazy(() => import('./pages/Review').then((m) => ({ default: m.Review })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const ItemDetail = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.ItemDetail })))
const NowPlaying = lazy(() => import('./pages/NowPlaying').then((m) => ({ default: m.NowPlaying })))
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })),
)

const Loading = () => (
  <div className="grid min-h-[40vh] place-items-center text-muted">…</div>
)

function Shell() {
  const { ready, userId, localOnly, passwordRecovery } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const [addPrefill, setAddPrefill] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  useEffect(() => {
    if (userId && !localOnly) void runSync()
  }, [userId, localOnly])

  useEffect(() => {
    if (!userId || localOnly) return
    const stop = startRealtime()
    const t = setInterval(() => void runSync(), 60_000)
    const onVis = () => document.visibilityState === 'visible' && void runSync()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [userId, localOnly])

  useEffect(() => {
    if (!userId) return
    void refreshAiringCache()
    const t = setInterval(() => void refreshAiringCache(), 6 * 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [userId])

  // Web Share Target: /add?title=…  → open the add sheet prefilled
  useEffect(() => {
    if (location.pathname !== '/add') return
    const q = params.get('title') || params.get('text') || params.get('url') || ''
    setAddPrefill(q)
    setAddOpen(true)
    navigate('/', { replace: true })
  }, [location.pathname, params, navigate])

  // App shortcut: /quicklog → jump to the top continue-watching item
  useEffect(() => {
    if (location.pathname !== '/quicklog') return
    void import('./lib/db').then(async ({ db }) => {
      const list = await db.items.where('status').equals('watching').toArray()
      const top = list
        .filter((i) => !i.deleted_at)
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]
      navigate(top ? `/item/${top.id}` : '/', { replace: true })
    })
  }, [location.pathname, navigate])

  if (!ready) return <Loading />

  if (passwordRecovery || location.pathname === '/reset') {
    return (
      <Suspense fallback={<Loading />}>
        <ResetPassword />
      </Suspense>
    )
  }

  if (hasSupabaseConfig && !userId) return <Login />

  const fullBleed =
    location.pathname.startsWith('/item/') || location.pathname.startsWith('/watch/')
  const openAdd = () => {
    setAddPrefill('')
    setAddOpen(true)
  }

  return (
    <div className="grain min-h-dvh lg:flex">
      <SideNav onAdd={openAdd} />

      <main className="min-w-0 flex-1">
        <div className={fullBleed ? '' : 'mx-auto w-full max-w-5xl'}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home onAdd={openAdd} />} />
              <Route path="/library" element={<Library />} />
              <Route path="/upcoming" element={<Upcoming />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/review" element={<Review />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/item/:id" element={<ItemDetail />} />
              <Route path="/watch/:id" element={<NowPlaying />} />
              <Route path="*" element={<Home onAdd={openAdd} />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      {!fullBleed && <BottomNav onAdd={openAdd} />}
      <AddSheet open={addOpen} prefill={addPrefill} onClose={() => setAddOpen(false)} />
      <InstallHint />
      <Onboarding />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
