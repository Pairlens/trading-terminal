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
 * The design's version of this pane charts net liquidity added per CHAIN and
 * lists the biggest moves across all of them. Neither figure has a source: no
 * provider sells a signed liquidity delta at any grain. So the pane keeps the
 * design's two-column shape and fills it with the signed number that IS real,
 * scoped to the pool the board has selected. The bars say "net taker flow", the
 * biggest single swaps sit beside them as evidence, and nothing on this pane
 * claims to know about liquidity being added or pulled.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Waves } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type { PoolTrade } from '@pairlens/shared/instrument-types'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { DexPaneHeader } from '@/components/dex/dex-pane-primitives'
import { LiquidityFlowSkeleton } from '@/components/dex/dex-skeletons'
import {
  DISCOVERY_POOL_LISTING,
  usePoolListing,
  usePoolTrades,
} from '@/hooks/use-pool-stats'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import { bucketNetFlow, peakAbsNet, truncateAddress } from '@/lib/dex/pool-math'
import { formatCompactUsd } from '@/lib/format-price'
import { poolPairKey } from '@/lib/dex/pool-pair'

/** Five-minute buckets over the last hour: twelve bars, one screen wide. */
const BUCKET_MS = 5 * 60_000
const BUCKET_COUNT = 12
/** Largest swaps listed beside the bars. */
const TOP_SWAPS = 4
/** Every third bar gets a clock label. Twelve of them would be a smear. */
const AXIS_LABEL_EVERY = 3

/** Wallets are truncated hard here: the column is a quarter of a docked pane. */
const WALLET_LEAD = 4
const WALLET_TAIL = 4

export function LiquidityFlowPane() {
  const { t } = useTranslation()
  const pool = useDexDiscoveryStore((s) => s.selectedPool)
  const chain = useDexDiscoveryStore((s) => s.chain)

  // Same listing the map reads, same query key, no extra request. See the pool
  // detail pane: "pick a pool" is only honest once there are pools to pick.
  const listing = usePoolListing(chain, !pool, DISCOVERY_POOL_LISTING)

  const pairKey = pool ? poolPairKey(pool) : undefined
  // Pinned to the selected pool's address. A tape is evidence about ONE pool,
  // and re-resolving the pair can hand back the deepest pool for the same two
  // tokens — bars that disagree with the tile the reader clicked.
  const { trades, isLoading, error, throttled, retrying } = usePoolTrades(
    pool?.market,
    pairKey,
    { enabled: Boolean(pool), poolAddress: pool?.address },
  )

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
    // A chart-shaped placeholder rather than a sentence about the pane beside
    // this one. The map now seeds a selection off its FIRST page instead of
    // waiting for the whole depth walk, so this state lasts a beat rather than
    // the ten seconds it used to — and what follows it is this exact layout
    // with real bars in it, so nothing moves when the tape lands.
    if (listing.isLoading || listing.retrying) {
      return <LiquidityFlowSkeleton />
    }
    return (
      <PaneEmpty
        icon={Waves}
        title={
          listing.error
            ? t('liquidityFlow.unavailableTitle')
            : t('liquidityFlow.noPoolTitle')
        }
        body={
          listing.error
            ? // The pool map's sentence, for the same refusal. See pool-detail.
              listing.throttled
              ? listing.error
              : t('poolMap.unavailableBody')
            : t('liquidityFlow.noPoolBody')
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Which pool, and the hour's signed total. Both belong beside the pane's
          name rather than in a strip of their own, and the venue that used to
          sit here is on the detail pane a click away. */}
      <DexPaneHeader
        subtitle={
          <>
            {pool.name}
            {trades.length > 0 ? (
              <span
                className={cn('ml-2', netTotal >= 0 ? 'text-up' : 'text-down')}
              >
                {t('liquidityFlow.netHour', {
                  value: `${netTotal >= 0 ? '+' : '-'}${formatCompactUsd(Math.abs(netTotal))}`,
                })}
              </span>
            ) : null}
          </>
        }
      />

      {trades.length === 0 && !error && (isLoading || retrying) ? (
        <LiquidityFlowSkeleton poolName={pool.name} />
      ) : trades.length === 0 ? (
        // Two outcomes, two sentences, and the loading one has already been
        // taken by the skeleton above. "No swaps yet" used to be shown for all
        // three, which on a rate-limited provider told the reader a pool doing
        // eight figures a day had gone quiet — the one reading of an empty flow
        // chart that is never recoverable by waiting.
        //
        // The failure OUTRANKS the retry, and that ordering is the whole
        // point. This tape polls every fifteen seconds and a refused cycle
        // takes longer than that to give up, so a pane that drew a skeleton
        // whenever an attempt was in flight would spend its whole life
        // claiming to load and never once say what was wrong. The skeleton is
        // only honest before the first failure, which is what the `!error`
        // guard on it says.
        <PaneEmpty
          icon={Waves}
          title={
            error
              ? t('liquidityFlow.swapsUnavailableTitle')
              : t('liquidityFlow.emptyTitle')
          }
          body={
            error
              ? throttled
                ? error
                : t('liquidityFlow.swapsUnavailableBody')
              : t('liquidityFlow.emptyBody')
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 py-2">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Bars grow from a shared midline so a sell-heavy bucket reads as
                below zero rather than as a shorter buy. */}
            <div className="flex min-h-0 flex-1 items-stretch gap-1">
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

            {/* A bucket chart with no clock under it reads as "recently" and
                nothing more. Every third bar carries the time so the hour has
                a scale without the labels colliding. */}
            <div className="mt-1 flex gap-1">
              {buckets.map((bucket, index) => (
                <span
                  key={bucket.ts}
                  className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground [font-variant-numeric:tabular-nums]"
                >
                  {index % AXIS_LABEL_EVERY === 0 ? clockLabel(bucket.ts) : ''}
                </span>
              ))}
            </div>

            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {t('liquidityFlow.axisNote')}
            </p>
          </div>

          {/* The board's own hairline, not a border: the chart and the swap
              list are two datasets and the cut has to be visible. */}
          <div className="w-px shrink-0 self-stretch bg-(--pane-rule)" />

          <div className="flex w-[42%] min-w-0 shrink-0 flex-col gap-2">
            <p className="text-[10px] text-muted-foreground">
              {t('liquidityFlow.biggestLabel')}
            </p>
            {biggest.map((trade) => (
              <BiggestSwapRow key={trade.id} trade={trade} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** `14:35`, in the reader's own locale and clock convention. */
function clockLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function BiggestSwapRow({ trade }: { trade: PoolTrade }) {
  const buy = trade.side === 'buy'
  const Arrow = buy ? ArrowUpRight : ArrowDownRight
  // Truncated at both ends, and only ever a raw address. A swap feed publishes
  // a signer, not a name, and the row printing a full 44-character mint into a
  // quarter-pane column was clipping it mid-string with no ellipsis to say so.
  const wallet = truncateAddress(trade.wallet, WALLET_LEAD, WALLET_TAIL)

  return (
    <div className="flex items-center gap-2 text-xs">
      <Arrow
        className={cn('size-3 shrink-0', buy ? 'text-up' : 'text-down')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {wallet || '—'}
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
