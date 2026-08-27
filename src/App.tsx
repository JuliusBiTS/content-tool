import { useEffect, useState } from 'react'
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
import { ToastProvider } from './components/Toast'
import { BottomNav } from './components/BottomNav'
import { SideNav } from './components/SideNav'
import { AddSheet } from './components/AddSheet'
import { InstallHint } from './components/InstallHint'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Stats } from './pages/Stats'
import { Profile } from './pages/Profile'
import { ItemDetail } from './pages/ItemDetail'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'

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

  // Web Share Target: /add?title=…&text=…  → open the add sheet prefilled
  useEffect(() => {
    if (location.pathname !== '/add') return
    const q = params.get('title') || params.get('text') || params.get('url') || ''
    setAddPrefill(q)
    setAddOpen(true)
    navigate('/', { replace: true })
  }, [location.pathname, params, navigate])

  if (!ready) {
    return <div className="grid min-h-dvh place-items-center text-muted">…</div>
  }

  // A recovery link creates a session, so this must be checked before the
  // normal authed routing takes over.
  if (passwordRecovery || location.pathname === '/reset') {
    return <ResetPassword />
  }

  if (hasSupabaseConfig && !userId) {
    return <Login />
  }

  const fullBleed = location.pathname.startsWith('/item/')
  const openAdd = () => {
    setAddPrefill('')
    setAddOpen(true)
  }

  return (
    <div className="min-h-dvh lg:flex">
      <SideNav onAdd={openAdd} />

      <main className="min-w-0 flex-1">
        <div className={fullBleed ? '' : 'mx-auto w-full max-w-5xl'}>
          <Routes>
            <Route path="/" element={<Home onAdd={openAdd} />} />
            <Route path="/library" element={<Library />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/item/:id" element={<ItemDetail />} />
            <Route path="*" element={<Home onAdd={openAdd} />} />
          </Routes>
        </div>
      </main>

      {!fullBleed && <BottomNav onAdd={openAdd} />}
      <AddSheet
        open={addOpen}
        prefill={addPrefill}
        onClose={() => setAddOpen(false)}
      />
      <InstallHint />
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
