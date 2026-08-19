// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A prediction event, rendered for a reader that cannot see the board.
 *
 * Two callers, one shape. The desk's assistant surface publishes a trimmed
 * version every turn so the model knows what question is on screen without
 * being asked, and `get_prediction_event` returns a wide version when the
 * model actually reaches for the numbers. Sharing the renderer is what keeps
 * the two from disagreeing about what a runner is worth, which on a field of
 * 128 candidates is not a difference anyone would notice until it mattered.
 *
 * Prices leave here as PROBABILITIES in collateral units (0..1), exactly as
 * the venue publishes them, with the percentage stated alongside rather than
 * substituted: the ladder shows cents, an order is priced in collateral, and a
 * model handed only "19.5" has to guess which of the two it is holding.
 */
import type { PredictionRunner } from '@/lib/predictions/race'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'
import {
  eventOverround,
  isRaceEvent,
  runnersOf,
  topRunnerShare,
} from '@/lib/predictions/race'

/**
 * Runners in the screen block.
 *
 * Six, and without their pair keys, because the block is capped at 1200
 * characters and a Polymarket outcome key is a hundred and ten of them: eight
 * full runners overflowed the cap and the model was handed JSON cut off
 * mid-token. The keys are one `get_prediction_event` away; a truncated screen
 * block is not recoverable at all.
 */
export const SURFACE_RUNNERS = 6
/** Runners in a tool result. A 128-runner race still fits its own shape. */
export const TOOL_RUNNERS = 60

export type RunnerReading = {
  label: string
  /** The key an order, a book and a chart address. */
  pairKey: string
  /** Probability in collateral units, 0..1. */
  yes: number | null
  yesPercent: number | null
  bid: number | null
  ask: number | null
  /** Signed 24h move for this outcome, in collateral units. */
  change24h: number | null
  /** The complement's key, when the venue publishes one. */
  noPairKey: string | null
  noPrice: number | null
  volume: number | null
  status: string | null
}

function num(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Whole units, for the figures nobody reads to six decimal places. */
function round(value: number | undefined | null): number | null {
  const parsed = num(value)
  return parsed === null ? null : Math.round(parsed)
}

function readRunner(runner: PredictionRunner): RunnerReading {
  const yes = num(runner.yes.price)
  return {
    label: runner.label,
    pairKey: runner.yes.pairKey,
    yes,
    yesPercent: yes === null ? null : Math.round(yes * 1000) / 10,
    bid: num(runner.yes.bid),
    ask: num(runner.yes.ask),
    change24h: num(runner.yes.change24h),
    noPairKey: runner.no?.pairKey ?? null,
    noPrice: num(runner.no?.price),
    volume: round(runner.market.volume),
    status: runner.market.status ?? null,
  }
}

/** Highest Yes price first. An unpriced runner sinks rather than leads. */
function byFavourite(a: RunnerReading, b: RunnerReading): number {
  return (b.yes ?? -1) - (a.yes ?? -1)
}

export type EventReading = ReturnType<typeof readPredictionEvent>

/**
 * The whole event as data.
 *
 * `limit` trims the LADDER, never the counts: a reader told about eight of a
 * hundred and twenty-eight runners is reading a different market from one told
 * about eight, so the total rides out alongside every trim.
 */
export function readPredictionEvent(
  event: PredictionEventSummary,
  limit = TOOL_RUNNERS,
) {
  const runners = runnersOf(event)
  const readings = runners.map(readRunner).sort(byFavourite)
  const isRace = isRaceEvent(event)
  // Gated on the shape, exactly as the header is. A binary market's two
  // legs sum to a dollar by construction, so `eventOverround` answers 1.0
  // for one and reporting it would state a fair field as a finding.
  const overround = isRace ? eventOverround(runners) : null

  return {
    eventId: event.id,
    venue: event.market,
    title: event.title,
    category: event.category ?? null,
    resolvesAt: event.endMs ? new Date(event.endMs).toISOString() : null,
    // Whole units. A venue reporting 1262027209.194081 is reporting noise
    // past the decimal point, and it is noise the model pays for.
    volume: round(event.volume),
    liquidity: round(event.liquidity),
    outcomeCount: runners.length,
    isRace,
    /**
     * What the whole field costs. Races only: on a binary market the two
     * legs sum to a dollar by construction, and reporting that as a reading
     * would invent an edge where there is none.
     */
    fieldTotal: overround
      ? {
          sumOfYesPrices: Math.round(overround.total * 1000) / 1000,
          /** Positive is an over-round field: buying every answer loses. */
          edge: Math.round(overround.edge * 1000) / 1000,
          basis: overround.basis,
          pricedRunners: overround.counted,
          unpricedRunners: overround.missing,
        }
      : null,
    topFourShare: isRace ? topRunnerShare(runners, 4) : null,
    runners: readings.slice(0, limit),
    runnersShown: Math.min(limit, readings.length),
    truncated: readings.length > limit,
    /** The venue's own resolution criteria, per market. Prose, not a URL. */
    rules: runners
      .map((runner) => runner.market.rules)
      .find((rules): rules is string => Boolean(rules && rules.trim() !== '')),
  }
}

/** One line of prose for the screen block. */
export function describePredictionEvent(
  reading: EventReading,
  selected: { label: string; pairKey: string; price: number | null } | null,
): string {
  const parts = [
    `The user is looking at the prediction event "${reading.title}" on ${reading.venue}`,
  ]
  parts.push(
    reading.isRace
      ? `, a ${reading.outcomeCount}-outcome field`
      : ', a binary market',
  )
  if (reading.resolvesAt) parts.push(`, resolving ${reading.resolvesAt}`)
  parts.push('.')
  if (selected) {
    const at =
      selected.price === null ? '' : ` at ${(selected.price * 100).toFixed(1)}¢`
    parts.push(
      ` The book, the tape and the order ticket are pointed at "${selected.label}"${at} (pair key ${selected.pairKey}). That is what "this" means here, and it is the key place_order takes.`,
    )
  }
  parts.push(
    ' Prices are probabilities in collateral units (0 to 1); the UI shows them as cents.',
  )
  return parts.join('')
}
