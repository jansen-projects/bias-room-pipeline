import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { useAuth } from './hooks/useAuth'
import { ROUTES } from './lib/constants'
import Alerts from './pages/Alerts'
import Dashboard from './pages/Dashboard'
import DataExplorer from './pages/DataExplorer'
import Ingestion from './pages/Ingestion'
import Login from './pages/Login'
import ManualEntry from './pages/ManualEntry'
import RunLog from './pages/RunLog'
import Settings from './pages/Settings'
import Snapshot from './pages/Snapshot'
import Sources from './pages/Sources'

const queryClient = new QueryClient()

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path={ROUTES.runs} element={<RunLog />} />
            <Route path={ROUTES.manual} element={<ManualEntry />} />
            <Route path={ROUTES.snapshot} element={<Snapshot />} />
            <Route path={ROUTES.data} element={<DataExplorer />} />
            <Route path={ROUTES.ingestion} element={<Ingestion />} />
            <Route path={ROUTES.alerts} element={<Alerts />} />
            <Route path={ROUTES.sources} element={<Sources />} />
            <Route path={ROUTES.settings} element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
