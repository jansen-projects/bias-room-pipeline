import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ROUTES } from './lib/constants'
import Alerts from './pages/Alerts'
import Dashboard from './pages/Dashboard'
import DataExplorer from './pages/DataExplorer'
import RunLog from './pages/RunLog'
import ManualEntry from './pages/ManualEntry'
import Snapshot from './pages/Snapshot'
import Ingestion from './pages/Ingestion'
import Settings from './pages/Settings'
import Sources from './pages/Sources'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
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
          <Route path="/snapshot" element={<Snapshot />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
