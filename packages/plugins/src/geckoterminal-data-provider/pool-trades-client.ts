// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pool's confirmed swaps, newest first.
 *
 * `kind` is the aggressor's direction on the BASE leg — a `sell` moved base
 * out of the taker's wallet and into the pool — so it maps straight onto the
 * tape's buy/sell without inference. The amounts are keyed by which side of
 * the swap the base token was on, which is the one thing a naive parse gets
 * backwards: `from_token_amount` is base on a sell and quote on a buy.
 *
 * Served as a one-shot execute rather than as `market-data:trades`. The trades
 * capability is a SUBSCRIPTION contract the CEX tape reads through
 * `hasCapability(market)`, and these providers declare `['*']` markets — so
 * declaring it here would tell every CEX pane without a tape that it has one,
 * and then answer with pools resolved by symbol. The DEX pane polls this
 * instead.
 */
import { resolvePool } from './pool-resolver'
import { geckoFetch as fetch } from './rate-limiter'
import { numberOrNull } from './pool-stats-client'
import type { PoolTrade } from '@pairlens/shared/instrument-types'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

/** Prints kept per fetch. The endpoint serves up to 300; the tape shows ~40. */
export const TRADES_LIMIT = 200

export type RawGeckoTrade = {
  id?: string
  attributes?: {
    block_number?: number
    tx_hash?: string
    tx_from_address?: string
    from_token_amount?: string
    to_token_amount?: string
    price_from_in_usd?: string
    price_to_in_usd?: string
    block_timestamp?: string
    kind?: string
    volume_in_usd?: string
    from_token_address?: string
    to_token_address?: string
  }
}

export function parsePoolTrade(raw: RawGeckoTrade): PoolTrade | null {
  const a = raw.attributes
  if (!a || !raw.id) return null

  const ts = a.block_timestamp ? Date.parse(a.block_timestamp) : NaN
  const amountUsd = numberOrNull(a.volume_in_usd)
  if (!Number.isFinite(ts) || amountUsd === null) return null

  // On a sell the base token is the FROM leg; on a buy it is the TO leg.
  const isSell = a.kind === 'sell'
  const fromAmount = numberOrNull(a.from_token_amount)
  const toAmount = numberOrNull(a.to_token_amount)

  return {
    id: raw.id,
    ts,
    side: isSell ? 'sell' : 'buy',
    amountUsd,
    priceUsd: numberOrNull(isSell ? a.price_from_in_usd : a.price_to_in_usd),
    baseAmount: isSell ? fromAmount : toAmount,
    quoteAmount: isSell ? toAmount : fromAmount,
    wallet: a.tx_from_address ?? null,
    txHash: a.tx_hash ?? null,
    blockNumber: a.block_number ?? null,
  }
}

/** Newest first, malformed rows dropped rather than rendered as blanks. */
export function parsePoolTrades(
  data: Array<RawGeckoTrade> | undefined,
): Array<PoolTrade> {
  const out: Array<PoolTrade> = []
  for (const raw of data ?? []) {
    const trade = parsePoolTrade(raw)
    if (trade) out.push(trade)
  }
  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, TRADES_LIMIT)
}

/**
 * Same contract as fetchPoolStats: null for "no pool", throw for a failed
 * request, so the fallback chain can still try DexPaprika on desktop.
 */
export async function fetchPoolTrades(
  pair: string,
  network: string,
  minVolumeUsd = 0,
): Promise<Array<PoolTrade> | null> {
  const pool = await resolvePool(pair, network)
  if (!pool) return null

  const query =
    minVolumeUsd > 0 ? `?trade_volume_in_usd_greater_than=${minVolumeUsd}` : ''
  const res = await fetch(
    `${API_BASE}/networks/${pool.network}/pools/${pool.address}/trades${query}`,
  )
  if (!res.ok) {
    throw new Error(`GeckoTerminal trades ${pool.address}: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { data?: Array<RawGeckoTrade> }
  return parsePoolTrades(json.data)
}
