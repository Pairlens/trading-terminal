// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One window, watched rather than scanned.
 *
 * The board beside this answers "which of thirteen open windows is mispriced",
 * and a table is the right shape for that. It is the wrong shape for the
 * question people actually open these contracts with, which is "is BTC going to
 * be above 71,860 in four minutes" — a question with two numbers, a clock and a
 * direction, and no comparison in it at all. Read as a table it is eight columns
 * of small type; read as a card it is a line approaching a line.
 *
 * What this card can show that neither venue can is the same thing the scanner
 * could: the settlement reference beside the live tape. What it adds is that the
 * tape is actually live here. The scanner prices off bulk ticker snapshots on a
 * sixty-second REST cadence, which is fine for ranking thirteen rows and useless
 * in the last minute of a fifteen-minute window — so the focused asset, and only
 * the focused asset, gets a real ticker subscription and a real trade feed.
 * Swapping assets swaps the subscription, which is what keeps that affordable.
 *
 * Render discipline. The ticker context ticks several times a second and this
 * card reads it directly, which is allowed because the price readout IS the
 * subject and the card is a leaf. What must not follow the tick is the CHART:
 * its path is rebuilt from the whole series, so live samples enter on a
 * one-second timer through `appendSample`, which hands back the same array when
 * the price has not moved and lets React bail out of the render entirely.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { PredictionUpDownLeg } from '@pairlens/shared/instrument-types'
import type { Candle } from '@pairlens/shared/types'
import type { SpotPoint } from '@/lib/predictions/updown-focus'
import type { UpDownRow } from '@/lib/predictions/crypto-updown'
import { UpDownLiveChart } from '@/components/predictions/updown-live-chart'
import { UpDownTape } from '@/components/predictions/updown-tape'
import {
  useUpDownMinuteCandles,
  useUpDownSpotVenue,
} from '@/hooks/use-crypto-updown'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { useTradesStream } from '@/hooks/use-trades-stream'
import {
  formatWindowCountdown,
  urgencyOf,
} from '@/lib/predictions/crypto-updown'
import {
  SAMPLE_MS,
  appendSample,
  chartStart,
  payoutMultiple,
  seedSeries,
  seriesBounds,
  sideOfTarget,
  windowProgress,
} from '@/lib/predictions/updown-focus'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { formatPredictionPrice, formatPrice } from '@/lib/format-price'
import { track } from '@/lib/analytics-events'

/** Clock labels under the chart. Four fits a docked pane without colliding. */
const AXIS_TICKS = 4

export function UpDownFocusCard({ row, now }: { row: UpDownRow; now: number }) {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const spotVenue = useUpDownSpotVenue()

  const pair = row.meta.spotPair
  const { ticker } = useTickerStream({
    market: spotVenue.market,
    pairKey: pair,
  })
  const { trades } = useTradesStream({
    market: spotVenue.market,
    pairKey: pair,
  })
  const candles = useUpDownMinuteCandles(pair, spotVenue.market)

  // The streaming price wins over the bulk snapshot the scanner priced from:
  // the snapshot is up to a minute old, and the last minute is the whole game.
  const spot = ticker?.last ?? row.spot
  const reference = row.reference
  const side = sideOfTarget(spot, reference)

  const from = chartStart(row, now)
  const series = useSpotSeries(row, candles, ticker?.last ?? null)

  const bounds = useMemo(
    () => seriesBounds(series, reference),
    [series, reference],
  )

  const ticks = useMemo(() => {
    const out: Array<{ ts: number; label: string }> = []
    for (let i = 0; i < AXIS_TICKS; i += 1) {
      const ts = from + ((now - from) * i) / (AXIS_TICKS - 1)
      out.push({ ts, label: clockLabel(ts) })
    }
    return out
  }, [from, now])

  const delta =
    spot !== undefined && reference !== undefined ? spot - reference : undefined
  const deltaPct =
    delta !== undefined && reference ? delta / reference : undefined

  const openLeg = (leg: PredictionUpDownLeg) => {
    track('prediction_updown_opened', {
      venue: row.venue,
      horizon: row.meta.horizon,
      hasModel: row.modelUp !== undefined,
      view: 'focus',
    })
    // Straight to the leg where the event publishes one, which is what the
    // venues' own Up/Down buttons do. A market the summary did not carry falls
    // back to the question rather than guessing a key the connector must serve.
    const market = row.event.markets.find((m) => m.id === row.meta.marketId)
    if (market) {
      select.select({
        venue: row.venue,
        event: row.event,
        market,
        pairKey: leg.pairKey,
        label: leg.label,
        surface: 'board',
      })
      return
    }
    select.openEvent({ venue: row.venue, event: row.event })
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 pb-2">
          <div className="flex items-start gap-5">
            <Stat
              label={t('cryptoUpDown.focus.toBeat')}
              sub={t('cryptoUpDown.focus.settlesOn', {
                source: row.meta.settlementSource,
              })}
              value={
                reference === undefined
                  ? '–'
                  : `${row.meta.referenceExact ? '' : '≈'}${formatPrice(reference)}`
              }
            />
            <Stat
              label={t('cryptoUpDown.focus.now')}
              sub={
                delta === undefined
                  ? spotVenue.label
                  : `${signedDelta(delta, reference)} (${signedPct(deltaPct)})`
              }
              subTone={
                delta === undefined ? 'muted' : delta >= 0 ? 'up' : 'down'
              }
              tone={
                side === 'below' ? 'down' : side === 'above' ? 'up' : 'muted'
              }
              value={spot === undefined ? '–' : formatPrice(spot)}
            />
          </div>

          <Countdown
            msToClose={row.msToClose}
            progress={windowProgress(row, now)}
          />
        </div>

        <UpDownLiveChart
          bounds={bounds}
          fromMs={from}
          points={series}
          reference={reference}
          referenceExact={row.meta.referenceExact}
          side={side}
          ticks={ticks}
          toMs={now}
        />
      </div>

      <div className="flex w-[190px] shrink-0 flex-col gap-1.5">
        <SideButton
          leg={row.meta.up}
          onSelect={() => openLeg(row.meta.up)}
          price={row.marketUp}
          side="up"
        />
        <SideButton
          leg={row.meta.down}
          onSelect={() => openLeg(row.meta.down)}
          price={downPrice(row)}
          side="down"
        />

        <ModelStrip row={row} />

        <div className="min-h-0 flex-1 overflow-hidden">
          <UpDownTape trades={trades} venueLabel={spotVenue.label} />
        </div>
      </div>
    </div>
  )
}

