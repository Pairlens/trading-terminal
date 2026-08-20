// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The recurring crypto up/down slate: `market-data:events` with
 * `preset: 'crypto-updown'`.
 *
 * Both venues run a permanent conveyor of "will BTC close higher than it
 * opened" contracts — Kalshi a fifteen-minute window on five assets,
 * Polymarket an hourly and a daily one on four — and neither publishes them as
 * anything a query or a category can reach. Each one is its own SERIES, and a
 * series is a venue-native scope: `series_ticker` on Kalshi, `series_slug` on
 * gamma. So the slate is a declared list rather than a search, the connector
 * fans out over it, and the union comes back as ordinary events carrying the
 * one extra thing a scanner needs: `upDown`.
 *
 * Three facts shape the classifier, all measured against both live APIs on
 * 2026-08-20:
 *
 * - **The reference price is published on one venue and described on the
 *   other.** Kalshi states it as `floor_strike` ("Target Price: $69,506.94")
 *   and settles on the CF Benchmarks index. Polymarket states a CANDLE — "the
 *   open price for the BTC/USDT 1 hour candle that begins on the time and date
 *   specified in the title", resolution source Binance — and no number at all.
 *   So the meta carries a basis rather than a number, and a terminal holding a
 *   Binance feed reads the second case itself.
 * - **Kalshi does not price its outcomes on this path.** ccxt's
 *   `parseEventToMarkets` leaves the outcome `price` undefined on a Kalshi
 *   market even where the venue payload carries `last_price_dollars` and both
 *   sides of the book, so the legs are priced from `info` here. Polymarket
 *   fills the unified field and needs none of it. One extra request per row
 *   was the alternative, on a board that is all rows.
 * - **A closed window keeps answering.** Gamma's listing is ordered by volume
 *   and happily returns a three-month-old window that never flipped `closed`,
 *   so every row is filtered against the clock before it is returned. Without
 *   it the busiest thing on the board is a contract that settled in May.
 */

import type {
  PredictionEventSummary,
  PredictionUpDown,
  PredictionUpDownHorizon,
  PredictionUpDownLeg,
  PredictionUpDownReferenceBasis,
} from '@pairlens/shared/instrument-types'
import type { PredictionExchangeLike } from './types'

/**
 * One recurring contract family on one venue.
 *
 * Everything the classifier cannot read off a payload is stated here, because
 * the connector KNOWS which series it asked for. Nothing parses a title: a
 * venue that renames "Solana 15 minutes" to "SOL 15 min" breaks a title parser
 * and does not touch this.
 */
export type UpDownSeriesSpec = {
  /** Base asset the contract settles on. */
  asset: string
  /** Dash-form pair the SETTLEMENT SOURCE quotes — see `PredictionUpDown`. */
  spotPair: string
  horizon: PredictionUpDownHorizon
  /** What the venue names as the source of truth, for display. */
  settlementSource: string
  /** Venue-native scope, forwarded verbatim to the venue's series fetch. */
  scope: Record<string, unknown>
  /** Window length in ms — how far before the close the reference is taken. */
  windowMs: number
  /**
   * Where the reference comes from when the venue publishes no number.
   * Ignored when the payload carries a strike: a stated number always wins
   * over a candle the terminal would have to go and read.
   */
  referenceBasis: PredictionUpDownReferenceBasis
  /** The candle to read, when the basis is `candle-open`. */
  referenceTimeframe?: string
  /** See `PredictionUpDown.referenceExact`. */
  referenceExact: boolean
}

/**
 * Raw events for ONE series, already through the venue's own ccxt parsers —
 * the same shape `fetchEvents` returns, because the projection downstream is
 * the same walk.
 */
export type UpDownSeriesFetch = (
  exchange: PredictionExchangeLike,
  spec: UpDownSeriesSpec,
  limit: number,
) => Promise<Array<Record<string, unknown>>>

export type CryptoUpDownConfig = {
  series: Array<UpDownSeriesSpec>
  fetchSeries: UpDownSeriesFetch
}

/**
 * Windows pulled per series.
 *
 * Small on purpose. A scanner cares about the window that is trading and the
 * one after it; the twenty after that are unpriced placeholders that would
 * push the live row off the board. Eight leaves room for the stale rows the
 * clock filter drops.
 */
export const UPDOWN_SERIES_LIMIT = 8

/** The venue's word for the side that pays when the price goes up. */
const UP_LABELS = new Set(['up', 'yes', 'higher', 'above'])
/** …and for the side that pays when it goes down. */
const DOWN_LABELS = new Set(['down', 'no', 'lower', 'below'])

/**
 * The up/down reading of one event, or null when it is not one.
 *
 * Refuses rather than guesses, in four places: a series that returned a ladder
 * instead of a single question, a market that is not two-sided, a window whose
 * close cannot be read, and a candle-based reference with no candle named.
 * Each of those would produce a row that looks tradeable and is not.
 *
 * `raw` is the ccxt-parsed event and `summary` its projection. Both are needed:
 * the summary carries the pair keys an order addresses, and only the raw event
 * still has the venue payload the strike, the window and the Kalshi prices
 * live in.
 */
