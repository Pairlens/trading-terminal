// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto Up/Down — the recurring windows on both venues, priced against the
 * tape they settle on.
 *
 * Kalshi opens a fifteen-minute "will BTC be higher" window on five assets
 * every quarter hour; Polymarket runs an hourly and a daily one on four. They
 * are the busiest contracts either venue lists and they were, until this pane,
 * reachable here only by searching for them by name and landing on one at a
 * time — which is the wrong shape entirely, because the trade is a comparison:
 * five windows close on the same boundary and only one of them is mispriced.
 *
 * TWO shapes, because there are two questions and a table only answers one.
 *
 * **Focus** is the default and it is one window: an asset switcher, the
 * settlement reference against the live tape drawn as a line approaching a
 * line, a countdown with the window's own progress under it, both legs as
 * buttons priced in cents, and the spot prints that will decide it arriving one
 * at a time. That is the question people actually open these contracts with —
 * "is BTC going to be above 71,860 in four minutes" — and it has no comparison
 * in it at all.
 *
 * **Board** is the scanner, unchanged, and it is the comparison: thirteen
 * windows, reference, spot, distance, what the market pays for Up, and what a
 * driftless diffusion at recent realized volatility makes of the same window.
 *
 * Neither venue can draw either one, for the same reason: they do not carry the
 * spot market their own contracts settle against. What Focus adds over Board is
 * that its tape is genuinely live — the scanner prices thirteen rows off bulk
 * ticker snapshots on a sixty-second REST cadence, which is right for ranking
 * and useless in the last minute of a fifteen-minute window, so the focused
 * asset alone gets a real ticker subscription and a real trade feed.
 *
 * Three things the pane refuses to do, all for the same reason:
 *
 *  - **No model column without a reference AND a volatility sample.** A blank
 *    is a fact; a model computed off a missing leg is a number someone will
 *    trade.
 *  - **No stale window.** The rows come from a thirty-second fetch and a
 *    fifteen-minute contract expires while you read it, so the clock filters
 *    every render, not every fetch.
 *  - **No silent approximation.** Polymarket's daily contract settles on a
 *    one-minute close and the terminal reads the hour containing it; that row
 *    marks its reference and the footnote says why.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { OddsMoversSkeleton } from './prediction-skeletons'
