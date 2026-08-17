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
 * The impact column is quoted, not modelled. Each row is a live aggregator
 * quote at that notional, which is why it can beat the pool's own curve: the
 * router may split across pools this pane never read. Reserve math would be
 * cheaper and would describe a different trade.
 */
import { useTranslation } from 'react-i18next'
import { Droplets } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'

import type { ImpactTierRow } from '@/hooks/use-price-impact-tiers'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { StatCell } from '@/components/dex/dex-pane-primitives'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { usePriceImpactTiers } from '@/hooks/use-price-impact-tiers'
import { dexChain } from '@/lib/dex/chain-catalog'
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
  const { stats, isLoading, noPool, error } = usePoolStats(market, pairKey)
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="px-3 pt-2">
          <PaneErrorBanner venue={chain.displayName} message={error} />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 @container/poolstats">
        {/* The grid: two columns at any width, three rows. The cells that
            collapse are the ones nobody published, never the whole row. */}
        <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-3 border-r border-border">
          <StatCell
            className="border-b border-r border-border"
            label={t('poolStats.liquidity')}
            value={reserveUsd !== null ? formatCompactUsd(reserveUsd) : '—'}
            sub={stats.dexName || null}
          />
          <StatCell
            className="border-b border-border"
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
            className="border-b border-r border-border"
            label={t('poolStats.feeTier')}
            value={
              stats.feeTier !== null
                ? `${(stats.feeTier * 100).toFixed(2)}%`
                : '—'
            }
            sub={stats.feeTier === null ? t('poolStats.feeTierUnknown') : null}
          />
          <StatCell
            className="border-b border-border"
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
          />
          <StatCell
            className="border-r border-border"
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
            value={poolAge(stats.createdAt, t)}
            sub={stats.name}
          />
        </div>

        {/* Impact, one quote per size. Hidden below the width where the bars
            would be shorter than their own labels. */}
        <div className="hidden w-[236px] shrink-0 flex-col gap-1.5 px-3 py-2.5 @min-[34rem]/poolstats:flex">
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

/** Pool age in whole months, or days while it is younger than one. */
function poolAge(
  createdAt: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!createdAt) return '—'
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return '—'
  const days = Math.floor((Date.now() - created) / 86_400_000)
  if (days < 1) return t('poolStats.ageToday')
  if (days < 31) return t('poolStats.ageDays', { count: days })
  return t('poolStats.ageMonths', { count: Math.floor(days / 30) })
}
