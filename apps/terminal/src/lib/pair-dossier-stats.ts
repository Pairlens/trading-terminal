// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The arithmetic behind the pair dossier: what the candle buffer says about
 * range and volatility, and what the venue quotes say about where an order
 * should go.
 *
 * The dossier's contract is that every tile is derived from data already on
 * screen — the chart's own candle buffer and the venue ladder's quotes — so
 * opening it costs nothing and nothing on it can disagree with the chart above
 * it. That constraint is also why two obvious tiles are missing: distance from
 * the all-time high and correlation to BTC would each need a second history
 * fetch, and a dossier that quietly opens streams is not a research pane, it
 * is a second chart.
 *
 * The volatility figure is annualised from whatever interval the chart is on,
 * which is why `summarizeVolatility` reports the window it measured. A number
 * that silently changes meaning when the user clicks 4h is the bug this
 * guards against: the caller renders the span beside the figure.
 */
import type { Candle } from '@pairlens/shared/types'
import type { VenueQuote } from '@/hooks/use-venue-quotes'
import { hasRealBook } from '@/lib/venue-spread'

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

export type RangeStats = {
  high: number
  low: number
  /** (high − low) / low, in percent. */
  rangePct: number
  /** Where the reference price sits between low and high, 0..1. */
  position: number | null
  /** Candles the window covers. */
  bars: number
  /** First-to-last timestamp span, in ms. */
  spanMs: number
}

/** The candles at or after `sinceTs`, oldest first. Never mutates the input. */
export function candlesSince(
  candles: ReadonlyArray<Candle>,
  sinceTs: number,
): Array<Candle> {
  const out: Array<Candle> = []
  for (const candle of candles) {
    if (candle.ts >= sinceTs) out.push(candle)
  }
  return out
}

/**
 * High, low and where the current price sits between them.
 *
 * Null rather than a zero-width range when the window is empty or degenerate:
 * a flat range would put the price marker at an arbitrary end of a bar that
 * means nothing.
 */
export function summarizeRange(
  candles: ReadonlyArray<Candle>,
  reference: number | null,
): RangeStats | null {
  if (candles.length === 0) return null

  let high = -Infinity
  let low = Infinity
  for (const candle of candles) {
    if (Number.isFinite(candle.high) && candle.high > high) high = candle.high
    if (Number.isFinite(candle.low) && candle.low > 0 && candle.low < low) {
      low = candle.low
    }
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || low <= 0) return null
  if (high <= low) return null

  const position =
    reference !== null && Number.isFinite(reference)
      ? Math.min(1, Math.max(0, (reference - low) / (high - low)))
      : null

  const first = candles[0]
  const last = candles[candles.length - 1]

  return {
    high,
    low,
    rangePct: ((high - low) / low) * 100,
    position,
    bars: candles.length,
    spanMs: Math.max(0, last.ts - first.ts),
  }
}

export type VolatilityStats = {
  /** Annualised standard deviation of log returns, in percent. */
  annualizedPct: number
  /** Returns the figure was measured over. */
  samples: number
  /** How much history that is, in ms — what the caller labels it with. */
  spanMs: number
}

/**
 * Annualised realised volatility from close-to-close log returns.
 *
 * `barMs` is the chart's interval, which is what turns a per-bar deviation
 * into a per-year one. Needs a real sample — under thirty returns the figure
 * moves more with the window than with the market, so it is withheld rather
 * than printed with a caveat nobody reads.
 */
const MIN_VOLATILITY_SAMPLES = 30

export function summarizeVolatility(
  candles: ReadonlyArray<Candle>,
  barMs: number,
): VolatilityStats | null {
  if (!Number.isFinite(barMs) || barMs <= 0) return null

  const returns: Array<number> = []
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1].close
    const current = candles[i].close
    if (!(previous > 0) || !(current > 0)) continue
    returns.push(Math.log(current / previous))
  }
  if (returns.length < MIN_VOLATILITY_SAMPLES) return null

  let mean = 0
  for (const r of returns) mean += r
  mean /= returns.length

  let sumSquares = 0
  for (const r of returns) sumSquares += (r - mean) ** 2
  const variance = sumSquares / (returns.length - 1)
  const perBar = Math.sqrt(variance)

  const barsPerYear = MS_PER_YEAR / barMs
  return {
    annualizedPct: perBar * Math.sqrt(barsPerYear) * 100,
    samples: returns.length,
    spanMs: returns.length * barMs,
  }
}

export type VenueSpreadBar = {
  market: string
  /** Top-of-book spread in basis points. */
  bps: number
  /** 0..1, the tightest venue at 1 — a bar, not a depth measurement. */
  width: number
}

/**
 * Per-venue top-of-book spread, tightest first.
 *
 * Deliberately NOT depth. A ticker gives a price and no size, so the dollars
 * resting within one percent of the mid are not knowable from this data and
 * are not invented here: what the bars show is how tightly each venue is
 * quoting, which is the part the quotes do support and the part that decides
 * where a modest order goes. Venues without a real two-sided book are absent
 * rather than drawn at zero.
 */
const MIN_BAR_WIDTH = 0.06

export function venueSpreadBars(
  quotes: ReadonlyArray<VenueQuote>,
  limit = 6,
): Array<VenueSpreadBar> {
  const measured: Array<{ market: string; bps: number }> = []
  for (const quote of quotes) {
    if (quote.status !== 'live' || !hasRealBook(quote)) continue
    const mid = (quote.ask + quote.bid) / 2
    if (!(mid > 0) || quote.ask < quote.bid) continue
    measured.push({
      market: quote.market,
      bps: ((quote.ask - quote.bid) / mid) * 10_000,
    })
  }
  if (measured.length === 0) return []

  measured.sort((a, b) => a.bps - b.bps || a.market.localeCompare(b.market))
  const tightest = measured[0].bps

  return measured.slice(0, limit).map((entry) => ({
    market: entry.market,
    bps: entry.bps,
    // Inverse, so a tighter quote draws a longer bar. A zero-width spread
    // (a locked book that slipped through) would divide by nothing, so it
    // simply fills the bar.
    width:
      entry.bps > 0 && tightest > 0
        ? Math.max(MIN_BAR_WIDTH, Math.min(1, tightest / entry.bps))
        : 1,
  }))
}
