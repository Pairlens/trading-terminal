// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The selected pool at a glance, one click from its chart.
 *
 * The stat list only shows what the provider published: turnover collapses
 * without a liquidity figure, the buy/sell bar collapses without a flow split,
 * and the fee tier collapses on every venue that does not label one. A grid of
 * dashes would fill the same space and tell the reader nothing about which
 * gaps are the pool's and which are ours.
 */
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import {
  buyShare,
  measurableReserveUsd,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { poolPairKey } from '@/lib/dex/pool-pair'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'

export function PoolDetailPane() {
  const { t } = useTranslation()
  const pool = useDexDiscoveryStore((s) => s.selectedPool)
  const pairKey = pool ? poolPairKey(pool) : undefined

  const { stats, isLoading } = usePoolStats(pool?.market, pairKey)

  if (!pool) {
    return (
      <PaneEmpty
        icon={Info}
        title={t('poolDetail.emptyTitle')}
        body={t('poolDetail.emptyBody')}
      />
    )
  }

  const turnover = volumeToTvl(
    stats?.volume24hUsd ?? null,
    stats?.reserveUsd ?? null,
  )
  const reserveUsd = measurableReserveUsd(stats?.reserveUsd ?? null)
  const buys = buyShare(
    stats?.buyVolume24hUsd ?? stats?.trades24h?.buys ?? null,
    stats?.sellVolume24hUsd ?? stats?.trades24h?.sells ?? null,
  )
  const change = stats?.change24hPct ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <p className="truncate font-mono text-[13px] font-semibold">
          {pool.name}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {pool.dexName}
        </p>
        <p className="mt-2 font-mono text-xl font-semibold [font-variant-numeric:tabular-nums]">
          {stats?.priceUsd != null ? formatPrice(stats.priceUsd) : '—'}
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
        <dl className="flex flex-col gap-2 text-[11px]">
          <StatLine
            label={t('poolDetail.liquidity')}
            value={reserveUsd !== null ? formatCompactUsd(reserveUsd) : null}
          />
          <StatLine
            label={t('poolDetail.volume24h')}
            value={
              stats?.volume24hUsd != null
                ? formatCompactUsd(stats.volume24hUsd)
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
          <StatLine
            label={t('poolDetail.trades24h')}
            value={
              stats?.trades24h
                ? (
                    stats.trades24h.buys + stats.trades24h.sells
                  ).toLocaleString()
                : null
            }
          />
          {stats?.feeTier != null ? (
            <StatLine
              label={t('poolDetail.feeTier')}
              value={`${(stats.feeTier * 100).toFixed(2)}%`}
            />
          ) : null}
        </dl>

        {buys !== null ? (
          <div className="mt-3 border-t border-border pt-2.5">
            <p className="text-[11px] text-muted-foreground">
              {stats?.buyVolume24hUsd != null
                ? t('poolDetail.pressureByValue')
                : t('poolDetail.pressureByCount')}
            </p>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
              <span
                className="bg-up"
                style={{ width: `${(buys * 100).toFixed(1)}%` }}
              />
              <span className="flex-1 bg-down" />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground [font-variant-numeric:tabular-nums]">
              <span>{`${(buys * 100).toFixed(0)}%`}</span>
              <span>{`${(100 - buys * 100).toFixed(0)}%`}</span>
            </div>
          </div>
        ) : null}

        {isLoading && !stats ? (
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
function StatLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-mono [font-variant-numeric:tabular-nums]">
        {value ?? '—'}
      </dd>
    </div>
  )
}
