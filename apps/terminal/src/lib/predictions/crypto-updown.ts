// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The scanner's arithmetic: what a recurring up/down contract is worth if you
 * already hold the spot market it settles against.
 *
 * This is the one thing a crypto terminal can do with these contracts that
 * neither venue's own site can. Kalshi and Polymarket show you a probability
 * and a countdown. They cannot show you the price the contract settles against
 * next to the live tape, because they do not carry the tape — and that
 * comparison is the entire trade: a fifteen-minute "BTC up" at 72¢ is a
 * different proposition when spot is forty basis points above the target with
 * eight minutes left than when it is one basis point above with thirty seconds
 * left.
 *
 * So every row here carries four numbers the venue does not publish together:
 * the settlement reference, live spot, the distance between them, and what a
 * plain diffusion model makes of that distance in the time remaining. The last
 * one is a REFERENCE, not a recommendation — it assumes a driftless
 * lognormal walk at recent realized volatility, and it knows nothing about
 * fees, the spread, funding, or the fact that a fifteen-minute crypto window
 * is not lognormal. It is here because a probability with nothing to compare
 * it against is a number you can only agree with.
 *
 * Pure functions over plain data, no React and no I/O: the same reason the
 * strategy engine is shaped this way, and it is what lets the model be tested
 * against closed-form cases rather than against a rendered pane.
 */

import type {
  PredictionEventSummary,
  PredictionUpDown,
  PredictionUpDownHorizon,
} from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'

/** Bars of hourly history behind the volatility estimate. */
export const VOL_SAMPLE_BARS = 120

/** Milliseconds in a year, for the diffusion model's time-to-expiry. */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** Hourly bars in a year, for annualising an hourly standard deviation. */
const BARS_PER_YEAR = 365 * 24

export type UpDownReferenceState =
  /** The venue published the number. */
  | 'venue'
  /** Read off the settlement candle. */
  | 'candle'
  /** The candle has been asked for and has not arrived. */
  | 'pending'
  /** No venue here carries the settlement pair, so the row runs without it. */
  | 'unavailable'

export type UpDownRow = {
  /** Stable across refetches: the window is the identity, not its position. */
  key: string
  /** Connector market id — 'kalshi', 'polymarket'. */
  venue: string
  venueLabel: string
  event: PredictionEventSummary
  meta: PredictionUpDown
  /** ms until settlement; negative once the window has closed. */
  msToClose: number
  /** The settlement reference, whatever its provenance. */
  reference?: number
  referenceState: UpDownReferenceState
  /** Live spot on the pair the contract settles against. */
  spot?: number
  /** Spot over reference, as a signed fraction: 0.004 is forty basis points up. */
  drift?: number
  /** What the market pays for Up, 0..1. */
  marketUp?: number
  /** What a driftless diffusion at `sigma` makes of the same window. */
  modelUp?: number
  /** `modelUp - marketUp`, in probability points. Positive means Up looks cheap. */
  edge?: number
  /** Annualised realized volatility behind `modelUp`. */
  sigma?: number
}

/**
 * One row per contract family, showing the window that is actually trading.
 *
 * The venues answer with a ladder of future windows — gamma returns the next
 * eight hourly BTC contracts, and all but the first sit at exactly 0.500 with
 * no book, because nobody trades a window that opens in six hours. Listing
 * them all would push the one live contract per asset off the top of the board
 * behind seven placeholders quoting a coin flip.
 *
 * So the default is the soonest-closing window per (venue, asset, horizon),
 * which is always the one being traded, and `showAll` is the escape hatch for
 * someone laddering the day out. Rows already closed are dropped here as well
 * as in the connector: a fifteen-minute window expires while the board is on
 * screen, and the fetch behind it is a minute old.
 */
