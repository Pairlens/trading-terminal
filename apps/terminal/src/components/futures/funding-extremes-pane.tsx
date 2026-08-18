// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Funding Extremes — where the crowd is paying the most to stay on, and where
 * it is being paid.
 *
 * One list, not two. The dearest and cheapest carry interleave by how far each
 * one is from flat, because a rail four rows tall spent a third of itself on
 * section headings and, with a single venue connected, put a "shorts paying"
 * heading over one row. The sign is on every row already: the icon and the
 * colour say it in less space than a heading does.
 *
 * One entry per CONTRACT PER VENUE rather than per asset. "TAO on Binance" and
 * "TAO on KuCoin" are two different trades, and the gap between them is the
 * trade — collapsing them would hide the leg that pays for the other.
 *
 * **Each rate is ranked against the contract's own 30-day range**, which is the
 * difference between a screener and a rail worth reading. A perp that funds at
 * 40% a year every week of the year is not news; one that has just tripled its
 * usual rate is. `useFundingHistories` fetches a month of settled stamps per
 * candidate (one batched react-query entry, four in flight at a time) and
 * `percentileOf` places the live rate inside it. A venue that publishes no
 * history simply keeps the per-interval subtitle, which is what this pane could
 * always stand behind.
 *
 * The floor under all of it is open interest: without one the rail is a
 * permanent list of contracts with a thousand dollars open, whose funding
 * prints whatever the last trade felt like.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Flame, TrendingDown } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'

import {
  ratePercent,
  signedPercent,
  useFundingScanner,
  useOpenContract,
} from './funding-scanner'
import { FundingExtremesSkeleton, SkeletonStatus } from './funding-skeletons'
import type { TFunction } from 'i18next'
import type { FundingExtreme } from '@/lib/futures/funding-rows'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { openInterestValue, percentileOf } from '@/lib/futures/funding-math'
import { rankedExtremes } from '@/lib/futures/funding-rows'
import {
  fundingHistoryKey,
  useFundingHistories,
  useOpenInterest,
} from '@/hooks/use-funding-rates'

/**
 * Contracts taken from each end of the board.
 *
 * Sixteen candidates is the whole cost model of this pane: one 30-day history
 * and one open-interest read each, both bounded and both paced. Widening it is
 * a REST bill, not a layout change.
 */
const PER_SIDE = 8

/**
 * Open interest a contract needs before its funding is worth ranking, in USD.
 *
 * A million is low for a perp and high for dust. Below it the printed rate is
 * usually one account's position arguing with itself, and those contracts used
 * to own this rail permanently because an illiquid perp is exactly where the
 * most extreme rate lives.
 *
 * Contracts whose open interest nobody publishes are NOT filtered: a missing
 * figure is not a small one, and silently hiding a venue's whole universe
 * because it serves no OI would be the worse mistake.
 */
const MIN_OPEN_INTEREST_USD = 1_000_000

