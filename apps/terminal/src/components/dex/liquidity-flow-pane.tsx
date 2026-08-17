// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Net taker flow through the selected pool, five minutes at a time.
 *
 * Named carefully, because the obvious reading is wrong. Neither data provider
 * has a liquidity-flow endpoint, so nothing here measures LP deposits or
 * withdrawals — what it measures is the money that CROSSED the pool: buy
 * notional minus sell notional per bucket, derived from the same swap feed the
 * tape shows. That is a real, checkable number, and it is the one that moves
 * price. A reserve delta would need a source that does not exist, and
 * inventing one is how a pane starts lying about a pool draining.
 *
 * The bars therefore say "net taker flow", the biggest single swaps sit beside
 * them as evidence, and nothing on this pane claims to know about liquidity
 * being added or pulled.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Waves } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type { PoolTrade } from '@pairlens/shared/instrument-types'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { usePoolTrades } from '@/hooks/use-pool-stats'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import { bucketNetFlow, peakAbsNet } from '@/lib/dex/pool-math'
import { formatCompactUsd } from '@/lib/format-price'
import { poolPairKey } from '@/lib/dex/pool-pair'

/** Five-minute buckets over the last hour: twelve bars, one screen wide. */
const BUCKET_MS = 5 * 60_000
const BUCKET_COUNT = 12
/** Largest swaps listed beside the bars. */
const TOP_SWAPS = 4

export function LiquidityFlowPane() {
  const { t } = useTranslation()
  const pool = useDexDiscoveryStore((s) => s.selectedPool)

  const pairKey = pool ? poolPairKey(pool) : undefined
  const { trades, isLoading } = usePoolTrades(pool?.market, pairKey, {
    enabled: Boolean(pool),
  })

  const buckets = useMemo(
    () => bucketNetFlow(trades, BUCKET_MS, BUCKET_COUNT, Date.now()),
    [trades],
  )
  const peak = peakAbsNet(buckets)

  const netTotal = useMemo(
    () => buckets.reduce((sum, bucket) => sum + bucket.netUsd, 0),
    [buckets],
  )

  const biggest = useMemo(
    () =>
      trades
        .slice()
        .sort((a, b) => b.amountUsd - a.amountUsd)
        .slice(0, TOP_SWAPS),
    [trades],
  )

  if (!pool) {
    return (
      <PaneEmpty
        icon={Waves}
        title={t('liquidityFlow.noPoolTitle')}
        body={t('liquidityFlow.noPoolBody')}
      />
    )
  }

  if (trades.length === 0) {
    return (
      <PaneEmpty
        icon={Waves}
        title={
          isLoading
            ? t('liquidityFlow.loadingTitle')
            : t('liquidityFlow.emptyTitle')
        }
        body={
          isLoading
            ? t('liquidityFlow.loadingBody')
            : t('liquidityFlow.emptyBody')
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {t('liquidityFlow.barsLabel', { pool: pool.name })}
          </p>
          <span
            className={cn(
              'shrink-0 font-mono text-[11px] [font-variant-numeric:tabular-nums]',
              netTotal >= 0 ? 'text-up' : 'text-down',
            )}
          >
            {t('liquidityFlow.netHour', {
              value: `${netTotal >= 0 ? '+' : '-'}${formatCompactUsd(Math.abs(netTotal))}`,
            })}
          </span>
        </div>

        {/* Bars grow from a shared midline so a sell-heavy bucket reads as
            below zero rather than as a shorter buy. */}
        <div className="mt-2 flex min-h-0 flex-1 items-stretch gap-1">
          {buckets.map((bucket) => {
            const fraction = peak > 0 ? Math.abs(bucket.netUsd) / peak : 0
            const up = bucket.netUsd >= 0
            return (
              <div
                key={bucket.ts}
                className="flex min-w-0 flex-1 flex-col justify-center"
                title={t('liquidityFlow.bucketTooltip', {
                  buy: formatCompactUsd(bucket.buyUsd),
                  sell: formatCompactUsd(bucket.sellUsd),
                })}
              >
                <div className="flex h-1/2 items-end">
                  {up ? (
                    <span
                      className="w-full rounded-t-sm bg-up"
                      style={{ height: `${Math.max(fraction * 100, 2)}%` }}
                    />
                  ) : null}
                </div>
                <div className="h-px w-full bg-border" />
                <div className="flex h-1/2 items-start">
                  {up ? null : (
                    <span
                      className="w-full rounded-b-sm bg-down"
                      style={{ height: `${Math.max(fraction * 100, 2)}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {t('liquidityFlow.axisNote')}
        </p>
      </div>

      <div className="w-px shrink-0 self-stretch bg-border" />

      <div className="flex w-[42%] min-w-0 shrink-0 flex-col gap-1.5">
        <p className="text-[11px] text-muted-foreground">
          {t('liquidityFlow.biggestLabel')}
        </p>
        {biggest.map((trade) => (
          <BiggestSwapRow key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  )
}

function BiggestSwapRow({ trade }: { trade: PoolTrade }) {
  const buy = trade.side === 'buy'
  const Arrow = buy ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex items-center gap-2 text-xs">
      <Arrow
        className={cn('size-3 shrink-0', buy ? 'text-up' : 'text-down')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {trade.wallet ?? ''}
      </span>
      <span
        className={cn(
          'shrink-0 font-mono text-[11px] [font-variant-numeric:tabular-nums]',
          buy ? 'text-up' : 'text-down',
        )}
      >
        {buy ? '+' : '-'}
        {formatCompactUsd(trade.amountUsd)}
      </span>
    </div>
  )
}