export function collectUpDownRows(
  results: Array<{
    market: string
    label: string
    events: Array<PredictionEventSummary>
  }>,
  now: number,
  showAll = false,
): Array<UpDownRow> {
  const rows: Array<UpDownRow> = []
  const nearest = new Map<string, UpDownRow>()

  for (const result of results) {
    for (const event of result.events) {
      const meta = event.upDown
      if (!meta) continue
      const msToClose = meta.closesMs - now
      if (msToClose <= 0) continue
      const row: UpDownRow = {
        key: `${result.market}:${event.id}`,
        venue: result.market,
        venueLabel: result.label,
        event,
        meta,
        msToClose,
        referenceState: meta.referenceBasis === 'venue' ? 'venue' : 'pending',
        ...(meta.referencePrice !== undefined
          ? { reference: meta.referencePrice }
          : {}),
        ...(meta.up.price !== undefined ? { marketUp: meta.up.price } : {}),
      }
      rows.push(row)
      const family = `${result.market}:${meta.asset}:${meta.horizon}`
      const held = nearest.get(family)
      if (!held || row.msToClose < held.msToClose) nearest.set(family, row)
    }
  }

  const kept = showAll ? rows : [...nearest.values()]
  return kept.sort(compareRows)
}

/**
 * Soonest first, then by asset so the board does not reshuffle every second.
 *
 * The tiebreak matters more than it looks: Kalshi opens all five of its
 * fifteen-minute windows on the same boundary, so five rows share a close time
 * to the millisecond and a sort on that alone would leave their order to
 * whichever venue call returned first.
 */
function compareRows(a: UpDownRow, b: UpDownRow): number {
  if (a.msToClose !== b.msToClose) return a.msToClose - b.msToClose
  if (a.meta.asset !== b.meta.asset)
    return a.meta.asset.localeCompare(b.meta.asset)
  return a.venue.localeCompare(b.venue)
}

/**
 * Fill in everything that needs the spot market: the reference the venue only
 * described, live spot, the distance, and the model.
 *
 * Kept separate from `collectUpDownRows` because the two have different
 * lifetimes. The rows come from a minute-old fetch; spot ticks, the candle
 * behind a reference arrives late, and the countdown moves every second. Recomputing
 * the whole board on each of those is cheap — thirteen rows — and a row that
 * carried a stale model beside a live countdown would be lying about the one
 * thing it exists to show.
 */
export function priceRow(
  row: UpDownRow,
  spot: number | undefined,
  candles: Array<Candle> | undefined,
  candlesState: 'pending' | 'ready' | 'unavailable',
): UpDownRow {
  const reference = resolveReference(row, candles, candlesState)
  const sigma = candles ? realizedVolatility(candles) : undefined
  const priced: UpDownRow = {
    ...row,
    ...reference,
    ...(spot !== undefined ? { spot } : {}),
    ...(sigma !== undefined ? { sigma } : {}),
  }

  if (
    priced.reference === undefined ||
    priced.spot === undefined ||
    sigma === undefined
  ) {
    return priced
  }

  const modelUp = modelUpProbability({
    spot: priced.spot,
    reference: priced.reference,
    msToClose: priced.msToClose,
    sigma,
  })
  return {
    ...priced,
    drift: priced.spot / priced.reference - 1,
    ...(modelUp !== undefined ? { modelUp } : {}),
    ...(modelUp !== undefined && priced.marketUp !== undefined
      ? { edge: modelUp - priced.marketUp }
      : {}),
  }
}

/**
 * The settlement reference, from the venue or from the candle it named.
 *
 * The candle case wants the bar that OPENS at `opensMs`, not the nearest one:
 * Polymarket settles the hourly contract against "the open price for the
 * BTC/USDT 1 hour candle that begins on the time and date specified in the
 * title", and picking a neighbouring bar because the exact one has not
 * arrived yet would state a reference the contract does not use. A miss stays
 * unresolved and the row renders without a distance column.
 */
function resolveReference(
  row: UpDownRow,
  candles: Array<Candle> | undefined,
  candlesState: 'pending' | 'ready' | 'unavailable',
): Pick<UpDownRow, 'reference' | 'referenceState'> {
  if (row.meta.referenceBasis === 'venue') {
    return row.reference !== undefined
      ? { reference: row.reference, referenceState: 'venue' }
      : { referenceState: 'unavailable' }
  }
  if (candlesState === 'unavailable') return { referenceState: 'unavailable' }
  if (!candles) return { referenceState: 'pending' }
  const bar = candles.find((c) => c.ts === row.meta.opensMs)
  if (!bar) return { referenceState: 'pending' }
  return { reference: bar.open, referenceState: 'candle' }
}

