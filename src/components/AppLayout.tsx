import { NavLink, Outlet } from 'react-router-dom'
import { APP_TITLE, ROUTES } from '../lib/constants'

const navItems = [
  { to: ROUTES.dashboard, label: 'Dashboard' },
  { to: ROUTES.runs, label: 'RUN LOG' },
  { to: ROUTES.manual, label: 'MANUAL ENTRY' },
  { to: ROUTES.snapshot, label: 'SNAPSHOT' },
  { to: ROUTES.data, label: 'DATA EXPLORER' },
  { to: ROUTES.ingestion, label: 'Ingestion' },
  { to: ROUTES.alerts, label: 'Alerts' },
  { to: ROUTES.sources, label: 'Sources' },
  { to: ROUTES.settings, label: 'Settings' },
] as const

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <header className="border-b border-border px-5 py-6">
          <p className="font-mono text-xs uppercase tracking-widest text-gold">
            Pipeline
          </p>
          <h1 className="mt-2 text-sm font-semibold leading-snug text-foreground">
            {APP_TITLE}
          </h1>
        </header>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.dashboard}
              className={({ isActive }) =>
                [
                  'border-l-2 py-2 pl-3 pr-3 font-mono text-xs uppercase tracking-wide transition-colors',
                  isActive
                    ? 'border-gold text-gold'
                    : 'border-transparent text-muted hover:bg-background/60 hover:text-foreground',
                ].join(' ')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