// ── Live series ───────────────────────────────────────────────────────

/**
 * The chart's series: minute candles for the shape, live samples for the edge.
 *
 * Seeded ONCE per window rather than on every candle refetch. The minute query
 * refreshes on the minute and re-seeding from it would throw away the
 * finer-grained live samples taken since — the exact points the last minute of a
 * window is read for.
 */
function useSpotSeries(
  row: UpDownRow,
  candles: Array<Candle> | undefined,
  live: number | null,
): Array<SpotPoint> {
  const [series, setSeries] = useState<Array<SpotPoint>>([])
  const seeded = useRef<string | null>(null)

  // Refs so the sampling timer is installed once. A dependency on the price
  // would rebuild the interval on every tick, which is the one thing that
  // would let tape rate back into the chart.
  const liveRef = useRef(live)
  liveRef.current = live
  const rowRef = useRef(row)
  rowRef.current = row

  // Declared FIRST so a window change clears before the seed below refills.
  useEffect(() => {
    seeded.current = null
    setSeries([])
  }, [row.key])

  useEffect(() => {
    if (!candles || candles.length === 0) return
    if (seeded.current === row.key) return
    seeded.current = row.key
    const at = Date.now()
    setSeries(seedSeries(candles, chartStart(row, at), at))
    // `row` is read wholesale here but only `key` and the window bounds can
    // change without a new key, and both arrive with it.
  }, [candles, row])

  useEffect(() => {
    const timer = setInterval(() => {
      const price = liveRef.current
      if (price === null || !Number.isFinite(price)) return
      const at = Date.now()
      setSeries((prev) =>
        appendSample(prev, { ts: at, price }, chartStart(rowRef.current, at)),
      )
    }, SAMPLE_MS)
    return () => clearInterval(timer)
  }, [])

  return series
}