export function FundingExtremesPane() {
  const { t } = useTranslation()
  const { venues, rows, isPending, isSettling } = useFundingScanner()
  const openContract = useOpenContract()

  const candidates = useMemo(() => rankedExtremes(rows, PER_SIDE), [rows])

  const pairsByMarket = useMemo(() => {
    const map: Record<string, Array<string>> = {}
    for (const entry of candidates) {
      ;(map[entry.cell.market] ??= []).push(entry.cell.pair)
    }
    return map
  }, [candidates])

  // No `history` pass: this read is a floor test, and the 24h change it would
  // buy costs a second call per contract that nothing here renders.
  const { data: oiResults } = useOpenInterest(venues, pairsByMarket, false)

  const notional = useMemo(() => {
    const marks = new Map<string, number>()
    for (const entry of candidates) {
      const mark = entry.cell.markPrice
      if (mark !== undefined) {
        marks.set(fundingHistoryKey(entry.cell.market, entry.cell.pair), mark)
      }
    }
    const out = new Map<string, number>()
    for (const result of oiResults ?? []) {
      for (const item of result.entries) {
        const key = fundingHistoryKey(result.market, item.pair)
        const mark = marks.get(key)
        const value = openInterestValue({
          ...(item.value !== undefined ? { value: item.value } : {}),
          ...(item.amount !== undefined ? { amount: item.amount } : {}),
          ...(item.contractSize !== undefined
            ? { contractSize: item.contractSize }
            : {}),
          ...(mark !== undefined ? { markPrice: mark } : {}),
        })
        if (value !== null) out.set(key, value)
      }
    }
    return out
  }, [oiResults, candidates])

  // Histories are keyed on the CANDIDATE set, not the filtered one: the
  // open-interest answer lands after the first paint, and rebuilding the batch
  // around it would throw away a month of stamps per contract to refetch them.
  const historyTargets = useMemo(
    () =>
      candidates.map((entry) => ({
        market: entry.cell.market,
        pair: entry.cell.pair,
      })),
    [candidates],
  )
  const { data: histories } = useFundingHistories(venues, historyTargets)

  const percentiles = useMemo(() => {
    const out = new Map<string, number>()
    for (const history of histories ?? []) {
      const pct = percentileOf(
        currentRateOf(candidates, history.market, history.pair),
        history.points.map((point) => point.rate),
      )
      if (pct !== null)
        out.set(fundingHistoryKey(history.market, history.pair), pct)
    }
    return out
  }, [histories, candidates])

  const listed = useMemo(
    () =>
      candidates.filter((entry) => {
        const value = notional.get(
          fundingHistoryKey(entry.cell.market, entry.cell.pair),
        )
        return value === undefined || value >= MIN_OPEN_INTEREST_USD
      }),
    [candidates, notional],
  )

  // The rail ranks whatever the sweep produced, so an empty list while venues
  // are still out is a pane mid-fill rather than a pane with nothing to say.
  const loading = listed.length === 0 && (isPending || isSettling)

  if (listed.length === 0 && !loading) {
    return (
      <PaneEmpty
        body={t('fundingExtremes.emptyBody')}
        icon={ArrowDownUp}
        title={t('fundingExtremes.emptyTitle')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('fundingExtremes.subtitle')}
        </p>
      </div>

      <div
        aria-busy={loading || undefined}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {loading && (
          <>
            <SkeletonStatus label={t('funding.loading')} />
            <FundingExtremesSkeleton />
          </>
        )}
        {listed.map((entry) => (
          <ExtremeRow
            entry={entry}
            key={fundingHistoryKey(entry.cell.market, entry.cell.pair)}
            onOpen={openContract}
            percentile={
              percentiles.get(
                fundingHistoryKey(entry.cell.market, entry.cell.pair),
              ) ?? null
            }
          />
        ))}
      </div>
    </div>
  )
}

function ExtremeRow({
  entry,
  percentile,
  onOpen,
}: {
  entry: FundingExtreme
  percentile: number | null
  onOpen: (market: string, pair: string) => void
}) {
  const { t } = useTranslation()
  const { base, cell, annualized } = entry
  const positive = annualized >= 0
  const Icon = positive ? Flame : TrendingDown

  return (
    <button
      className="flex w-full items-center gap-2.5 border-b border-border/50 px-3.5 py-2 text-left last:border-0 hover:bg-muted/40"
      onClick={() => onOpen(cell.market, cell.pair)}
      type="button"
    >
      <Icon
        className={cn('size-3.5 shrink-0', positive ? 'text-up' : 'text-down')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs font-semibold">
          {base} · {cell.venueLabel}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {subtitleOf(t, entry, percentile)}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 font-mono text-xs tabular-nums',
          positive ? 'text-up' : 'text-down',
        )}
      >
        {signedPercent(annualized)}
      </span>
    </button>
  )
}

/**
 * Where this rate sits in its own month, or what it is paying right now.
 *
 * The percentile is the reading the pane exists for, but it arrives one round
 * trip late and never arrives at all from a venue with no public series. The
 * fallback is the same per-interval line the rail shipped with, so a row is
 * never blank and never claims a range it has not read.
 */
function subtitleOf(
  t: TFunction,
  entry: FundingExtreme,
  percentile: number | null,
): string {
  const { cell, annualized } = entry
  if (percentile === null) {
    return t('fundingExtremes.perInterval', {
      rate: ratePercent(cell.rate),
      hours: cell.intervalHours,
    })
  }
  // Expressed as the SHARE of the month this rate beats, not as an ordinal:
  // "top 1%" survives translation into sixteen languages, "99th" does not.
  const range =
    percentile >= 50
      ? t('fundingExtremes.rangeTop', {
          pct: Math.max(Math.round(100 - percentile), 1),
        })
      : t('fundingExtremes.rangeBottom', {
          pct: Math.max(Math.round(percentile), 1),
        })
  const tone =
    annualized >= 0
      ? t('fundingExtremes.crowdedLong')
      : t('fundingExtremes.shortsPaying')
  return `${range} · ${tone}`
}

/** The live per-interval rate a history has to be ranked against. */
function currentRateOf(
  candidates: Array<FundingExtreme>,
  market: string,
  pair: string,
): number {
  const hit = candidates.find(
    (entry) => entry.cell.market === market && entry.cell.pair === pair,
  )
  return hit ? hit.cell.rate : Number.NaN
}
