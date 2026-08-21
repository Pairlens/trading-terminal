// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What an AMM has where a book would be.
 *
 * The DEX pair layout ships with no order book and no depth pane on purpose:
 * the data providers synthesize a bid and an ask around the pool price, so a
 * book drawn from them would be fabricated depth. This pane is the honest
 * replacement — value locked, both reserves where a provider publishes them,
 * a day's volume, the fee tier, and what three real order sizes actually cost.
 *
 * "Where a provider publishes them" used to mean the desktop app: the primary
 * provider reports value locked in USD and nothing per side, and the only source
 * that reported both sides was CORS-closed. DexScreener publishes them keyless
 * and over open CORS, so the browser gets them too, filled in behind the primary
 * answer (see `usePoolStats`). When a cell came from a different provider than
 * the rest of the row, the reserves cell says which one.
 *
 * The impact column is quoted, not modelled. Each row is a live aggregator
 * quote at that notional, which is why it can beat the pool's own curve: the
 * router may split across pools this pane never read. Reserve math would be
 * cheaper and would describe a different trade.
 */
import { useTranslation } from 'react-i18next'
import { Droplets } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { ImpactTierRow } from '@/hooks/use-price-impact-tiers'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { StatCell } from '@/components/dex/dex-pane-primitives'
import { providerLabel } from '@/lib/dex/pool-stats-merge'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { usePriceImpactTiers } from '@/hooks/use-price-impact-tiers'
import { dexChain } from '@/lib/dex/chain-catalog'
import { formatPoolAge } from '@/lib/dex/pool-age'
import {
  impactBarFraction,
  impactTier,
  measurableReserveUsd,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { formatAmount, formatCompactUsd } from '@/lib/format-price'

export function PoolStatsPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return (
    <PoolStatsPaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function PoolStatsPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const chain = dexChain(market)
  const { stats, isLoading, noPool, error, filledBy, filled } = usePoolStats(
    market,
    pairKey,
  )
  const tiers = usePriceImpactTiers(market, pairKey, stats)

  // A pane bound to a CEX pair by an override has nothing to say: there is no
  // pool behind BTC-USDT on Coinbase, and inventing one would resolve some
  // unrelated on-chain pool by ticker.
  if (!chain) {
    return (
      <PaneEmpty
        icon={Droplets}
        title={t('poolStats.notOnChainTitle')}
        body={t('poolStats.notOnChainBody')}
      />
    )
  }

  if (noPool) {
    return <PaneDataUnavailable compact market={market} pairKey={pairKey} />
  }

  if (!stats) {
    return (
      <PaneEmpty
        icon={Droplets}
        title={
          isLoading ? t('poolStats.loadingTitle') : t('poolStats.emptyTitle')
        }
        body={isLoading ? t('poolStats.loadingBody') : t('poolStats.emptyBody')}
      />
    )
  }

  const turnover = volumeToTvl(stats.volume24hUsd, stats.reserveUsd)
  const reserveUsd = measurableReserveUsd(stats.reserveUsd)
  const baseSymbol = stats.baseSymbol ?? ''
  const quoteSymbol = stats.quoteSymbol ?? ''
  const hasReserves = stats.baseReserve !== null || stats.quoteReserve !== null
  // Who measured the reserves, when it was not whoever measured the rest of the
  // row. Null on the common path, where one provider published everything.
  const reservesFilledBy =
    filledBy &&
    (filled.includes('baseReserve') || filled.includes('quoteReserve'))
      ? providerLabel(filledBy)
      : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="pt-2">
          <PaneErrorBanner venue={chain.displayName} message={error} />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-4 @container/poolstats">
        {/* The grid: two columns at any width, three rows. Separated by gaps
            rather than rules, because a stat's own label already tells a reader
            where its neighbour ends. The cells that collapse are the ones
            nobody published, never the whole row. */}
        <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-3 gap-x-4 gap-y-1">
          <StatCell
            label={t('poolStats.liquidity')}
            value={reserveUsd !== null ? formatCompactUsd(reserveUsd) : '—'}
            sub={stats.dexName || null}
          />
          <StatCell
            label={t('poolStats.volume24h')}
            value={
              stats.volume24hUsd !== null
                ? formatCompactUsd(stats.volume24hUsd)
                : '—'
            }
            sub={
              turnover !== null
                ? t('poolStats.turnoverSub', { value: turnover.toFixed(1) })
                : null
            }
          />
          <StatCell
            label={t('poolStats.feeTier')}
            value={
              stats.feeTier !== null
                ? `${(stats.feeTier * 100).toFixed(2)}%`
                : '—'
            }
            sub={stats.feeTier === null ? t('poolStats.feeTierUnknown') : null}
          />
          <ReservesCell
            label={t('poolStats.reserves')}
            value={
              hasReserves && stats.baseReserve !== null
                ? `${formatAmount(stats.baseReserve)} ${baseSymbol}`
                : '—'
            }
            sub={
              hasReserves
                ? stats.quoteReserve !== null
                  ? `${formatAmount(stats.quoteReserve)} ${quoteSymbol}`
                  : null
                : t('poolStats.reservesUnavailable')
            }
            source={reservesFilledBy}
          />
          <StatCell
            label={t('poolStats.trades24h')}
            value={
              stats.trades24h
                ? (
                    stats.trades24h.buys + stats.trades24h.sells
                  ).toLocaleString()
                : '—'
            }
            sub={
              stats.trades24h?.buyers != null
                ? t('poolStats.tradersSub', {
                    count:
                      stats.trades24h.buyers + (stats.trades24h.sellers ?? 0),
                  })
                : null
            }
          />
          <StatCell
            label={t('poolStats.poolAge')}
            value={formatPoolAge(stats.createdAt, t) ?? '—'}
            sub={stats.name}
          />
        </div>

        {/* Impact, one quote per size. Hidden below the width where the bars
            would be shorter than their own labels. */}
        <div className="hidden w-[236px] shrink-0 flex-col gap-1.5 py-1.5 @min-[34rem]/poolstats:flex">
          <p className="text-[10px] text-muted-foreground">
            {t('poolStats.impactLabel')}
          </p>
          {tiers.map((tier) => (
            <ImpactRow key={tier.usd} tier={tier} />
          ))}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {t('poolStats.impactNote')}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * The reserves cell, with provenance when a second provider filled it.
 *
 * A tooltip rather than a fourth line of text: the cell already carries a label,
 * a value and the other side's balance, and the grid is three rows tall at any
 * width. The tooltip only exists when the answer is mixed, so on the common path
 * this renders exactly the plain cell every neighbour renders.
 */
function ReservesCell({
  label,
  value,
  sub,
  source,
}: {
  label: string
  value: string
  sub: string | null
  source: string | null
}) {
  const { t } = useTranslation()
  if (!source) {
    return <StatCell label={label} value={value} sub={sub} />
  }
  return (
    <Tooltip>
      {/* The grid cell IS the trigger, so the hover target is the item the grid
          lays out rather than a wrapper inside it. */}
      <TooltipTrigger render={<div className="min-w-0" />}>
        <StatCell label={label} value={value} sub={sub} />
      </TooltipTrigger>
      <TooltipContent>
        {t('poolStats.reservesSource', { provider: source })}
      </TooltipContent>
    </Tooltip>
  )
}

function ImpactRow({ tier }: { tier: ImpactTierRow }) {
  const level = impactTier(tier.impact)
  const fraction = impactBarFraction(tier.impact)
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 font-mono text-[11px] [font-variant-numeric:tabular-nums]">
        {formatCompactUsd(tier.usd)}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${fraction * 100}%`,
            background:
              level === 'high'
                ? 'var(--destructive)'
                : level === 'moderate'
                  ? 'var(--chart-4)'
                  : 'var(--chart-2)',
          }}
        />
      </div>
      <span
        className={cn(
          'w-12 shrink-0 text-right font-mono text-[10.5px] [font-variant-numeric:tabular-nums]',
          level === 'high' && 'text-down',
          level === 'moderate' && 'text-[var(--chart-4)]',
        )}
      >
        {tier.impact === null
          ? tier.isLoading
            ? ''
            : '—'
          : `${(tier.impact * 100).toFixed(2)}%`}
      </span>
    </div>
  )
}
