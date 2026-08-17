// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A Jupiter quote, read rather than executed.
 *
 * Same rule as the EVM side: this goes through the SAME `getQuote` the order
 * path uses — so the split shown is the split that would fill — and stops
 * before `/swap`. Nothing here deserializes a transaction, asks a wallet slot
 * for a key, or returns anything a signer could act on.
 */
import { scaleAmount } from '@pairlens/market-engine/amount'
import { getQuote } from './swap-executor'
import { resolveToken } from './token-registry'
import type { JupiterQuote } from './types'
import type { SwapRouteQuote } from '@pairlens/market-engine/types'

/** A `routePlan` entry: one hop through one AMM. */
export type JupiterRoutePlanLeg = {
  /** Portion of THIS HOP'S input, not of the swap. See summarizeJupiterQuote. */
  percent?: number
  swapInfo?: {
    label?: string
    ammKey?: string
    inputMint?: string
    outputMint?: string
    inAmount?: string
    outAmount?: string
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function descale(raw: string | undefined, decimals: number): number {
  const value = toNumber(raw)
  return value === null ? 0 : value / 10 ** decimals
}

/**
 * Jupiter's `priceImpactPct` is a FRACTION despite the name — 0.00012 for a
 * 1.2 bps trade, not 0.012. Verified against the live quote endpoint; reading
 * it as a percentage would understate impact by two orders of magnitude and
 * make every size look free.
 */
export function parsePriceImpact(value: unknown): number | null {
  const parsed = toNumber(value)
  if (parsed === null) return null
  return Math.abs(parsed) < 1 ? parsed : null
}

/**
 * Reconstruct the router's splits from a flat `routePlan`.
 *
 * `routePlan` is a list of HOPS, not of splits, and `percent` is that hop's
 * share of ITS OWN input. A two-hop path therefore reports 100 twice, which
 * read naively renders as two venues each taking the whole order: a live
 * SOL/USDC quote came back as `Deriverse 100%` plus `Scorch 100%` for a single
 * $1,000 fill. So the split is derived from the hops that consume the swap's
 * OWN input mint, and each one is then followed through the plan by matching
 * output mint to input mint. A path's venue is the chain of hops it ran
 * through, and its output is the last hop's.
 */
export function buildJupiterLegs(
  plan: Array<JupiterRoutePlanLeg>,
  inputMint: string,
  totalIn: number,
  outputDecimals: number,
): Array<{ venue: string; share: number; amountOut: number | null }> {
  const consumed = new Set<number>()
  const legs: Array<{
    venue: string
    share: number
    amountOut: number | null
  }> = []

  plan.forEach((first, index) => {
    if (consumed.has(index)) return
    if (first.swapInfo?.inputMint !== inputMint) return
    consumed.add(index)

    const venues: Array<string> = []
    let current = first
    let guard = 0
    // Bounded by the plan length: a cycle in the mint chain would otherwise
    // walk forever on a payload we do not control.
    while (guard++ <= plan.length) {
      venues.push(current.swapInfo?.label ?? current.swapInfo?.ammKey ?? '')
      const nextIndex = plan.findIndex(
        (hop, i) =>
          !consumed.has(i) &&
          hop.swapInfo?.inputMint !== undefined &&
          hop.swapInfo.inputMint === current.swapInfo?.outputMint,
      )
      if (nextIndex === -1) break
      consumed.add(nextIndex)
      current = plan[nextIndex]!
    }

    const firstIn = toNumber(first.swapInfo?.inAmount)
    legs.push({
      venue: venues.filter((v) => v.length > 0).join(' → '),
      share: totalIn > 0 && firstIn !== null ? firstIn / totalIn : 0,
      amountOut:
        current.swapInfo?.outAmount === undefined
          ? null
          : descale(current.swapInfo.outAmount, outputDecimals),
    })
  })

  return legs
    .filter((leg) => leg.venue.length > 0)
    .sort((a, b) => b.share - a.share)
}

/**
 * Fold a quote into the legs the route pane draws. See buildJupiterLegs for
 * why the plan's own `percent` is not the split.
 */
export function summarizeJupiterQuote(
  quote: JupiterQuote,
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
  const amountIn = descale(quote.inAmount, opts.inputDecimals)
  const amountOut = descale(quote.outAmount, opts.outputDecimals)

  const plan = (quote.routePlan ?? []) as Array<JupiterRoutePlanLeg>
  const legs = buildJupiterLegs(
    plan,
    quote.inputMint,
    toNumber(quote.inAmount) ?? 0,
    opts.outputDecimals,
  )

  return {
    market: opts.market,
    pair: opts.pair,
    side: opts.side,
    amountIn,
    amountOut,
    inputSymbol: opts.inputSymbol,
    outputSymbol: opts.outputSymbol,
    // Jupiter prices neither leg in USD. It states the impact directly, which
    // is the number we want anyway.
    amountInUsd: null,
    amountOutUsd: null,
    priceImpact: parsePriceImpact(quote.priceImpactPct),
    executionPrice: amountIn > 0 ? amountOut / amountIn : null,
    // Solana fees are a base fee plus a priority fee decided at send time, and
    // the quote states neither. Left null rather than guessed.
    gasUsd: null,
    legs,
    source: 'jupiter',
    ts: opts.now ?? Date.now(),
  }
}

/** Slippage sent with a preview quote. Never signs, so it only shapes the min-out. */
const PREVIEW_SLIPPAGE_BPS = 50

export async function quoteSwapRoute(opts: {
  market: string
  pair: string
  side: 'buy' | 'sell'
  /** Size in INPUT-token units — buy spends quote, sell spends base. */
  size: string
}): Promise<SwapRouteQuote | null> {
  const [base, quote] = opts.pair.split('-')
  if (!base || !quote) return null

  const inputToken = await resolveToken(opts.side === 'buy' ? quote : base)
  const outputToken = await resolveToken(opts.side === 'buy' ? base : quote)
  if (!inputToken || !outputToken) return null

  const scaled = scaleAmount(opts.size, inputToken.decimals)
  if (scaled <= 0n) return null

  const jupQuote = await getQuote(
    opts.pair,
    opts.side,
    scaled.toString(),
    PREVIEW_SLIPPAGE_BPS,
  )
  if (!jupQuote) return null

  return summarizeJupiterQuote(jupQuote, {
    market: opts.market,
    pair: opts.pair,
    side: opts.side,
    inputSymbol: inputToken.symbol,
    outputSymbol: outputToken.symbol,
    inputDecimals: inputToken.decimals,
    outputDecimals: outputToken.decimals,
  })
}
