// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `datapi.jup.ag/v2/charts/{mint}` — candles keyed on the MINT, which is the
 * whole point.
 *
 * ## What it replaces, and why that was slow
 *
 * A Solana token charted through GeckoTerminal costs two serialized round
 * trips before the first bar paints: resolve the token's deepest pool, then
 * ask that pool for OHLCV. Both spend the same ~30-a-minute free-tier budget
 * that the DEX Discovery board, the pool panes and the swap tape are also
 * spending, so on a busy board the resolve alone can sit in a queue. This
 * endpoint answers the same question in one request, from a host the memecoin
 * board is already talking to, and needs no pool at all — Jupiter aggregates
 * across every pool the mint trades in, which for a token is the number a
 * trader wants anyway.
 *
 * ## The part GeckoTerminal cannot do
 *
 * Bonding-curve candles. A pump.fun mint has no AMM pool until it graduates,
 * so GeckoTerminal has nothing to resolve and the chart is empty for exactly
 * the tokens the New and Graduating columns exist to surface. This endpoint
 * carries the curve from the first trade, which is why it is wired for the
 * `jupiter` venue rather than offered as a general DEX source.
 *
 * ## The catch, stated as plainly as the gems client states its own
 *
 * This is jup.ag's own frontend backend, undocumented and carrying no
 * stability guarantee, exactly like `datapi.jup.ag/v1/pools/gems`. So it is
 * declared at priority 4 and BELOW nothing: a failure here throws, the plugin
 * manager walks past it, and GeckoTerminal's wildcard `market-data:candles` at
 * priority 5 is what answers instead. The degraded path is the one that
 * shipped before this file existed.
 *
 * CORS is confirmed against the hosted terminal's origin: the preflight
 * answers 204 with `access-control-allow-origin` reflecting the caller and
 * `GET` among the allowed methods. `*.jup.ag` is already in the desktop CSP
 * baseline and the Tauri HTTP scope, so this host needs no new grant.
 */
import { restFetch } from '@pairlens/market-engine/http'
import type { Candle, Timeframe } from '@pairlens/shared/types'

const ENDPOINT = 'https://datapi.jup.ag/v2/charts'

/**
 * Terminal timeframe → the interval token this endpoint names.
 *
 * Verified live, one probe per entry: `5_SECOND` is rejected while
 * `15_SECOND` and `30_SECOND` are accepted, which is the kind of gap that is
 * only ever found by asking. The terminal's `2h`, `3d` and `1M` have no
 * counterpart, and they are deliberately absent rather than approximated —
 * a chart labelled 2h drawn from 1h bars is a wrong chart, and an unmapped
 * timeframe simply falls through to GeckoTerminal.
 */
const INTERVAL: Partial<Record<Timeframe, string>> = {
  '1m': '1_MINUTE',
  '5m': '5_MINUTE',
  '15m': '15_MINUTE',
  '30m': '30_MINUTE',
  '1h': '1_HOUR',
  '4h': '4_HOUR',
  '1d': '1_DAY',
  '1w': '1_WEEK',
}

/** Milliseconds one bar covers, for sizing the window a candle count needs. */
const BAR_MS: Partial<Record<Timeframe, number>> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
}

export function supportsTimeframe(timeframe: string): boolean {
  return timeframe in INTERVAL
}

/**
 * The base leg of a pair key, which on this class is the mint.
 *
 * A memecoin key is `{address}-{QUOTE}` and an address contains no hyphen, so
 * the split is on the LAST one. Returning null rather than guessing is what
 * keeps a symbol pair (`SOL-USDC`, which this endpoint cannot answer) falling
 * through to the provider that can.
 */
export function mintOfPair(pair: string): string | null {
  const cut = pair.lastIndexOf('-')
  const base = cut === -1 ? pair : pair.slice(0, cut)
  // Solana mints are base58 and in the 32..44 character range. The check is
  // deliberately loose: its job is to reject `SOL`, not to validate an address.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(base) ? base : null
}

type RawCandle = {
  time?: number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Candles for a mint, newest last.
 *
 * `from`/`to` are MILLISECONDS and `candles` is required — both learned the
 * hard way against the live endpoint, which answers `200 {"candles":[]}` to a
 * second-denominated window and `400` to a missing count. An empty array is
 * therefore ambiguous at the protocol level and is treated as a real "nothing
 * here": the caller falls through, which is the safe reading either way.
 */
export async function fetchJupiterCandles(
  pair: string,
  timeframe: string,
  limit: number,
  now: number = Date.now(),
): Promise<Array<Candle>> {
  const mint = mintOfPair(pair)
  const interval = INTERVAL[timeframe as Timeframe]
  const barMs = BAR_MS[timeframe as Timeframe]
  if (!mint || !interval || !barMs) return []

  const count = Math.max(1, Math.min(limit, 500))
  // A window wide enough for the count, with slack: a token that has not
  // traded every bar returns fewer, and asking for a wider window costs the
  // same request.
  const from = now - barMs * count * 2
  const url =
    `${ENDPOINT}/${mint}` +
    `?interval=${interval}&from=${from}&to=${now}&candles=${count}&type=price`

  const res = await restFetch(url)
  if (!res.ok) {
    throw new Error(`Jupiter charts API ${res.status}`)
  }
  const body = (await res.json()) as { candles?: Array<RawCandle> }
  const raw = Array.isArray(body.candles) ? body.candles : []

  const candles: Array<Candle> = []
  for (const bar of raw) {
    // `time` is SECONDS here while the terminal's `ts` is milliseconds, and
    // getting that backwards paints every bar in 1970.
    const t = finite(bar.time)
    const open = finite(bar.open)
    const high = finite(bar.high)
    const low = finite(bar.low)
    const close = finite(bar.close)
    if (
      t === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue
    }
    candles.push({
      ts: t * 1000,
      open,
      high,
      low,
      close,
      volume: finite(bar.volume) ?? 0,
    })
  }
  return candles.sort((a, b) => a.ts - b.ts)
}