import type { UpDownRow } from '@/lib/predictions/crypto-updown'
import type { PredictionUpDownHorizon } from '@pairlens/shared/instrument-types'
import { UpDownFocusCard } from '@/components/predictions/updown-focus-card'
import {
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import {
  useCryptoUpDownWindows,
  useSpotHistories,
} from '@/hooks/use-crypto-updown'
import { usePredictionVenues } from '@/hooks/use-prediction-events'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { formatPredictionPrice, formatPrice } from '@/lib/format-price'
import { track } from '@/lib/analytics-events'
import {
  UPDOWN_HORIZONS,
  collectUpDownRows,
  formatWindowCountdown,
  priceRow,
  spotPairsOf,
  urgencyOf,
} from '@/lib/predictions/crypto-updown'
import { focusAssets, pickFocusRow } from '@/lib/predictions/updown-focus'
import { usePersistedState } from '@/hooks/use-persisted-state'

/**
 * The countdown is the point of the board, so it ticks per second.
 *
 * Safe here in a way it would not be on the chart rails: this pane subscribes
 * to no streaming context, holds a dozen rows, and its whole subject is the
 * last few minutes of a window. Rounding to the minute — which is what
 * `formatTimeUntil` does everywhere else — would print "in 1m" for anything
 * between 61 and 119 seconds.
 */
const TICK_MS = 1_000

export function CryptoUpDownPane() {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const select = usePredictionSelect()
  const quotes = useBulkTickerQuotes()
  const [horizon, setHorizon] = useState<PredictionUpDownHorizon | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Persisted, because which of the two questions someone reads this pane for
  // is a standing preference rather than a per-visit one, and a board rebuilt
  // from a workspace should come back the way it was left.
  const [view, setView] = usePersistedState<'focus' | 'board'>(
    'updown-view',
    'focus',
  )
  const [asset, setAsset] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const { data, isLoading, dataUpdatedAt } = useCryptoUpDownWindows(venues)

  const rows = useMemo(
    () => collectUpDownRows(data ?? [], now),
    // `now` moves every second and the filter it drives is the expiry cut, so
    // a closed window leaves the board on the tick rather than on the fetch.
    [data, now],
  )
  const pairs = useMemo(() => spotPairsOf(rows), [rows])
  const histories = useSpotHistories(pairs)

  const priced = useMemo(
    () =>
      rows
        .filter((row) => horizon === null || row.meta.horizon === horizon)
        .map((row) => {
          const history = histories.get(row.meta.spotPair)
          return priceRow(
            row,
            quotes.get(row.meta.spotPair)?.price,
            history?.candles,
            history?.state ?? 'pending',
            // Ticks every second with `now`, which is what makes a parked poll
            // visible: spot and the clock keep moving, and the age of the
            // quote they are being compared against moves with them.
            dataUpdatedAt > 0 ? now - dataUpdatedAt : undefined,
          )
        }),
    [rows, horizon, histories, quotes, dataUpdatedAt, now],
  )

  const assets = useMemo(() => focusAssets(priced), [priced])
  // Falls back rather than latching: an asset whose last window just closed and
  // whose next one has not been listed yet would otherwise leave the card empty
  // with a chip still selected. Null means "whatever closes next", which is
  // also the right first thing to show someone who has not chosen.
  const activeAsset = asset !== null && assets.includes(asset) ? asset : null
  const focusRow = useMemo(
    () => pickFocusRow(priced, activeAsset, horizon),
    [priced, activeAsset, horizon],
  )

  const results = data ?? []
  const errors = results.filter((r) => r.error)

  if (venues.length === 0) {
    return (
      <PaneEmpty
        body={t('cryptoUpDown.noVenuesBody')}
        icon={Timer}
        title={t('events.noVenuesTitle')}
      />
    )
  }

  if (isLoading && priced.length === 0) {
    return (
      <div aria-busy className="flex h-full flex-col">
        <PaneHeaderMetric>{t('cryptoUpDown.subtitle')}</PaneHeaderMetric>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SkeletonStatus label={t('cryptoUpDown.loading')} />
          <OddsMoversSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>
        {t('cryptoUpDown.windowCount', { count: priced.length })}
      </PaneHeaderMetric>

      <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {view === 'focus' && assets.length > 1 ? (
            <>
              <AssetSwitcher
                assets={assets}
                onChange={(next) => {
                  setAsset(next)
                  // Null is "whatever closes next" and is the default, so it is
                  // reported as its own value rather than dropped: someone
                  // returning to the default is a use of the switcher too.
                  track('prediction_updown_asset_selected', {
                    asset: next ?? 'next',
                    horizon: horizon ?? 'all',
                  })
                }}
                value={activeAsset}
              />
              {/* Two filters in one row, and they are not the same kind of
                  thing: one picks the asset, the other picks the window. With
                  nothing between them the row reads as nine chips of one
                  control and the boundary has to be worked out. */}
              <span
                aria-hidden="true"
                className="h-3 w-px shrink-0 bg-(--pane-rule)"
              />
            </>
          ) : null}
          <HorizonFilter onChange={setHorizon} value={horizon} />
        </div>
        <ViewToggle
          onChange={(next) => {
            setView(next)
            track('prediction_updown_view_changed', { view: next })
          }}
          value={view}
        />
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          view === 'board' && 'overflow-y-auto',
        )}
      >
        {errors.length > 0 && (
          <div className="flex shrink-0 flex-col gap-1.5 pb-2">
            {errors.map((result) => (
              <PaneErrorBanner
                key={`err:${result.market}`}
                message={result.error ?? ''}
                venue={result.label}
              />
            ))}
          </div>
        )}

        {priced.length === 0 ? (
          <PaneEmpty
            body={t('cryptoUpDown.emptyBody')}
            icon={Timer}
            title={t('cryptoUpDown.emptyTitle')}
          />
        ) : view === 'focus' ? (
          focusRow === null ? (
            <PaneEmpty
              body={t('cryptoUpDown.focus.noWindowBody')}
              icon={Timer}
              title={t('cryptoUpDown.focus.noWindowTitle')}
            />
          ) : (
            <>
              <FocusHeading row={focusRow} />
              {/* Keyed on the window, so a settled contract rolling into the
                  next one gets a fresh chart and a fresh subscription rather
                  than a line that steps across the boundary. */}
              <UpDownFocusCard key={focusRow.key} now={now} row={focusRow} />
            </>
          )
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <Th>{t('cryptoUpDown.colContract')}</Th>
                <Th align="right">{t('cryptoUpDown.colCloses')}</Th>
                <Th align="right">{t('cryptoUpDown.colReference')}</Th>
                <Th align="right">{t('cryptoUpDown.colSpot')}</Th>
                <Th align="right">{t('cryptoUpDown.colDistance')}</Th>
                <Th align="right">{t('cryptoUpDown.colMarket')}</Th>
                <Th align="right">{t('cryptoUpDown.colModel')}</Th>
                <Th align="right">{t('cryptoUpDown.colEdge')}</Th>
              </tr>
            </thead>
            <tbody>
              {priced.map((row) => (
                <Row
                  key={row.key}
                  onOpen={() => {
                    track('prediction_updown_opened', {
                      venue: row.venue,
                      horizon: row.meta.horizon,
                      hasModel: row.modelUp !== undefined,
                      view: 'board',
                    })
                    select.openEvent({ venue: row.venue, event: row.event })
                  }}
                  row={row}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

/**
 * Which shape the pane is in.
 *
 * Two words rather than an icon pair: the difference between them is what they
 * ANSWER, not how they look, and a chart glyph beside a table glyph says the
 * second thing.
 */
function ViewToggle({
  value,
  onChange,
}: {
  value: 'focus' | 'board'
  onChange: (next: 'focus' | 'board') => void
}) {
  const { t } = useTranslation()
  const options: Array<['focus' | 'board', string]> = [
    ['focus', t('cryptoUpDown.viewFocus')],
    ['board', t('cryptoUpDown.viewBoard')],
  ]
  return (
    <div className="flex shrink-0 gap-0.5 rounded-md bg-muted/50 p-0.5">
      {options.map(([option, label]) => (
        <button
          aria-pressed={option === value}
          className={cn(
            'rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors',
            option === value
              ? 'bg-card text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * The asset the focus card is watching.
 *
 * `null` is a real option and the default: "whatever closes next", which is the
 * right thing to show someone who has not chosen and the right thing to fall
 * back to when a chosen asset's window settles before its successor is listed.
 */
function AssetSwitcher({
  assets,
  value,
  onChange,
}: {
  assets: Array<string>
  value: string | null
  onChange: (next: string | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto">
      <button
        aria-pressed={value === null}
        className={cn(assetChipClass, value === null && assetChipActiveClass)}
        onClick={() => onChange(null)}
        type="button"
      >
        {t('cryptoUpDown.focus.assetNext')}
      </button>
      {assets.map((asset) => (
        <button
          aria-pressed={asset === value}
          className={cn(
            assetChipClass,
            asset === value && assetChipActiveClass,
          )}
          key={asset}
          onClick={() => onChange(asset)}
          type="button"
        >
          {asset}
        </button>
      ))}
    </div>
  )
}

const assetChipClass =
  'shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground'
const assetChipActiveClass = 'bg-accent text-foreground'

/** Which contract is on screen, in the venues' own words. */
function FocusHeading({ row }: { row: UpDownRow }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 pb-1">
      <span className="font-mono text-[12px] font-semibold">
        {row.meta.asset}
      </span>
      <span className="rounded-sm bg-muted/60 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {t(`cryptoUpDown.horizon.${row.meta.horizon}`)}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">
        {row.venueLabel}
      </span>
    </div>
  )
}

function HorizonFilter({
  value,
  onChange,
}: {
  value: PredictionUpDownHorizon | null
  onChange: (next: PredictionUpDownHorizon | null) => void
}) {
  const { t } = useTranslation()
  const options: Array<[PredictionUpDownHorizon | null, string]> = [
    [null, t('cryptoUpDown.horizonAll')],
    ...UPDOWN_HORIZONS.map(
      (h) =>
        [h, t(`cryptoUpDown.horizon.${h}`)] as [
          PredictionUpDownHorizon,
          string,
        ],
    ),
  ]
  return (
    <div className="flex shrink-0 gap-1">
      {options.map(([option, label]) => (
        <button
          className={cn(
            'rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors',
            option === value
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          key={label}
          onClick={() => onChange(option)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ row, onOpen }: { row: UpDownRow; onOpen: () => void }) {
  const { t } = useTranslation()
  const urgency = urgencyOf(row.msToClose)

  return (
    <tr
      className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
      onClick={onOpen}
    >
      <td className="py-1.5 pr-3">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] font-semibold">
            {row.meta.asset}
          </span>
          <span className="rounded-sm bg-muted/60 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {t(`cryptoUpDown.horizon.${row.meta.horizon}`)}
          </span>
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {row.venueLabel}
        </div>
      </td>

      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono tabular-nums',
          urgency === 'closing' && 'font-semibold text-down',
          urgency === 'soon' && 'text-foreground',
          urgency === 'open' && 'text-muted-foreground',
        )}
      >
        {formatWindowCountdown(row.msToClose)}
      </td>

      <td
        className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground"
        title={
          row.meta.referenceExact
            ? t('cryptoUpDown.referenceTooltip', {
                source: row.meta.settlementSource,
              })
            : t('cryptoUpDown.referenceApproxTooltip', {
                source: row.meta.settlementSource,
              })
        }
      >
        {row.reference === undefined ? (
          <Missing state={row.referenceState} />
        ) : (
          <>
            {/* An approximation says so where it is read, not only in the
                footnote: the row beside it is exact and the two must not look
                like the same claim. */}
            {row.meta.referenceExact ? '' : '≈'}
            {formatPrice(row.reference)}
          </>
        )}
      </td>

      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {row.spot === undefined ? '–' : formatPrice(row.spot)}
      </td>

      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono tabular-nums',
          row.drift === undefined
            ? 'text-muted-foreground'
            : row.drift >= 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {row.drift === undefined ? '–' : formatSignedPercent(row.drift)}
      </td>

      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {row.marketUp === undefined ? '–' : formatPredictionPrice(row.marketUp)}
      </td>

      {/* The volatility is what the model column MEANS. Without it a
          ten-point edge reads as free money rather than as "the market is
          pricing much higher vol than the last five days realized", which is
          what it usually is. It does not earn a column of its own on a table
          this wide, so it rides the cell it explains. */}
      <td
        className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground"
        title={
          row.sigma === undefined
            ? undefined
            : t('cryptoUpDown.modelTooltip', {
                sigma: Math.round(row.sigma * 100),
              })
        }
      >
        {row.modelUp === undefined ? '–' : formatPredictionPrice(row.modelUp)}
      </td>

      <td
        className={cn(
          'py-1.5 text-right font-mono tabular-nums',
          row.edge === undefined
            ? 'text-muted-foreground'
            : row.edge >= 0
              ? 'text-up'
              : 'text-down',
        )}
        // Same withholding as the focus card's strip, and the same reason it
        // has to be sayable: a dash here otherwise reads as "no edge".
        title={row.quoteStale ? t('cryptoUpDown.oddsStaleTooltip') : undefined}
      >
        {row.edge === undefined ? '–' : formatEdgePoints(row.edge)}
      </td>
    </tr>
  )
}

/**
 * Why a cell is blank, in one character.
 *
 * A dash is "we do not have this"; the dotted form is "we asked and it has not
 * landed". They mean different things to someone deciding whether to wait.
 */
function Missing({ state }: { state: UpDownRow['referenceState'] }) {
  return (
    <span className="text-muted-foreground/60">
      {state === 'pending' ? '···' : '–'}
    </span>
  )
}

/** A signed percentage with enough places to see a basis point move. */
function formatSignedPercent(fraction: number): string {
  const percent = fraction * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(Math.abs(percent) < 1 ? 2 : 1)}%`
}

/**
 * The edge, in probability POINTS.
 *
 * Points rather than percent, for the same reason the movers rail states its
 * moves that way: the thing being compared is two probabilities, and
 * probabilities are compared by subtraction. "Model 4 points above market" is
 * a sentence; "model 5.4% above market" is arithmetic about a ratio nobody is
 * trading.
 */
function formatEdgePoints(edge: number): string {
  const points = edge * 100
  const sign = points > 0 ? '+' : ''
  return `${sign}${points.toFixed(1)}`
}
