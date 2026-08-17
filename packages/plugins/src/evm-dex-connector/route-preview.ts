// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the aggregator WOULD do, stopped one step before it does it.
 *
 * The route pane and the price-impact tiers show the same KyberSwap quote the
 * order path takes, obtained through the same `getRoute` — which means the
 * split on screen is the split that executes, not a model of it. This module
 * ends at the summary: it never calls `/route/build`, never touches a wallet
 * slot, never asks for a private key, and returns a plain data shape with no
 * calldata in it. `executeSwap` is the only path that signs, and it takes a
 * `KyberRoute`, which nothing here hands out.
 */
import { getRoute, scaleAmount } from './swap-executor'
import { resolveToken } from './token-client'
import type { EvmChainConfig } from './chains'
import type { KyberRoute } from './types'
import type { SwapRouteQuote } from '@pairlens/market-engine/types'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Raw integer amount → human units. Kept in float space: display only. */
export function descale(raw: string | undefined, decimals: number): number {
  const value = toNumber(raw)
  return value === null ? 0 : value / 10 ** decimals
}

/**
 * Price impact from the two USD legs the aggregator itself prices.
 *
 * Deliberately NOT computed from pool reserves: a Kyber route crosses pools
 * this process has never read, so reserve math would describe a different
 * trade. Returns null unless both legs are priced and the input is positive,
 * because a "0.00%" that means "we could not tell" is the one reading that
 * gets somebody filled badly.
 */
export function impactFromUsd(
  amountInUsd: number | null,
  amountOutUsd: number | null,
): number | null {
  if (amountInUsd === null || amountOutUsd === null) return null
  if (!(amountInUsd > 0)) return null
  return (amountInUsd - amountOutUsd) / amountInUsd
}

/**
 * Fold a Kyber route into legs the pane can draw.
 *
 * `routeSummary.route` is an array of SPLITS, each split an array of hops. A
 * split's share is its FIRST hop's `swapAmount` over the total input, since
 * later hops carry the intermediate amounts of a multi-hop path rather than
 * another slice of the user's money. Named by the last hop's exchange, which
 * is the venue the output actually comes out of.
 */
export function summarizeKyberRoute(
  route: KyberRoute,
  opts: {
    market: string
    pair: string
    side: 'buy' | 'sell'
    inputSymbol: string
    outputSymbol: string
    inputDecimals: number
    outputDecimals: number
    now?: number
  },
): SwapRouteQuote {
  const summary = route.routeSummary

  const amountIn = descale(summary.amountIn, opts.inputDecimals)
  const amountOut = descale(summary.amountOut, opts.outputDecimals)
  const totalIn = toNumber(summary.amountIn) ?? 0

  const legs = (summary.route ?? [])
    .map((split) => {
      const first = split[0]
      const last = split[split.length - 1]
      const swapAmount = toNumber(first?.swapAmount)
      return {
        venue: last?.exchange ?? first?.exchange ?? '',
        share: totalIn > 0 && swapAmount !== null ? swapAmount / totalIn : 0,
        amountOut:
          last?.amountOut === undefined
            ? null
            : descale(last.amountOut, opts.outputDecimals),
      }
    })
    .filter((leg) => leg.venue.length > 0)
    .sort((a, b) => b.share - a.share)

  const amountInUsd = toNumber(summary.amountInUsd)
  const amountOutUsd = toNumber(summary.amountOutUsd)

  return {
    market: opts.market,
    pair: opts.pair,
    side: opts.side,
    amountIn,
    amountOut,
    inputSymbol: opts.inputSymbol,
    outputSymbol: opts.outputSymbol,
    amountInUsd,
    amountOutUsd,
    priceImpact: impactFromUsd(amountInUsd, amountOutUsd),
    executionPrice: amountIn > 0 ? amountOut / amountIn : null,
    gasUsd: toNumber(summary.gasUsd),
    legs,
    source: 'kyberswap',
    ts: opts.now ?? Date.now(),
  }
}

/**
 * Quote a swap without executing it. Returns null when the pair does not
 * resolve or the aggregator has no route, which the pane renders as "no route
 * for this size" rather than as an error.
 */
export async function quoteSwapRoute(opts: {
  chain: EvmChainConfig
  pair: string
  side: 'buy' | 'sell'
  /** Size in INPUT-token units — buy spends quote, sell spends base. */
  size: string
}): Promise<SwapRouteQuote | null> {
  const [base, quote] = opts.pair.split('-')
  if (!base || !quote) return null

  const baseToken = await resolveToken(opts.chain, base)
  const quoteToken = await resolveToken(opts.chain, quote)
  if (!baseToken || !quoteToken) return null

  const inputToken = opts.side === 'buy' ? quoteToken : baseToken
  const outputToken = opts.side === 'buy' ? baseToken : quoteToken
  const amountIn = scaleAmount(opts.size, inputToken.decimals)
  if (amountIn <= 0n) return null

  const route = await getRoute(
    opts.chain,
    inputToken.address,
    outputToken.address,
    amountIn,
  )
  if (!route) return null

  return summarizeKyberRoute(route, {
    market: opts.chain.market,
    pair: opts.pair,
    side: opts.side,
    inputSymbol: inputToken.symbol,
    outputSymbol: outputToken.symbol,
    inputDecimals: inputToken.decimals,
    outputDecimals: outputToken.decimals,
  })
}

/**
 * The chain's current gas price in wei, straight from the configured RPC.
 *
 * Lives in the connector rather than in the terminal for the same reason every
 * venue call does: the RPC endpoint is the connector's, its host is what the
 * desktop CSP allows for this plugin, and a pane reaching a chain directly
 * would be the first place that boundary leaked. Read-only — `eth_gasPrice`
 * takes no account and signs nothing.
 */
export async function fetchGasPriceWei(rpcUrl: string): Promise<bigint | null> {
  const { restFetch } = await import('@pairlens/market-engine/http')
  const res = await restFetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_gasPrice',
      params: [],
    }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { result?: string }
  if (typeof json.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(json.result))
    return null
  return BigInt(json.result)
}
