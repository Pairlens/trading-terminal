// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The selected pool at a glance, one click from its chart.
 *
 * The stat list only shows what the provider published: turnover collapses
 * without a liquidity figure, the trade count collapses on a listing that
 * carries none, and the fee tier collapses on every venue that does not label
 * one. A grid of dashes would fill the same space and tell the reader nothing
 * about which gaps are the pool's and which are ours.
 *
 * Two numbers here are computed rather than read, and both are deliberate. The
 * $10k price impact is a real aggregator quote at that size, not a curve
 * modelled off reserves. The hour's buy/sell pressure is summed from the SAME
 * swap feed the flow pane beside it draws — one react-query key, one poll, two
 * panes — because two numbers for the same hour that disagreed by a rounding
 * would read as one of the panes being broken.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { PoolSwatch } from '@/components/dex/dex-pane-primitives'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import {
  DISCOVERY_POOL_LISTING,
  usePoolListing,
  usePoolStats,
  usePoolTrades,
} from '@/hooks/use-pool-stats'
import { usePriceImpactTiers } from '@/hooks/use-price-impact-tiers'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import { dexChain } from '@/lib/dex/chain-catalog'
import {
  buyShare,
  impactTier,
  measurableReserveUsd,
  sumFlowSince,
  titleCaseVenue,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { providerLabel } from '@/lib/dex/pool-stats-merge'
import { poolPairKey } from '@/lib/dex/pool-pair'
import { poolDetailView } from '@/lib/dex/pool-view'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'

/** The one size this pane quotes. The three-size grid lives on the pool desk. */
const IMPACT_SIZES = [10_000] as const
const PRESSURE_WINDOW_MS = 60 * 60_000

export function PoolDetailPane() {
  const { t } = useTranslation()
  const pool = useDexDiscoveryStore((s) => s.selectedPool)
  const chain = useDexDiscoveryStore((s) => s.chain)
  const pairKey = pool ? poolPairKey(pool) : undefined

  // The map's own listing, read at the identical key so this costs no request:
  // it is what decides whether "no pool selected" means "pick one" or "the map
  // beside you has not answered yet". Inviting a pick from a pane that is
  // still loading, or that the provider refused, is the board telling the
  // reader to do something it has made impossible.
  const listing = usePoolListing(chain, !pool, DISCOVERY_POOL_LISTING)

  // Pinned to the selected pool's own address, not re-resolved from the pair:
  // the map row already identified it, and the resolver would spend a request
  // to maybe pick a different pool for the same two tokens.
  const { stats, isLoading, error, throttled, retrying, filledBy } =
    usePoolStats(pool?.market, pairKey, true, pool?.address)

  // Identical arguments to the flow pane's call, which is the whole point: the
  // two panes share one react-query entry and this one costs no request.
  const { trades } = usePoolTrades(pool?.market, pairKey, {
    enabled: Boolean(pool),
    poolAddress: pool?.address,
  })

  const [impact] = usePriceImpactTiers(
    pool?.market,
    pairKey,
    stats,
    Boolean(pool),
    IMPACT_SIZES,
  )

  const pressure = useMemo(() => {
    const { buyUsd, sellUsd } = sumFlowSince(
      trades,
      Date.now() - PRESSURE_WINDOW_MS,
    )
    const share = buyShare(buyUsd, sellUsd)
    return share === null ? null : { buyUsd, sellUsd, share }
  }, [trades])

  if (!pool) {
    if (listing.isLoading || listing.retrying) {
      return (
        <PaneEmpty
          icon={Info}
          title={t('poolDetail.waitingTitle')}
          body={t('poolDetail.waitingBody')}
        />
      )
    }
    return (
      <PaneEmpty
        icon={Info}
        title={
          listing.error
            ? t('poolDetail.unavailableTitle')
            : t('poolDetail.emptyTitle')
        }
        body={
          listing.error
            ? // Deliberately the pool map's sentence: the two panes are
              // describing the same refusal, and two wordings for it read as
              // two different problems.
              listing.throttled
              ? listing.error
              : t('poolMap.unavailableBody')
            : t('poolDetail.emptyBody')
        }
      />
    )
  }

  // Live pool state where we have it, the map row's own figures until then.
  // `live` is what the footer reads: the same six numbers mean different things
  // depending on whether a provider just measured the pool or the map listed it
  // five minutes ago, and only one of those is worth holding a spinner over.
  const view = poolDetailView(stats, pool.listed)

  const turnover = volumeToTvl(view.volume24hUsd, view.reserveUsd)
  const reserveUsd = measurableReserveUsd(view.reserveUsd)
  const change = view.change24hPct
  const venue = titleCaseVenue(pool.dexName)
  const chainName = dexChain(pool.market)?.displayName ?? null
  const impactPct = impact?.impact ?? null
  const tier = impactTier(impactPct)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <PoolSwatch seed={pool.address} />
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] font-semibold">
              {pool.name}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {venue && chainName
                ? t('poolDetail.venueChain', { venue, chain: chainName })
                : (venue ?? chainName ?? '')}
            </p>
          </div>
        </div>
        <p className="mt-2.5 font-mono text-xl font-semibold [font-variant-numeric:tabular-nums]">
          {view.priceUsd != null ? formatPrice(view.priceUsd) : '—'}
        </p>
        {change !== null ? (
          <p
            className={cn(
              'font-mono text-xs [font-variant-numeric:tabular-nums]',
              change >= 0 ? 'text-up' : 'text-down',
            )}
          >
            {t('poolDetail.change24h', {
              value: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
            })}
          </p>
        ) : null}
      </div>

      {/* The trend line pays for itself here: the pane is a decision surface,
          and the 24h number alone cannot tell a steady climb from a spike that
          already retraced. It fetches its own candles, viewport-gated. */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <MiniPriceChart
          market={pool.market}
          pair={pairKey}
          className="h-12 w-full"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <dl className="flex flex-col gap-2.5 text-[11.5px]">
          <StatLine
            label={t('poolDetail.liquidity')}
            value={reserveUsd !== null ? formatCompactUsd(reserveUsd) : null}
          />
          <StatLine
            label={t('poolDetail.volume24h')}
            value={
              view.volume24hUsd != null
                ? formatCompactUsd(view.volume24hUsd)
                : null
            }
          />
          <StatLine
            label={t('poolDetail.turnover')}
            value={
              turnover !== null
                ? t('poolDetail.turnoverValue', { value: turnover.toFixed(1) })
                : null
            }
          />
          {view.trades24h ? (
            <StatLine
              label={t('poolDetail.trades24h')}
              value={(
                view.trades24h.buys + view.trades24h.sells
              ).toLocaleString()}
            />
          ) : null}
          <StatLine
            label={t('poolDetail.priceImpact10k')}
            value={
              impactPct !== null ? `${(impactPct * 100).toFixed(2)}%` : null
            }
            tone={
              tier === 'low'
                ? 'up'
                : tier === 'moderate'
                  ? 'caution'
                  : tier === 'high'
                    ? 'down'
                    : 'plain'
            }
          />
          {view.feeTier != null ? (
            <StatLine
              label={t('poolDetail.feeTier')}
              value={`${(view.feeTier * 100).toFixed(2)}%`}
            />
          ) : null}
        </dl>

        {pressure ? (
          <div className="mt-3 border-t border-border pt-2.5">
            <p className="text-[11px] text-muted-foreground">
              {t('poolDetail.pressure1h')}
            </p>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
              <span
                className="bg-up"
                style={{ width: `${(pressure.share * 100).toFixed(1)}%` }}
              />
              <span className="flex-1 bg-down" />
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10.5px] text-muted-foreground [font-variant-numeric:tabular-nums]">
              <span className="truncate">
                {t('poolDetail.buysValue', {
                  value: formatCompactUsd(pressure.buyUsd),
                })}
              </span>
              <span className="truncate">
                {t('poolDetail.sellsValue', {
                  value: formatCompactUsd(pressure.sellUsd),
                })}
              </span>
            </div>
          </div>
        ) : null}

        {filledBy ? (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {t('poolDetail.filledBy', { provider: providerLabel(filledBy) })}
          </p>
        ) : null}

        {/* What the figures above are, when they are not the live pool read.
            Saying nothing here would present a listing snapshot as pool state
            and, on a rate-limited provider, keep saying "loading" forever. */}
        {/* Same ordering as the flow pane beside it: once a read has failed,
            say so and keep saying so. The retry that is already scheduled does
            not make "loading" the truer of the two sentences. */}
        {view.live ? null : error ? (
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            {throttled ? error : t('poolDetail.stateUnavailable')}
          </p>
        ) : isLoading || retrying ? (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {t('poolDetail.loading')}
          </p>
        ) : null}
      </div>

      {pairKey ? (
        <div className="shrink-0 border-t border-border p-3">
          <Button
            size="sm"
            className="w-full"
            nativeButton={false}
            render={
              <Link
                {...chartLinkProps({
                  cls: 'dex',
                  market: pool.market,
                  id: normalizeInstrumentId('dex', pairKey),
                })}
              />
            }
          >
            {t('poolDetail.openChart')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** A label/value row that renders a dash only for a value we asked for. */
function StatLine({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string | null
  tone?: 'plain' | 'up' | 'down' | 'caution'
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'shrink-0 font-mono [font-variant-numeric:tabular-nums]',
          value === null && 'text-muted-foreground',
          value !== null && tone === 'up' && 'text-up',
          value !== null && tone === 'down' && 'text-down',
          value !== null && tone === 'caution' && 'text-[var(--chart-4)]',
        )}
      >
        {value ?? '—'}
      </dd>
    </div>
  )
}
