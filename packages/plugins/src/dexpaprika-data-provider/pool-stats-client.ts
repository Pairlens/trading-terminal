// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pool state and chain totals from DexPaprika — the fallback, and the only
 * source that publishes the two things GeckoTerminal does not.
 *
 * Per-token reserves (`token_reserves`) and the 24h buy/sell split
 * (`24h.buy_usd` / `24h.sell_usd`) are here and nowhere else, which is why the
 * pool panes leave those cells to collapse in a browser instead of deriving
 * them: on desktop this provider fills them with measured numbers, and a
 * derived stand-in would be indistinguishable from one on screen.
 *
 * Reachability is the catch. DexPaprika sends no `Access-Control-Allow-Origin`
 * header, so every call here is CORS-blocked in a webview and only runs where
 * `restFetch` has a native transport (desktop, CLI). That is the whole reason
 * it sits at priority 6 behind GeckoTerminal rather than in front of it.
 */
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { assertNotThrottled } from '@pairlens/market-engine/provider-throttle'
import { DEXPAPRIKA_PROVIDER } from './throttle'
import { resolvePool } from './pool-resolver'
import type {
  ChainPoolStats,
  PoolStats,
} from '@pairlens/shared/instrument-types'

const API_BASE = 'https://api.dexpaprika.com'

