import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { hasSupabaseConfig } from './lib/supabase'
import { runSync } from './lib/sync'
import { BottomNav } from './components/BottomNav'
import { AddSheet } from './components/AddSheet'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Stats } from './pages/Stats'
import { Profile } from './pages/Profile'
import { ItemDetail } from './pages/ItemDetail'
import { Login } from './pages/Login'

function Shell() {
  const { ready, userId, localOnly } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (userId && !localOnly) void runSync()
  }, [userId, localOnly])

  // periodic background sync while app is open
  useEffect(() => {
    if (localOnly) return
    const t = setInterval(() => void runSync(), 60_000)
    const onVis = () => document.visibilityState === 'visible' && void runSync()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [localOnly])

  if (!ready) {
    return <div className="grid min-h-full place-items-center text-muted">…</div>
  }

  if (hasSupabaseConfig && !userId) {
    return <Login />
  }

  const hideNav = location.pathname.startsWith('/item/')

  return (
    <div className="mx-auto min-h-full max-w-lg">
      <Routes>
        <Route path="/" element={<Home onAdd={() => setAddOpen(true)} />} />
        <Route path="/library" element={<Library />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="*" element={<Home onAdd={() => setAddOpen(true)} />} />
      </Routes>

      {!hideNav && <BottomNav onAdd={() => setAddOpen(true)} />}
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  )
}
