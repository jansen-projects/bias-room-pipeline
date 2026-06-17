import { useMemo, useState } from 'react'
import { Pagination } from '../components/Pagination'
import {
  SILVER_TABLES,
  tableHasCurrencyFilter,
  useDataExplorer,
  type SilverTable,
} from '../hooks/useDataExplorer'
import { downloadMarkdown, generateBriefingMarkdown } from '../lib/exportBriefing'
import type { CurrencyCode } from '../types/pipeline'

const PAGE_SIZE = 50

const CURRENCIES: CurrencyCode[] = [
  'USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'XAU',
]

const fieldClassName =
  'rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors focus:border-gold'

function formatHeader(col: string): string {
  return col.replace(/_/g, ' ').toUpperCase()
}

interface CellRender {
  text: string
  title?: string
  className: string
}

function formatCell(value: unknown): CellRender {
  if (value === null || value === undefined) {
    return { text: '—', className: 'text-dim' }
  }
  if (typeof value === 'boolean') {
    return value
      ? { text: '✓', className: 'text-success' }
      : { text: '—', className: 'text-dim' }
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    const short = json.length > 32 ? json.slice(0, 32) + '…' : json
    return { text: short, title: json, className: 'text-muted cursor-help' }
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return { text: value.slice(0, 16).replace('T', ' '), className: 'text-dim' }
    }
    if (value.length > 48) {
      return { text: value.slice(0, 48) + '…', title: value, className: 'text-foreground' }
    }
    return { text: value, className: 'text-foreground' }
  }
  if (typeof value === 'number') {
    const text = Number.isInteger(value) && Math.abs(value) >= 1000
      ? value.toLocaleString()
      : String(value)
    return { text, className: 'text-foreground tabular-nums' }
  }
  return { text: String(value), className: 'text-foreground' }
}

function EmptyState({ table }: { table: SilverTable }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border-dim bg-card px-6 py-16 text-center">
      <svg
        className="mb-4 h-10 w-10 text-dim"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" />
        <path strokeLinecap="round" d="M3 9h18M3 15h18M9 9v10M15 9v10" />
      </svg>
      <p className="font-mono text-sm text-muted">No rows found in {table}</p>
    </div>
  )
}

export default function DataExplorer() {
  const [table, setTable] = useState<SilverTable>('forex_rates')
  const [currency, setCurrency] = useState<string | undefined>()
  const [dateFrom, setDateFrom] = useState<string | undefined>()
  const [dateTo, setDateTo] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  async function handleExportBriefing() {
    setExporting(true)
    try {
      const md = await generateBriefingMarkdown()
      const date = new Date().toISOString().slice(0, 10)
      downloadMarkdown(md, `forex-briefing-${date}.md`)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const supportsCurrency = tableHasCurrencyFilter(table)

  const { rows, columns, totalCount, isLoading, error } = useDataExplorer({
    table,
    currency: supportsCurrency ? currency : undefined,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  })

  const hasActiveFilters = useMemo(
    () => Boolean(currency || dateFrom || dateTo),
    [currency, dateFrom, dateTo],
  )

  function handleTableChange(next: SilverTable) {
    setTable(next)
    setCurrency(undefined)
    setPage(1)
  }

  function clearFilters() {
    setCurrency(undefined)
    setDateFrom(undefined)
    setDateTo(undefined)
    setPage(1)
  }

  function handleCurrencyChange(code: string | undefined) {
    setCurrency(code)
    setPage(1)
  }

  function handleDateFromChange(value: string | undefined) {
    setDateFrom(value)
    setPage(1)
  }

  function handleDateToChange(value: string | undefined) {
    setDateTo(value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl italic text-gold">Data Explorer</h1>
            <p className="mt-2 font-mono text-xs text-muted">
              Read any silver table — filter by currency and date to spot-check mid-week
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportBriefing}
            disabled={exporting}
            className="shrink-0 rounded-md border border-gold/40 bg-background px-4 py-2 font-mono text-xs uppercase tracking-wide text-gold transition-colors hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export Briefing'}
          </button>
        </div>
      </header>

      <section className="space-y-4">
        {/* Row 1: table + date range + clear */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Table
            </span>
            <select
              value={table}
              onChange={(e) => handleTableChange(e.target.value as SilverTable)}
              className={fieldClassName}
              aria-label="Select silver table"
            >
              {SILVER_TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              From
            </span>
            <input
              type="date"
              value={dateFrom ?? ''}
              onChange={(e) => handleDateFromChange(e.target.value || undefined)}
              className={fieldClassName}
              aria-label="Filter from date"
            />
          </label>

          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              To
            </span>
            <input
              type="date"
              value={dateTo ?? ''}
              onChange={(e) => handleDateToChange(e.target.value || undefined)}
              className={fieldClassName}
              aria-label="Filter to date"
            />
          </label>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="pb-2 font-mono text-xs text-gold transition-colors hover:text-gold/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>

        {/* Row 2: currency pills */}
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Currency
          </span>
          {supportsCurrency ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleCurrencyChange(undefined)}
                className={[
                  'rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-colors',
                  !currency
                    ? 'border-gold bg-gold text-background'
                    : 'border-border bg-transparent text-muted hover:border-gold/50 hover:text-foreground',
                ].join(' ')}
              >
                ALL
              </button>
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleCurrencyChange(currency === code ? undefined : code)}
                  className={[
                    'rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-colors',
                    currency === code
                      ? 'border-gold bg-gold text-background'
                      : 'border-border bg-transparent text-muted hover:border-gold/50 hover:text-foreground',
                  ].join(' ')}
                >
                  {code}
                </button>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-dim">
              Currency filter not available for {table}
            </p>
          )}
        </div>

        <p className="font-mono text-xs text-muted">
          {isLoading
            ? 'Loading…'
            : `${totalCount.toLocaleString()} row${totalCount === 1 ? '' : 's'} total`}
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error"
        >
          Failed to load {table}: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && <EmptyState table={table} />}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-dim">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface">
                {columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-gold"
                  >
                    {formatHeader(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={[
                    'border-t border-border-dim',
                    rowIndex % 2 === 1 ? 'bg-gold-dim/40' : 'bg-transparent',
                  ].join(' ')}
                >
                  {columns.map((col) => {
                    const cell = formatCell(row[col])
                    return (
                      <td
                        key={col}
                        title={cell.title}
                        className={[
                          'whitespace-nowrap px-4 py-2.5 font-mono text-xs',
                          cell.className,
                        ].join(' ')}
                      >
                        {cell.text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onChange={setPage}
      />
    </div>
  )
}