export type RawDexPaprikaPool = {
  id?: string
  chain?: string
  dex_name?: string
  fee?: number | null
  created_at?: string | null
  base_token_id?: string
  quote_token_id?: string
  last_price?: number
  last_price_usd?: number
  liquidity_usd?: number
  tokens?: Array<{ id?: string; symbol?: string; decimals?: number }>
  token_reserves?: Array<{
    token_id?: string
    reserve?: number
    reserve_usd?: number
  }>
  '24h'?: {
    last_price_usd_change?: number
    volume_usd?: number
    buy_usd?: number
    sell_usd?: number
    buys?: number
    sells?: number
  }
  '1h'?: { last_price_usd_change?: number; volume_usd?: number }
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The fee this venue reports, normalized to a fraction.
 *
 * DexPaprika sends `fee` as a percentage on the venues that publish one at all
 * (0.05 for a 5 bps pool) and null everywhere else, which is most Solana
 * pools. Values at or above 100 are not a fee tier and are dropped rather than
 * rendered as a four-figure percentage.
 */
export function normalizeFee(fee: number | null | undefined): number | null {
  if (typeof fee !== 'number' || !Number.isFinite(fee)) return null
  if (fee <= 0 || fee >= 100) return null
  return fee / 100
}

export function parsePoolStats(
  raw: RawDexPaprikaPool,
  network: string,
): PoolStats | null {
  const address = raw.id
  if (!address) return null

  const tokens = raw.tokens ?? []
  const baseToken = tokens.find((t) => t.id === raw.base_token_id) ?? tokens[0]
  const quoteToken =
    tokens.find((t) => t.id === raw.quote_token_id) ?? tokens[1]
  const reserves = raw.token_reserves ?? []
  const baseReserve = reserves.find((r) => r.token_id === baseToken?.id)
  const quoteReserve = reserves.find((r) => r.token_id === quoteToken?.id)
  const w24 = raw['24h'] ?? {}
  const w1 = raw['1h'] ?? {}

  const baseSymbol = baseToken?.symbol ?? null
  const quoteSymbol = quoteToken?.symbol ?? null
  const priceUsd = finiteOrNull(raw.last_price_usd)
  const priceInQuote = finiteOrNull(raw.last_price)

  // The quote leg's USD price is not published; it follows from the two
  // prices that are, and only when both are usable.
  const quotePriceUsd =
    priceUsd !== null && priceInQuote !== null && priceInQuote !== 0
      ? priceUsd / priceInQuote
      : null

  return {
    network,
    address,
    name:
      baseSymbol && quoteSymbol ? `${baseSymbol} / ${quoteSymbol}` : address,
    dexName: raw.dex_name ?? '',
    baseSymbol,
    quoteSymbol,
    priceUsd,
    quotePriceUsd,
    priceInQuote,
    change1hPct: finiteOrNull(w1.last_price_usd_change),
    change24hPct: finiteOrNull(w24.last_price_usd_change),
    volume1hUsd: finiteOrNull(w1.volume_usd),
    volume24hUsd: finiteOrNull(w24.volume_usd),
    reserveUsd: finiteOrNull(raw.liquidity_usd),
    // `reserve` is raw on-chain units; the token's own decimals scale it.
    baseReserve: scaleReserve(baseReserve?.reserve, baseToken?.decimals),
    quoteReserve: scaleReserve(quoteReserve?.reserve, quoteToken?.decimals),
    feeTier: normalizeFee(raw.fee),
    trades24h:
      w24.buys !== undefined || w24.sells !== undefined
        ? {
            buys: w24.buys ?? 0,
            sells: w24.sells ?? 0,
            buyers: null,
            sellers: null,
          }
        : null,
    buyVolume24hUsd: finiteOrNull(w24.buy_usd),
    sellVolume24hUsd: finiteOrNull(w24.sell_usd),
    createdAt: raw.created_at ?? null,
    fdvUsd: null,
    source: 'dexpaprika',
  }
}

/** Raw reserve → token units. Unknown decimals means we cannot say. */
export function scaleReserve(
  reserve: number | undefined,
  decimals: number | undefined,
): number | null {
  if (typeof reserve !== 'number' || !Number.isFinite(reserve)) return null
  if (typeof decimals !== 'number' || !Number.isFinite(decimals)) return null
  return reserve / 10 ** decimals
}

/**
 * `poolAddress` pins the pool and skips resolution. Same reasoning as the
 * GeckoTerminal client: a caller looking at a specific pool must not have it
 * re-derived from `BASE-QUOTE`, which costs a request and can land on a
 * different pool for the same pair. The address is chain-level, so one handed
 * over by whichever provider listed the pool is valid here too.
 */
export async function fetchPoolStats(
  pair: string,
  network: string,
  poolAddress?: string,
): Promise<PoolStats | null> {
  const id = poolAddress || (await resolvePool(pair, network))?.id
  if (!id) return null

  const res = await fetch(`${API_BASE}/networks/${network}/pools/${id}`)
  assertNotThrottled(res, DEXPAPRIKA_PROVIDER)
  if (!res.ok) {
    throw new Error(`DexPaprika pool ${id}: HTTP ${res.status}`)
  }
  const json = (await res.json()) as RawDexPaprikaPool
  return parsePoolStats(json, network)
}

export type RawDexPaprikaNetwork = {
  id?: string
  display_name?: string
  volume_usd_24h?: number
  txns_24h?: number
  pools_count?: number
}

/**
 * Chain-wide totals, which is what makes this worth a second provider: these
 * cover the whole network rather than a sampled page of pools, so the rows say
 * `coverage: 'network'` and the pane drops its "top pools" qualifier.
 */
export function parseNetworkStats(
  rows: Array<RawDexPaprikaNetwork>,
  wanted: Array<{ market: string; network: string }>,
): Array<ChainPoolStats> {
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id!, r]))
  return wanted.map(({ market, network }) => {
    const row = byId.get(network)
    return {
      network,
      market,
      displayName: row?.display_name ?? network,
      volume24hUsd: finiteOrNull(row?.volume_usd_24h),
      // Value locked is not part of this endpoint; the chain row shows volume
      // and pool count, and leaves liquidity to the pool listing.
      reserveUsd: null,
      txns24h: finiteOrNull(row?.txns_24h),
      poolsCount: finiteOrNull(row?.pools_count),
      coverage: 'network',
      sampledPools: null,
      source: 'dexpaprika',
    }
  })
}

export async function fetchNetworkStats(
  wanted: Array<{ market: string; network: string }>,
): Promise<Array<ChainPoolStats>> {
  const res = await fetch(`${API_BASE}/networks`)
  assertNotThrottled(res, DEXPAPRIKA_PROVIDER)
  if (!res.ok) throw new Error(`DexPaprika networks: HTTP ${res.status}`)
  const rows = (await res.json()) as Array<RawDexPaprikaNetwork>
  return parseNetworkStats(Array.isArray(rows) ? rows : [], wanted)
}
