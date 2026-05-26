import { useEffect, useState, type ReactNode } from 'react'
import { useSnapshot, useSnapshotDates } from '../hooks/useSnapshot'
import {
  asCurrencyArray,
  formatCountdown,
  formatNumber,
  formatPercent,
  formatReturnPct,
  formatSnapshotDateLabel,
  getDqsFlagEntries,
  isStaleAsOf,
  nextFridaySnapshotUtc,
  normalizeIndices,
} from '../lib/snapshotFormat'
import type {
  BondYieldRow,
  CbRateRow,
  CbToneRow,
  ConsensusRow,
  CotRow,
  DataQualityFlags,
  FxCloseRow,
  GeoFlagRow,
  SnapshotPayload,
} from '../types/snapshot'

const fieldClassName =
  'rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors focus:border-gold'

const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'XAU'] as const

const INDEX_ORDER = ['VIX', 'DXY', 'SPX', 'STOXX50', 'GDX'] as const

// ——— Shared UI ———

function MissingBadge() {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-error ring-1 ring-error/40">
      MISSING
    </span>
  )
}

function isMissing(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isNaN(value))
}

function SectionCard({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border-dim px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-gold">
          {title}
        </h2>
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
      {footer ? (
        <footer className="border-t border-border-dim px-4 py-2">{footer}</footer>
      ) : null}
    </section>
  )
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto">{children}</div>
}