export function classifyUpDown(
  raw: Record<string, unknown>,
  summary: PredictionEventSummary,
  spec: UpDownSeriesSpec,
): PredictionUpDown | null {
  const market = summary.markets[0]
  // A ladder is a different product wearing a similar name: Kalshi's hourly
  // "Directional" series is three hundred strikes on one question, and folding
  // its at-the-money row in here would invent an up/down contract the venue
  // does not list.
  if (!market || summary.markets.length !== 1) return null
  if (market.outcomes.length !== 2) return null

  const info = marketInfo(raw)
  const closesMs = num(info['close_time_ms']) ?? isoMs(info['close_time'])
  const close = closesMs ?? market.endMs ?? summary.endMs
  if (close === undefined) return null

  const opens = isoMs(info['open_time']) ?? close - spec.windowMs

  const [first, second] = market.outcomes
  const firstIsUp = sideOf(first.label) !== 'down'
  const upSummary = firstIsUp ? first : second
  const downSummary = firstIsUp ? second : first

  const strike = positive(info['floor_strike'])
  const basis: PredictionUpDownReferenceBasis =
    strike !== undefined ? 'venue' : spec.referenceBasis
  // A reference nobody can read is not a reference, in either direction: a
  // candle basis with no candle named, or a venue basis with no number on the
  // payload. Both would render a blank distance column beside a live
  // probability, which reads as "the market is 4% from its target" rather than
  // "we do not know the target". The second case is Kalshi zero-filling a
  // strike on a market it has not opened.
  if (basis === 'candle-open' && !spec.referenceTimeframe) return null
  if (basis === 'venue' && strike === undefined) return null

  return {
    asset: spec.asset,
    spotPair: spec.spotPair,
    settlementSource: spec.settlementSource,
    horizon: spec.horizon,
    opensMs: opens,
    closesMs: close,
    ...(strike !== undefined ? { referencePrice: strike } : {}),
    referenceBasis: basis,
    ...(basis === 'candle-open'
      ? { referenceTimeframe: spec.referenceTimeframe }
      : {}),
    // A published strike IS the settlement number, whatever the series said it
    // would fall back to.
    referenceExact: basis === 'venue' ? true : spec.referenceExact,
    marketId: market.id,
    up: leg(upSummary, info, 'up'),
    down: leg(downSummary, info, 'down'),
  }
}

/**
 * Which side an outcome label names, or 'unknown'.
 *
 * Both venues label the two sides in their own vocabulary — Polymarket
 * 'Up'/'Down', Kalshi 'YES'/'NO' — and a third venue could ship 'Higher'. What
 * is NOT allowed is a positional guess dressed as a reading, so an unrecognised
 * pair falls back to order at the one call site that can see both labels.
 */
export function sideOf(label: string): 'up' | 'down' | 'unknown' {
  const normalized = label.trim().toLowerCase()
  if (UP_LABELS.has(normalized)) return 'up'
  if (DOWN_LABELS.has(normalized)) return 'down'
  return 'unknown'
}

/**
 * One priced leg.
 *
 * The unified fields win where the venue fills them. Kalshi fills none of them
 * on this path but publishes the whole book on its own payload, so the
 * fallback reads that — and reads the NO side from its own quotes rather than
 * by subtracting the YES side, because `no_bid` and `1 - yes_ask` are the same
 * number only on a book with no spread. The LAST price is the one exception:
 * Kalshi publishes a single trade print, YES-denominated, and a binary's other
 * side did trade at its complement.
 */
function leg(
  outcome: PredictionUpDownLeg,
  info: Record<string, unknown>,
  side: 'up' | 'down',
): PredictionUpDownLeg {
  const prefix = side === 'up' ? 'yes' : 'no'
  const bid = outcome.bid ?? probability(info[`${prefix}_bid_dollars`])
  const ask = outcome.ask ?? probability(info[`${prefix}_ask_dollars`])
  const last = probability(info['last_price_dollars'])
  const venueLast =
    last === undefined ? undefined : side === 'up' ? last : 1 - last
  const price = outcome.price ?? venueLast ?? mid(bid, ask)
  return {
    pairKey: outcome.pairKey,
    label: outcome.label,
    ...(price !== undefined ? { price } : {}),
    ...(bid !== undefined ? { bid } : {}),
    ...(ask !== undefined ? { ask } : {}),
  }
}

function mid(bid: number | undefined, ask: number | undefined) {
  if (bid === undefined || ask === undefined) return undefined
  return (bid + ask) / 2
}

/** The venue payload of the event's first market, or an empty record. */
function marketInfo(raw: Record<string, unknown>): Record<string, unknown> {
  const markets = raw['markets']
  if (!Array.isArray(markets) || markets.length === 0) return {}
  const first = markets[0]
  if (typeof first !== 'object' || first === null) return {}
  const info = (first as Record<string, unknown>)['info']
  return typeof info === 'object' && info !== null
    ? (info as Record<string, unknown>)
    : {}
}

/**
 * A probability in collateral units, or undefined.
 *
 * Refuses anything outside 0..1 rather than clamping. A venue that started
 * quoting cents would otherwise render 72¢ as a certainty, and every model
 * column beside it would be computed against that.
 */
function probability(value: unknown): number | undefined {
  const parsed = num(value)
  if (parsed === undefined || parsed < 0 || parsed > 1) return undefined
  return parsed
}

/**
 * A strike, or undefined.
 *
 * Zero is a refusal, not a price: Kalshi zero-fills numeric fields on a market
 * it has not opened, and a contract "targeting $0" would show every asset as
 * infinitely far above its reference.
 */
function positive(value: unknown): number | undefined {
  const parsed = num(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isoMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Windows still open, soonest to settle first.
 *
 * The clock is the filter, not the venue's own `closed` flag: gamma orders its
 * listing by volume and answers with contracts that settled months ago and
 * were never flipped, which on a board sorted by urgency arrive at the top.
 */
export function openWindows(
  events: Array<PredictionEventSummary>,
  now: number,
): Array<PredictionEventSummary> {
  return events
    .filter((event) => (event.upDown?.closesMs ?? 0) > now)
    .sort((a, b) => (a.upDown?.closesMs ?? 0) - (b.upDown?.closesMs ?? 0))
}