// ── Pieces ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  tone = 'muted',
  subTone = 'muted',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'muted' | 'up' | 'down'
  subTone?: 'muted' | 'up' | 'down'
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'font-mono text-lg leading-tight font-semibold tabular-nums',
          tone === 'up' && 'text-up',
          tone === 'down' && 'text-down',
        )}
      >
        {value}
      </p>
      {sub ? (
        <p
          className={cn(
            'truncate font-mono text-[10px] tabular-nums',
            subTone === 'up' && 'text-up',
            subTone === 'down' && 'text-down',
            subTone === 'muted' && 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The clock, and how much of the window it has eaten.
 *
 * The bar is the part the table could not carry: "4:31 left" means one thing on
 * a fifteen-minute contract and another on a daily one, and the fill says which
 * without a second number.
 */
function Countdown({
  msToClose,
  progress,
}: {
  msToClose: number
  progress: number
}) {
  const { t } = useTranslation()
  const urgency = urgencyOf(msToClose)

  return (
    <div className="w-[104px] shrink-0 text-right">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {t('cryptoUpDown.focus.closesIn')}
      </p>
      <p
        className={cn(
          'font-mono text-lg leading-tight font-semibold tabular-nums',
          urgency === 'closing' && 'text-down',
          urgency === 'soon' && 'text-foreground',
          urgency === 'open' && 'text-muted-foreground',
        )}
      >
        {formatWindowCountdown(msToClose)}
      </p>
      <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-linear',
            urgency === 'closing' ? 'bg-down' : 'bg-muted-foreground/60',
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * One side of the contract, priced the way a venue prices it: the probability
 * in cents, and what it pays if it lands.
 *
 * The fill behind the label is the probability itself, so the two buttons read
 * as a split of one bar without being one — which they must not be, because the
 * two prices are quoted independently and rarely sum to exactly a dollar.
 */
function SideButton({
  side,
  leg,
  price,
  onSelect,
}: {
  side: 'up' | 'down'
  leg: PredictionUpDownLeg
  price: number | undefined
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const up = side === 'up'
  const Icon = up ? ArrowUp : ArrowDown
  const multiple = payoutMultiple(price)

  return (
    <button
      className={cn(
        'group relative overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors',
        up ? 'bg-up/10 hover:bg-up/18' : 'bg-down/10 hover:bg-down/18',
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 transition-[width] duration-500',
          up ? 'bg-up/18' : 'bg-down/18',
        )}
        style={{ width: `${Math.round((price ?? 0) * 100)}%` }}
      />
      <span className="relative flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider',
            up ? 'text-up' : 'text-down',
          )}
        >
          <Icon aria-hidden="true" className="size-3" />
          {leg.label}
        </span>
        <span
          className={cn(
            'font-mono text-base leading-none font-semibold tabular-nums',
            up ? 'text-up' : 'text-down',
          )}
        >
          {price === undefined ? '–' : formatPredictionPrice(price)}
        </span>
      </span>
      <span className="relative mt-0.5 block font-mono text-[9px] tabular-nums text-muted-foreground">
        {multiple === undefined
          ? t('cryptoUpDown.focus.noBook')
          : t('cryptoUpDown.focus.payout', { value: multiple.toFixed(2) })}
      </span>
    </button>
  )
}

/**
 * The model, kept but demoted.
 *
 * It is still the thing neither venue can print, and it is still not what
 * someone opens this card to read. One line under the buttons, with the
 * volatility that gives the number its meaning attached to it rather than
 * floating in a tooltip on a table cell.
 */
function ModelStrip({ row }: { row: UpDownRow }) {
  const { t } = useTranslation()
  if (row.modelUp === undefined) return null

  return (
    <div className="flex shrink-0 items-baseline justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 font-mono text-[10px] tabular-nums">
      <span className="text-muted-foreground">
        {t('cryptoUpDown.focus.model', {
          value: formatPredictionPrice(row.modelUp),
        })}
      </span>
      {/* The edge is withheld rather than blanked when the venue's quote has
          gone stale, and the strip says which of the two it is: a missing edge
          with no explanation reads as "no disagreement", which is the opposite
          of what a parked poll means. */}
      {row.quoteStale ? (
        <span className="text-muted-foreground/70">
          {t('cryptoUpDown.focus.oddsStale')}
        </span>
      ) : row.edge === undefined ? null : (
        <span className={cn(row.edge >= 0 ? 'text-up' : 'text-down')}>
          {t('cryptoUpDown.focus.edge', {
            value: `${row.edge >= 0 ? '+' : ''}${(row.edge * 100).toFixed(1)}`,
          })}
        </span>
      )}
    </div>
  )
}

// ── Formatting ────────────────────────────────────────────────────────

/**
 * The Down price.
 *
 * Taken from the venue where it quotes one, and derived from Up where it does
 * not — Polymarket quotes both legs, Kalshi's book is one-sided on a decided
 * window. Derived rather than blank because a complement is what the contract
 * IS, and the card would otherwise show a dash beside a 92¢ Up.
 */
function downPrice(row: UpDownRow): number | undefined {
  if (row.meta.down.price !== undefined) return row.meta.down.price
  if (row.marketUp === undefined) return undefined
  return 1 - row.marketUp
}

/**
 * The gap to the target, at the INSTRUMENT's precision rather than its own.
 *
 * `formatPrice` picks decimals from the magnitude of the number it is handed,
 * which is right for a price and wrong for a difference between two: a $171
 * gap on BTC came out as `$171.8100`, four decimals of noise on a number whose
 * last two digits are already below anything a fifteen-minute window turns on.
 * The scale that decides the precision is the price the gap is measured
 * against, so that is what is asked.
 */
function signedDelta(value: number, scale: number | undefined): string {
  const sign = value >= 0 ? '+' : '−'
  const magnitude = Math.abs(value)
  const level = scale === undefined ? magnitude : Math.abs(scale)
  const decimals = level >= 1000 ? 2 : level >= 1 ? 4 : 6
  return `${sign}$${magnitude.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

function signedPct(fraction: number | undefined): string {
  if (fraction === undefined) return '–'
  const percent = fraction * 100
  return `${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(3)}%`
}

/** `14:35`, in the reader's own locale and clock convention. */
function clockLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}
