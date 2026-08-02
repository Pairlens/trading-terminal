// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Venue themes — deterministic, local-only visuals for exchange badges and
// account cards. Accent gradients only: no remote images, so the desktop app
// never phones third-party CDNs (no link rot, no trademark exposure).
// Connector plugins can still supply their own logoUrl/headerImage via
// manifest metadata (see ExchangeBadge).
// ---------------------------------------------------------------------------

export type ExchangeTheme = {
  gradient: string
  accent: string
  abbr: string
  headerImage?: string
  logoUrl?: string
}

export const EXCHANGE_THEME: Record<string, ExchangeTheme> = {
  okx: {
    gradient: 'from-zinc-800 to-zinc-900 dark:from-zinc-200 dark:to-zinc-300',
    accent: 'text-white dark:text-zinc-900',
    abbr: 'OKX',
  },
  binance: {
    gradient: 'from-amber-400 to-amber-500',
    accent: 'text-white',
    abbr: 'BN',
  },
  bybit: {
    gradient: 'from-orange-500 to-orange-600',
    accent: 'text-white',
    abbr: 'BB',
  },
  mexc: {
    gradient: 'from-blue-600 to-blue-800',
    accent: 'text-white',
    abbr: 'MX',
  },
  kucoin: {
    gradient: 'from-emerald-500 to-teal-600',
    accent: 'text-white',
    abbr: 'KC',
  },
  gate: {
    gradient: 'from-sky-500 to-blue-600',
    accent: 'text-white',
    abbr: 'GT',
  },
  bitget: {
    gradient: 'from-cyan-400 to-teal-500',
    accent: 'text-white',
    abbr: 'BG',
  },
  coinbase: {
    gradient: 'from-blue-500 to-indigo-600',
    accent: 'text-white',
    abbr: 'CB',
  },
  kraken: {
    gradient: 'from-purple-500 to-violet-600',
    accent: 'text-white',
    abbr: 'KR',
  },
  htx: {
    gradient: 'from-blue-600 to-blue-800',
    accent: 'text-white',
    abbr: 'HTX',
  },
  alpaca: {
    gradient: 'from-yellow-400 to-amber-500',
    accent: 'text-black',
    abbr: 'ALP',
  },
}
