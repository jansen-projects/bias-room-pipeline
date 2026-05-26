// ─── Forex ticker map ────────────────────────────────────────────────────────

export interface PairMeta {
  pair: string
  base: string | null
  quote: string | null
}

export const TICKER_MAP: Record<string, PairMeta> = {
  'AUDUSD=X': { pair: 'AUDUSD', base: 'AUD',  quote: 'USD' },
  'EURUSD=X': { pair: 'EURUSD', base: 'EUR',  quote: 'USD' },
  'GBPUSD=X': { pair: 'GBPUSD', base: 'GBP',  quote: 'USD' },
  'NZDUSD=X': { pair: 'NZDUSD', base: 'NZD',  quote: 'USD' },
  'JPY=X':    { pair: 'USDJPY', base: 'USD',  quote: 'JPY' },
  'CAD=X':    { pair: 'USDCAD', base: 'USD',  quote: 'CAD' },  // CAD=X = USD/CAD (~1.38), not CADUSD=X which inverts to CAD/USD (~0.72)
  'CHF=X':    { pair: 'USDCHF', base: 'USD',  quote: 'CHF' },
  'DX-Y.NYB': { pair: 'DXY',    base: null,   quote: null  },
  'GC=F':     { pair: 'XAUUSD', base: 'XAU',  quote: 'USD' },
}

// ─── FRED central bank series map ────────────────────────────────────────────

export interface CbSeriesMeta {
  currency: string
  region: string
  centralBank: string
  seriesLabel: string
  frequency: string
}

// Series IDs verified against FRED API. DFEDTARU and ECBDFR are daily Fed/ECB
// series. The remaining six use OECD-sourced immediate-rate series (monthly).
export const CB_SERIES: Record<string, CbSeriesMeta> = {
  DFEDTARU:        { currency: 'USD', region: 'United States',  centralBank: 'Federal Reserve',             seriesLabel: 'Federal Funds Target Upper Bound',  frequency: 'daily'   },
  ECBDFR:          { currency: 'EUR', region: 'Euro Area',       centralBank: 'European Central Bank',       seriesLabel: 'ECB Deposit Facility Rate',          frequency: 'daily'   },
  IRSTCB01JPM156N: { currency: 'JPY', region: 'Japan',           centralBank: 'Bank of Japan',               seriesLabel: 'BOJ Central Bank Rate (OECD)',       frequency: 'monthly' },
  IRSTCI01GBM156N: { currency: 'GBP', region: 'United Kingdom',  centralBank: 'Bank of England',             seriesLabel: 'GBP Immediate Rate (OECD)',          frequency: 'monthly' },
  IRSTCI01CHM156N: { currency: 'CHF', region: 'Switzerland',     centralBank: 'Swiss National Bank',         seriesLabel: 'CHF Immediate Rate (OECD)',          frequency: 'monthly' },
  IRSTCB01CAM156N: { currency: 'CAD', region: 'Canada',          centralBank: 'Bank of Canada',              seriesLabel: 'BOC Central Bank Rate (OECD)',       frequency: 'monthly' },
  IRSTCI01AUM156N: { currency: 'AUD', region: 'Australia',       centralBank: 'Reserve Bank of Australia',   seriesLabel: 'AUD Immediate Rate (OECD)',          frequency: 'monthly' },
  IRSTCI01NZM156N: { currency: 'NZD', region: 'New Zealand',     centralBank: 'Reserve Bank of New Zealand', seriesLabel: 'NZD Immediate Rate (OECD)',          frequency: 'monthly' },
}

// ─── CFTC contract market code map ───────────────────────────────────────────

export const CFTC_CODE_MAP: Record<string, string> = {
  '099741': 'EUR',
  '096742': 'GBP',
  '097741': 'JPY',
  '232741': 'AUD',
  '090741': 'CAD',
  '092741': 'CHF',
  '112741': 'NZD',
  '098662': 'USD',
  '088691': 'XAU',
}
