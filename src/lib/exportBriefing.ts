import { supabase } from './supabase'

const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD'] as const
const FX_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'DXY', 'XAUUSD'] as const

function fmt(v: unknown, decimals = 4): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toFixed(decimals)
  return String(v)
}

function pct(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  return String(v)
}

function sign(v: unknown, decimals = 4): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}`
  return String(v)
}

interface FxRow {
  pair: string
  effective_date: string
  close: number | null
  open: number | null
  high: number | null
  low: number | null
  ecb_rate: number | null
  [k: string]: unknown
}

interface CbRow {
  currency: string
  central_bank: string
  rate: number | null
  prev_rate: number | null
  rate_change: number | null
  effective_date: string
  is_canonical: boolean
  [k: string]: unknown
}

interface BondRow {
  currency: string
  instrument: string
  yield: number | null
  prev_yield: number | null
  yield_change: number | null
  effective_date: string
  data_frequency: string
  [k: string]: unknown
}

interface CotRow {
  currency: string
  net_non_commercial: number | null
  pct_of_oi: number | null
  net_change: number | null
  report_date: string
  [k: string]: unknown
}

interface AtrRow {
  pair: string
  atr14: number | null
  warning_threshold: number | null
  critical_threshold: number | null
  effective_date: string
  [k: string]: unknown
}

export async function generateBriefingMarkdown(): Promise<string> {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toISOString().slice(11, 16) + ' UTC'

  const [fxRes, cbRes, bondsRes, cotRes, atrRes] = await Promise.all([
    supabase
      .from('forex_rates')
      .select('*')
      .in('pair', [...FX_PAIRS])
      .order('effective_date', { ascending: false })
      .limit(FX_PAIRS.length * 2),

    supabase
      .from('central_bank_rates')
      .select('*')
      .eq('is_canonical', true)
      .in('currency', [...CURRENCIES])
      .order('effective_date', { ascending: false })
      .limit(CURRENCIES.length * 2),

    supabase
      .from('bond_yields_nominal')
      .select('*')
      .in('currency', [...CURRENCIES])
      .order('effective_date', { ascending: false })
      .limit(30),

    supabase
      .from('cot_positioning')
      .select('*')
      .in('currency', [...CURRENCIES, 'XAU'])
      .order('report_date', { ascending: false })
      .limit(20),

    supabase
      .from('daily_atr14')
      .select('*')
      .order('effective_date', { ascending: false })
      .limit(20),
  ])

  const lines: string[] = []

  lines.push(`# Forex Data Briefing`)
  lines.push(``)
  lines.push(`**Generated:** ${dateStr} at ${timeStr}`)
  lines.push(``)

  // --- FX Rates ---
  lines.push(`## FX Rates`)
  lines.push(``)
  if (fxRes.error) {
    lines.push(`> Error loading FX rates: ${fxRes.error.message}`)
  } else {
    const fxRows = (fxRes.data ?? []) as FxRow[]
    const latest = dedup(fxRows, (r) => r.pair)

    lines.push(`| Pair | Close | Open | High | Low | Date |`)
    lines.push(`|------|------:|-----:|-----:|----:|------|`)
    for (const p of FX_PAIRS) {
      const r = latest.get(p)
      if (!r) continue
      const dec = p.includes('JPY') ? 2 : p === 'XAUUSD' ? 2 : 4
      lines.push(
        `| ${r.pair} | ${fmt(r.close, dec)} | ${fmt(r.open, dec)} | ${fmt(r.high, dec)} | ${fmt(r.low, dec)} | ${r.effective_date} |`,
      )
    }
  }
  lines.push(``)

  // --- Central Bank Rates ---
  lines.push(`## Central Bank Policy Rates`)
  lines.push(``)
  if (cbRes.error) {
    lines.push(`> Error loading CB rates: ${cbRes.error.message}`)
  } else {
    const cbRows = (cbRes.data ?? []) as CbRow[]
    const latest = dedup(cbRows, (r) => r.currency)

    lines.push(`| Currency | Central Bank | Rate (%) | Prev (%) | Change | Date |`)
    lines.push(`|----------|-------------|--------:|---------:|-------:|------|`)
    for (const ccy of CURRENCIES) {
      const r = latest.get(ccy)
      if (!r) continue
      lines.push(
        `| ${r.currency} | ${r.central_bank} | ${fmt(r.rate, 2)} | ${fmt(r.prev_rate, 2)} | ${sign(r.rate_change, 2)} | ${r.effective_date} |`,
      )
    }
  }
  lines.push(``)

  // --- Bond Yields ---
  lines.push(`## Government Bond Yields`)
  lines.push(``)
  if (bondsRes.error) {
    lines.push(`> Error loading bond yields: ${bondsRes.error.message}`)
  } else {
    const bondRows = (bondsRes.data ?? []) as BondRow[]
    const latest = dedup(bondRows, (r) => `${r.currency}|${r.instrument}`)

    lines.push(`| Currency | Instrument | Yield (%) | Prev (%) | Change | Freq | Date |`)
    lines.push(`|----------|-----------|--------:|---------:|-------:|------|------|`)
    for (const [, r] of [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(
        `| ${r.currency} | ${r.instrument} | ${fmt(r.yield, 3)} | ${fmt(r.prev_yield, 3)} | ${sign(r.yield_change, 3)} | ${r.data_frequency} | ${r.effective_date} |`,
      )
    }
  }
  lines.push(``)

  // --- COT Positioning ---
  lines.push(`## CFTC Commitment of Traders`)
  lines.push(``)
  if (cotRes.error) {
    lines.push(`> Error loading COT data: ${cotRes.error.message}`)
  } else {
    const cotRows = (cotRes.data ?? []) as CotRow[]
    const latest = dedup(cotRows, (r) => r.currency)

    lines.push(`| Currency | Net Non-Commercial | % of OI | Net Change | Report Date |`)
    lines.push(`|----------|------------------:|--------:|----------:|------------|`)
    for (const [, r] of [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(
        `| ${r.currency} | ${r.net_non_commercial?.toLocaleString() ?? '—'} | ${pct(r.pct_of_oi)} | ${r.net_change?.toLocaleString() ?? '—'} | ${r.report_date} |`,
      )
    }
  }
  lines.push(``)

  // --- ATR Volatility ---
  lines.push(`## ATR-14 Volatility`)
  lines.push(``)
  if (atrRes.error) {
    lines.push(`> Error loading ATR data: ${atrRes.error.message}`)
  } else {
    const atrRows = (atrRes.data ?? []) as AtrRow[]
    const latest = dedup(atrRows, (r) => r.pair)

    lines.push(`| Pair | ATR-14 | Warning | Critical | Date |`)
    lines.push(`|------|------:|--------:|---------:|------|`)
    for (const [, r] of [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const dec = r.pair.includes('JPY') ? 3 : 5
      lines.push(
        `| ${r.pair} | ${fmt(r.atr14, dec)} | ${fmt(r.warning_threshold, dec)} | ${fmt(r.critical_threshold, dec)} | ${r.effective_date} |`,
      )
    }
  }
  lines.push(``)

  lines.push(`---`)
  lines.push(`*Exported from The Bias Room — Pipeline Control Room*`)

  return lines.join('\n')
}

function dedup<T>(rows: T[], keyFn: (r: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  for (const r of rows) {
    const k = keyFn(r)
    if (!map.has(k)) map.set(k, r)
  }
  return map
}

export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