/**
 * Annualised realized volatility from hourly closes.
 *
 * The population standard deviation of log returns, scaled by the square root
 * of bars per year. Deliberately plain: an EWMA or a GARCH fit would be a
 * better forecast and a worse thing to put behind a number a user is asked to
 * trade against, because neither can be checked by eye against the chart in
 * the next pane.
 *
 * Returns undefined rather than zero on a short or flat sample. Zero
 * volatility makes the model answer 0 or 1 with total confidence, which is the
 * single most dangerous output this file could produce.
 */
export function realizedVolatility(candles: Array<Candle>): number | undefined {
  if (candles.length < 24) return undefined
  const returns: Array<number> = []
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1].close
    const current = candles[i].close
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous))
  }
  if (returns.length < 20) return undefined
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
  const sigma = Math.sqrt(variance * BARS_PER_YEAR)
  return sigma > 0 ? sigma : undefined
}

/**
 * The probability spot finishes above the reference, under a driftless
 * lognormal walk.
 *
 * `N(d2)` from Black-Scholes with a zero rate — a binary that pays one unit
 * when `S_T > K` is worth exactly that. Zero drift is the honest assumption
 * over a fifteen-minute window: any expected return small enough to be real is
 * swamped by `sigma * sqrt(tau)` at this horizon, and putting a view in here
 * would smuggle a forecast into a column presented as arithmetic.
 *
 * The `-sigma^2 * tau / 2` term is the lognormal median correction. It is
 * negligible at fifteen minutes and worth about a point on a daily window, so
 * it stays rather than being dropped as small.
 */
export function modelUpProbability({
  spot,
  reference,
  msToClose,
  sigma,
}: {
  spot: number
  reference: number
  msToClose: number
  sigma: number
}): number | undefined {
  if (!(spot > 0) || !(reference > 0) || !(sigma > 0)) return undefined
  const tau = msToClose / YEAR_MS
  // A window in its last seconds is not a diffusion problem any more, and
  // dividing by a vanishing sigma*sqrt(tau) turns a rounding error in spot
  // into a confident 0 or 100.
  if (!(tau > 0)) return undefined
  const vol = sigma * Math.sqrt(tau)
  if (!(vol > 1e-9)) return undefined
  const d2 = (Math.log(spot / reference) - (sigma * sigma * tau) / 2) / vol
  return normalCdf(d2)
}

/**
 * The standard normal CDF.
 *
 * Zelen & Severo 26.2.17 — five terms, absolute error below 7.5e-8, which is
 * three orders of magnitude finer than the cent Kalshi quotes in. Written out
 * rather than pulled from a dependency because it is nine lines and the
 * alternative is a stats package in the terminal bundle.
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-z * z)
  return 0.5 * (1 + sign * y)
}

/**
 * A countdown as a clock rather than a phrase.
 *
 * `formatTimeUntil` rounds to the minute, which is the right granularity for a
 * contract settling in March and useless for one settling in ninety seconds —
 * it prints "in 1m" for anything from 61 to 119 seconds, on a board whose
 * whole point is the last few minutes of a window. Digits and colons need no
 * translation, so this stays out of the locale files.
 */
export function formatWindowCountdown(msRemaining: number): string {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return '0:00'
  const total = Math.floor(msRemaining / 1000)
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600) % 24
  const days = Math.floor(total / 86_400)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (days > 0) return `${days}d ${hours}:${pad(minutes)}`
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

/** Horizons in the order a board should offer them: fastest first. */
export const UPDOWN_HORIZONS: Array<PredictionUpDownHorizon> = [
  '15m',
  'hourly',
  'daily',
]

/**
 * How urgent a window is, for the row's own emphasis.
 *
 * Under a minute a fifteen-minute contract is effectively decided and the
 * countdown is the only thing on the row still moving; under five it is the
 * thing a trader is watching. Anything further out is furniture.
 */
export function urgencyOf(msToClose: number): 'closing' | 'soon' | 'open' {
  if (msToClose <= 60_000) return 'closing'
  if (msToClose <= 5 * 60_000) return 'soon'
  return 'open'
}

/** The distinct settlement pairs a set of rows needs quotes and candles for. */
export function spotPairsOf(rows: Array<UpDownRow>): Array<string> {
  return [...new Set(rows.map((r) => r.meta.spotPair))].sort()
}