function Th({
  children,
  align = 'left',
}: {
  children?: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={[
        'pb-2 font-mono text-[10px] font-normal uppercase tracking-wide text-dim',
        align === 'right' ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={[
        'py-2 font-mono text-xs text-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  )
}

function ValueOrMissing({
  value,
  format,
}: {
  value: unknown
  format?: (v: number) => string
}) {
  if (isMissing(value)) {
    return <MissingBadge />
  }

  if (format && typeof value === 'number') {
    return <>{format(value)}</>
  }

  if (typeof value === 'string') {
    return <>{value}</>
  }

  if (typeof value === 'number') {
    return <>{value.toLocaleString()}</>
  }

  return <>{String(value)}</>
}

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (isMissing(value)) {
    return <MissingBadge />
  }

  const positive = value! > 0
  const negative = value! < 0

  return (
    <span
      className={[
        'font-mono text-xs',
        positive ? 'text-success' : negative ? 'text-error' : 'text-muted',
      ].join(' ')}
    >
      {formatReturnPct(value)}
    </span>
  )
}

function FreshDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-success"
      title="Fresh — this Friday"
      aria-label="Fresh"
    />
  )
}

function StaleBadge() {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-error">
      STALE
    </span>
  )
}

function SeverityBadge({ severity }: { severity?: string | null }) {
  const level = (severity ?? 'medium').toLowerCase()
  const styles: Record<string, string> = {
    low: 'bg-success/20 text-success',
    medium: 'bg-warning/20 text-warning',
    high: 'bg-error/20 text-error',
    critical: 'bg-error text-background',
  }

  return (
    <span
      className={[
        'inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] uppercase',
        styles[level] ?? styles.medium,
      ].join(' ')}
    >
      {severity ?? 'medium'}
    </span>
  )
}

function DqsSeverityBadge({ severity }: { severity?: string }) {
  const level = (severity ?? 'warning').toLowerCase()
  const styles: Record<string, string> = {
    warning: 'border border-warning/40 bg-warning/20 text-warning',
    error: 'border border-error/40 bg-error/20 text-error',
    critical: 'border border-[#6b1212] bg-[#8b1a1a] text-white',
  }

  return (
    <span
      className={[
        'inline-flex shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
        styles[level] ?? styles.warning,
      ].join(' ')}
    >
      {severity ?? 'warning'}
    </span>
  )
}

function DqsPanel({ flags }: { flags: DataQualityFlags }) {
  const entries = getDqsFlagEntries(flags)

  if (entries.length === 0) {
    return null
  }

  return (
    <section
      className="rounded-lg border border-[rgba(224,92,92,0.25)] bg-[rgba(224,92,92,0.08)]"
      aria-labelledby="dqs-panel-heading"
    >
      <header className="border-b border-[rgba(224,92,92,0.2)] px-5 py-4">
        <h2
          id="dqs-panel-heading"
          className="font-mono text-sm font-semibold uppercase tracking-wide text-error"
        >
          Data Quality Deductions
        </h2>
        <p className="mt-1 font-mono text-xs text-muted">
          These missing sources will reduce the FSR confidence score for this week
        </p>
      </header>

      <ul className="divide-y divide-[rgba(224,92,92,0.15)]">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-foreground">
                  {entry.key}
                </span>
                <DqsSeverityBadge severity={entry.severity} />
              </div>
              <p className="text-sm text-muted">{entry.description}</p>
            </div>
            <p className="shrink-0 font-mono text-sm font-medium text-error sm:text-right">
              {entry.dqs_deduction != null ? `−${entry.dqs_deduction} pts` : '—'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ——— Page chrome ———

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function isDataQualityFlagsEmpty(flags: DataQualityFlags | undefined): boolean {
  if (!flags) return true
  if (Array.isArray(flags)) return flags.length === 0
  return Object.keys(flags).length === 0
}

function getFlagKeys(flags: DataQualityFlags | undefined): string[] {
  if (!flags) return []
  if (Array.isArray(flags)) {
    return flags.map(
      (entry, index) =>
        (entry && typeof entry === 'object' && (entry.source ?? entry.table)) ||
        `flag_${index}`,
    )
  }
  return Object.keys(flags)
}

function EmptyState() {
  const [countdown, setCountdown] = useState(() => {
    const target = nextFridaySnapshotUtc()
    return formatCountdown(target.getTime() - Date.now())
  })

  useEffect(() => {
    const tick = () => {
      const target = nextFridaySnapshotUtc()
      setCountdown(formatCountdown(target.getTime() - Date.now()))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-8 py-20 text-center">
      <ClockIcon className="h-12 w-12 text-gold" />
      <h2 className="mt-6 text-lg font-semibold text-foreground">No snapshots yet</h2>
      <p className="mt-3 max-w-md font-mono text-xs leading-relaxed text-muted">
        The Friday anchor snapshot runs at 23:45 UTC every Friday via
        wf_weekly_anchor_snapshot
      </p>
      <p className="mt-6 font-mono text-sm text-foreground">
        Next snapshot in <span className="text-gold">{countdown}</span>
      </p>
    </div>
  )
}

function PreflightBanner({ flags }: { flags: DataQualityFlags | undefined }) {
  const allPresent = isDataQualityFlagsEmpty(flags)
  const flagKeys = getFlagKeys(flags)

  return (
    <div
      role="status"
      className={[
        'rounded-lg border px-4 py-4',
        allPresent
          ? 'border-success/40 bg-success/10'
          : 'border-error/50 bg-error/15',
      ].join(' ')}
    >
      <p
        className={[
          'font-mono text-sm',
          allPresent ? 'text-success' : 'text-error',
        ].join(' ')}
      >
        {allPresent
          ? '✓ All sources present — snapshot ready for scoring'
          : `⚠ ${flagKeys.length} source${flagKeys.length === 1 ? '' : 's'} missing — DQS deductions will apply`}
      </p>
      {!allPresent && (
        <ul className="mt-3 space-y-1">
          {flagKeys.map((key) => (
            <li key={key} className="font-mono text-xs text-error">
              • {key}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ——— Data sections ———

function FxClosesCard({
  rows,
  snapshotDate,
}: {
  rows: FxCloseRow[] | undefined
  snapshotDate: string
}) {
  const byPair = new Map((rows ?? []).map((r) => [r.pair, r]))
  const pairs =
    rows && rows.length > 0
      ? rows.map((r) => r.pair)
      : ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'XAUUSD']

  return (
    <SectionCard title="FX Closes">
      <TableWrap>
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Pair</Th>
              <Th align="right">Close</Th>
              <Th align="right">1W</Th>
              <Th align="right">4W</Th>
              <Th align="right">12W</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => {
              const row = byPair.get(pair)
              const stale = !row || isStaleAsOf(row.as_of_date, snapshotDate)

              return (
                <tr key={pair} className="border-b border-border-dim/60">
                  <Td>{pair}</Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.friday_close} format={(v) => formatNumber(v, 4)} />
                  </Td>
                  <Td align="right">
                    <ReturnCell value={row?.['1w_return']} />
                  </Td>
                  <Td align="right">
                    <ReturnCell value={row?.['4w_return']} />
                  </Td>
                  <Td align="right">
                    <ReturnCell value={row?.['12w_return']} />
                  </Td>
                  <Td align="right">
                    {row ? stale ? <StaleBadge /> : <FreshDot /> : <StaleBadge />}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function CbRatesCard({ data }: { data: SnapshotPayload['cb_rates'] }) {
  const rows = asCurrencyArray<CbRateRow>(data)
  const byCurrency = new Map(rows.map((r) => [r.currency, r]))

  return (
    <SectionCard title="CB Rates">
      <TableWrap>
        <table className="w-full min-w-[360px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Currency</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Last Change</Th>
              <Th align="right">Next Meeting</Th>
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((currency) => {
              const row = byCurrency.get(currency)
              return (
                <tr key={currency} className="border-b border-border-dim/60">
                  <Td>{currency}</Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.rate_pct} format={(v) => formatPercent(v)} />
                  </Td>
                  <Td align="right">
                    {isMissing(row?.last_change_date) ? (
                      <MissingBadge />
                    ) : (
                      row!.last_change_date!.slice(0, 10)
                    )}
                  </Td>
                  <Td align="right">
                    {isMissing(row?.next_meeting_date) ? (
                      <MissingBadge />
                    ) : (
                      row!.next_meeting_date!.slice(0, 10)
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function CbToneCard({ data }: { data: SnapshotPayload['cb_tone'] }) {
  const rows = asCurrencyArray<CbToneRow>(data)
  const byCurrency = new Map(rows.map((r) => [r.currency, r]))

  return (
    <SectionCard title="CB Tone">
      <TableWrap>
        <table className="w-full min-w-[360px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Currency</Th>
              <Th align="right">Score</Th>
              <Th align="right">Label</Th>
              <Th align="right">Verified</Th>
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((currency) => {
              const row = byCurrency.get(currency)
              const verified = Boolean(row?.verified_at)

              return (
                <tr key={currency} className="border-b border-border-dim/60">
                  <Td>{currency}</Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.tone_score} format={(v) => formatNumber(v, 1)} />
                  </Td>
                  <Td align="right">
                    {isMissing(row?.tone_label) ? <MissingBadge /> : row!.tone_label}
                  </Td>
                  <Td align="right">
                    {verified ? (
                      <span className="text-dim">{row!.verified_at!.slice(0, 10)}</span>
                    ) : row ? (
                      <span
                        className="cursor-help font-mono text-[10px] text-warning"
                        title="Scoring engine will skip this row"
                      >
                        ⚠ Unverified
                      </span>
                    ) : (
                      <MissingBadge />
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function BondYieldsCard({ data }: { data: SnapshotPayload['bond_yields'] }) {
  const rows = asCurrencyArray<BondYieldRow>(data)
  const byCurrency = new Map(rows.map((r) => [r.currency, r]))

  return (
    <SectionCard title="Bond Yields">
      <TableWrap>
        <table className="w-full min-w-[360px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Currency</Th>
              <Th align="right">2Y</Th>
              <Th align="right">10Y</Th>
              <Th align="right">Real</Th>
              <Th align="right">Breakeven</Th>
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((currency) => {
              const row = byCurrency.get(currency)
              return (
                <tr key={currency} className="border-b border-border-dim/60">
                  <Td>{currency}</Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.yield_2y} format={(v) => formatPercent(v)} />
                  </Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.yield_10y} format={(v) => formatPercent(v)} />
                  </Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.real_yield} format={(v) => formatPercent(v)} />
                  </Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.breakeven} format={(v) => formatPercent(v)} />
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function CotCard({ data }: { data: SnapshotPayload['cot'] }) {
  const rows = asCurrencyArray<CotRow>(data)
  const byCurrency = new Map(rows.map((r) => [r.currency, r]))

  return (
    <SectionCard
      title="COT Positioning"
      footer={
        <p className="font-mono text-[10px] text-muted">
          COT data lags 3 days (CFTC release)
        </p>
      }
    >
      <TableWrap>
        <table className="w-full min-w-[360px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Currency</Th>
              <Th align="right">Net Position</Th>
              <Th align="right">% OI</Th>
              <Th align="right">Report Date</Th>
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((currency) => {
              const row = byCurrency.get(currency)
              const net = row?.net_position

              return (
                <tr key={currency} className="border-b border-border-dim/60">
                  <Td>{currency}</Td>
                  <Td align="right">
                    {isMissing(net) ? (
                      <MissingBadge />
                    ) : (
                      <span
                        className={
                          net! > 0 ? 'text-success' : net! < 0 ? 'text-error' : 'text-muted'
                        }
                      >
                        {net!.toLocaleString()}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <ValueOrMissing
                      value={row?.pct_of_open_interest}
                      format={(v) => formatPercent(v)}
                    />
                  </Td>
                  <Td align="right">
                    {isMissing(row?.report_date) ? (
                      <MissingBadge />
                    ) : (
                      row!.report_date!.slice(0, 10)
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function VolatilityCard({ data }: { data: SnapshotPayload['volatility'] }) {
  const rows = data ?? []
  const byPair = new Map(rows.map((r) => [r.pair, r]))
  const pairs = rows.length > 0 ? rows.map((r) => r.pair) : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']

  return (
    <SectionCard title="Volatility (ATR-14)">
      <TableWrap>
        <table className="w-full min-w-[400px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Pair</Th>
              <Th align="right">ATR</Th>
              <Th align="right">Warning (×0.5)</Th>
              <Th align="right">Critical (×1.2)</Th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => {
              const row = byPair.get(pair)
              const atr = row?.atr14
              const warning =
                row?.warning_threshold ?? (atr != null ? atr * 0.5 : null)
              const critical =
                row?.critical_threshold ?? (atr != null ? atr * 1.2 : null)
              const aboveCritical =
                atr != null && critical != null && atr > critical

              return (
                <tr
                  key={pair}
                  className={[
                    'border-b border-border-dim/60',
                    aboveCritical ? 'bg-error/10' : '',
                  ].join(' ')}
                >
                  <Td>{pair}</Td>
                  <Td align="right">
                    {isMissing(atr) ? (
                      <MissingBadge />
                    ) : (
                      <span className={aboveCritical ? 'font-bold text-error' : ''}>
                        {formatNumber(atr, 4)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <ValueOrMissing value={warning} format={(v) => formatNumber(v, 4)} />
                  </Td>
                  <Td align="right">
                    <ValueOrMissing value={critical} format={(v) => formatNumber(v, 4)} />
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function MarketIndicesCard({ data }: { data: SnapshotPayload['indices'] }) {
  const normalized = normalizeIndices(data)
  const bySymbol = new Map(normalized.map((r) => [r.symbol, r.value]))

  return (
    <SectionCard title="Market Indices">
      <TableWrap>
        <table className="w-full min-w-[280px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Name</Th>
              <Th align="right">Value</Th>
              <Th align="right">1D Change</Th>
            </tr>
          </thead>
          <tbody>
            {INDEX_ORDER.map((symbol) => {
              const row = bySymbol.get(symbol)
              const change = row?.change_1d
              const up = change != null && change > 0
              const down = change != null && change < 0

              return (
                <tr key={symbol} className="border-b border-border-dim/60">
                  <Td>{symbol}</Td>
                  <Td align="right">
                    <ValueOrMissing value={row?.value} format={(v) => formatNumber(v, 2)} />
                  </Td>
                  <Td align="right">
                    {isMissing(change) ? (
                      <MissingBadge />
                    ) : (
                      <span
                        className={[
                          'inline-flex items-center gap-0.5',
                          up ? 'text-success' : down ? 'text-error' : 'text-muted',
                        ].join(' ')}
                      >
                        {up ? '▲' : down ? '▼' : '—'} {formatReturnPct(change)}
                      </span>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function GeoRiskCard({ flags }: { flags: GeoFlagRow[] | undefined }) {
  const rows = flags ?? []

  return (
    <SectionCard title="Geo Risk Flags">
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-muted">No active geo risk flags</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((event, index) => (
            <li
              key={`${event.event_title}-${index}`}
              className="rounded-lg border border-border-dim bg-surface/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{event.event_title}</p>
                <SeverityBadge severity={event.severity} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(event.affected_currencies ?? []).map((ccy) => (
                  <span
                    key={ccy}
                    className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-foreground"
                  >
                    {ccy}
                  </span>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-success">
                ↑ {event.bullish_channel ?? '—'}
              </p>
              <p className="font-mono text-[10px] text-error">
                ↓ {event.bearish_channel ?? '—'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function consensusDirectionLabel(row: ConsensusRow | undefined): ReactNode {
  if (!row) {
    return <MissingBadge />
  }

  if (!row.uniform_consensus) {
    return <span className="text-dim">Mixed</span>
  }

  const direction = (row.consensus_direction ?? '').toLowerCase()

  if (direction === 'bullish') {
    return <span className="text-success">BULLISH ✓</span>
  }

  if (direction === 'bearish') {
    return <span className="text-error">BEARISH ✓</span>
  }

  return <span className="text-dim">Mixed</span>
}

function ConsensusCard({ data }: { data: SnapshotPayload['consensus'] }) {
  const rows = asCurrencyArray<ConsensusRow>(data)
  const byCurrency = new Map(rows.map((r) => [r.currency, r]))

  return (
    <SectionCard title="Consensus Survey">
      <TableWrap>
        <table className="w-full min-w-[300px] border-collapse">
          <thead>
            <tr className="border-b border-border-dim">
              <Th>Currency</Th>
              <Th align="right">Direction</Th>
              <Th align="right">Uniform?</Th>
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((currency) => {
              const row = byCurrency.get(currency)
              return (
                <tr key={currency} className="border-b border-border-dim/60">
                  <Td>{currency}</Td>
                  <Td align="right">{consensusDirectionLabel(row)}</Td>
                  <Td align="right">
                    {row == null ? (
                      <MissingBadge />
                    ) : row.uniform_consensus ? (
                      <span className="text-success">Yes</span>
                    ) : (
                      <span className="text-dim">No</span>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </SectionCard>
  )
}

function SnapshotSections({
  payload,
  snapshotDate,
}: {
  payload: SnapshotPayload
  snapshotDate: string
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FxClosesCard rows={payload.fx_closes} snapshotDate={snapshotDate} />
      <CbRatesCard data={payload.cb_rates} />
      <CbToneCard data={payload.cb_tone} />
      <BondYieldsCard data={payload.bond_yields} />
      <CotCard data={payload.cot} />
      <VolatilityCard data={payload.volatility} />
      <MarketIndicesCard data={payload.indices} />
      <GeoRiskCard flags={payload.geo_flags} />
      <ConsensusCard data={payload.consensus} />
    </div>
  )
}

// ——— Page ———

export default function Snapshot() {
  const [selectedDate, setSelectedDate] = useState<string | undefined>()
  const { dates, isLoading: datesLoading } = useSnapshotDates()
  const activeDate = selectedDate ?? dates[0]?.snapshot_date
  const { snapshot, isLoading: snapshotLoading, error } = useSnapshot(activeDate)

  const hasSnapshots = dates.length > 0
  const showSnapshot = hasSnapshots && snapshot && !snapshotLoading

  return (
    <div className="space-y-6">
      <header className="space-y-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display text-4xl italic text-gold">
            Snapshot Inspector
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">
            Friday anchor — what the scoring engine reads Monday
          </p>
        </div>

        {hasSnapshots && (
          <label className="flex max-w-sm flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Anchor week
            </span>
            <select
              value={activeDate ?? ''}
              onChange={(event) => setSelectedDate(event.target.value || undefined)}
              disabled={datesLoading}
              className={fieldClassName}
              aria-label="Select snapshot week"
            >
              {dates.map((row) => (
                <option key={row.id} value={row.snapshot_date}>
                  {formatSnapshotDateLabel(row.snapshot_date)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error"
        >
          Failed to load snapshot: {error.message}
        </div>
      )}

      {datesLoading && (
        <p className="font-mono text-xs text-muted">Loading snapshots…</p>
      )}

      {!datesLoading && !hasSnapshots && <EmptyState />}

      {showSnapshot && (
        <>
          <PreflightBanner flags={snapshot.data_quality_flags} />
          <SnapshotSections
            payload={snapshot.payload ?? {}}
            snapshotDate={snapshot.snapshot_date}
          />
          {!isDataQualityFlagsEmpty(snapshot.data_quality_flags) && (
            <DqsPanel flags={snapshot.data_quality_flags} />
          )}
        </>
      )}

      {hasSnapshots && snapshotLoading && !snapshot && (
        <p className="font-mono text-xs text-muted">Loading snapshot…</p>
      )}
    </div>
  )
}
