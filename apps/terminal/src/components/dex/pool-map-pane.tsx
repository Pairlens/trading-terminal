// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The selected chain's pools, ranked by how hard each one works its own
 * liquidity.
 *
 * Volume alone puts the deepest pools on top, which is where they always are
 * and says nothing. Turnover — a day's volume against the liquidity backing it
 * — is what separates a pool actually trading from a pool merely large, and it
 * is the column the ratio bar draws.
 *
 * A click selects (feeding the detail pane beside it); a double click or the
 * arrow opens the pair. Both pin the base token's ADDRESS, never its ticker:
 * a pool map is exactly where two tokens with the same symbol turn up next to
 * each other.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Droplets } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type { PoolListingEntry } from '@pairlens/shared/instrument-types'

import {
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { ShareBar } from '@/components/dex/dex-pane-primitives'
import { usePoolListing } from '@/hooks/use-pool-stats'
import { useDexChains } from '@/hooks/use-dex-chains'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import {
  comparePoolsByTurnover,
  measurableReserveUsd,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'

/** Rows drawn at once. Deeper than the pane shows without a scroll. */
const MAX_ROWS = 60

type SortKey = 'turnover' | 'volume' | 'liquidity'

export function PoolMapPane() {
  const { t } = useTranslation()
  const chain = useDexDiscoveryStore((s) => s.chain)
  const selected = useDexDiscoveryStore((s) => s.selectedPool)
  const selectPool = useDexDiscoveryStore((s) => s.selectPool)
  const chains = useDexChains()
  const [sort, setSort] = useState<SortKey>('turnover')

  const chainRow = chains.find((c) => c.market === chain) ?? null
  const { pools, isLoading, error } = usePoolListing(chain)

  // Sorted on data refresh, not per tick: this list is a react-query result
  // that replaces wholesale, so rows never reorder under a cursor mid-scan.
  const rows = useMemo(() => {
    const sorted = pools.slice()
    if (sort === 'turnover') sorted.sort(comparePoolsByTurnover)
    else if (sort === 'volume')
      sorted.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    else sorted.sort((a, b) => (b.reserveUsd ?? 0) - (a.reserveUsd ?? 0))
    return sorted.slice(0, MAX_ROWS)
  }, [pools, sort])

  const peakRatio = useMemo(() => {
    let peak = 0
    for (const pool of rows) {
      const ratio = volumeToTvl(pool.volume24hUsd, pool.reserveUsd)
      if (ratio !== null && ratio > peak) peak = ratio
    }
    return peak
  }, [rows])

  if (!chain) {
    return (
      <PaneEmpty
        icon={Droplets}
        title={t('poolMap.noChainTitle')}
        body={t('poolMap.noChainBody')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">
            {t('poolMap.title', {
              chain: chainRow?.displayName ?? chain,
            })}
          </h2>
          <p className="truncate text-[10px] text-muted-foreground">
            {t('poolMap.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {(['turnover', 'volume', 'liquidity'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors',
                sort === key
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {key === 'turnover'
                ? t('poolMap.sortTurnover')
                : key === 'volume'
                  ? t('poolMap.sortVolume')
                  : t('poolMap.sortLiquidity')}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="px-3 pt-2">
          <PaneErrorBanner
            venue={chainRow?.displayName ?? chain}
            message={error}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <PaneEmpty
          icon={Droplets}
          title={
            isLoading ? t('poolMap.loadingTitle') : t('poolMap.emptyTitle')
          }
          body={isLoading ? t('poolMap.loadingBody') : t('poolMap.emptyBody')}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background text-muted-foreground">
              <tr className="border-b border-border">
                <th className="pb-1.5 pl-3 pr-3 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('poolMap.columns.pool')}
                </th>
                <Th align="right">{t('poolMap.columns.price')}</Th>
                <Th align="right">{t('poolMap.columns.change')}</Th>
                <Th align="right">{t('poolMap.columns.volume')}</Th>
                <Th align="right">{t('poolMap.columns.liquidity')}</Th>
                <th className="pb-1.5 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('poolMap.columns.turnover')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pool) => (
                <PoolRow
                  key={`${pool.network}:${pool.address}`}
                  pool={pool}
                  market={chain}
                  peakRatio={peakRatio}
                  selected={selected?.address === pool.address}
                  onSelect={() =>
                    selectPool({
                      market: chain,
                      address: pool.address,
                      name: pool.name,
                      dexName: pool.dexName,
                      baseAddress: pool.baseAddress,
                      baseSymbol: pool.baseSymbol,
                      quoteSymbol: pool.quoteSymbol,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PoolRow({
  pool,
  market,
  peakRatio,
  selected,
  onSelect,
}: {
  pool: PoolListingEntry
  market: string
  peakRatio: number
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ratio = volumeToTvl(pool.volume24hUsd, pool.reserveUsd)
  const reserveUsd = measurableReserveUsd(pool.reserveUsd)
  const change = pool.change24hPct
  const target = poolChartTarget(pool, market)

  return (
    <tr
      onClick={onSelect}
      // Single click selects, double click opens: the detail pane is the cheap
      // look and the pair route is the commitment, so the row does not spend a
      // navigation on someone scanning the board.
      onDoubleClick={() => target && void navigate(target)}
      aria-selected={selected}
      className={cn(
        'cursor-pointer border-b border-border/40 text-xs transition-colors hover:bg-muted/40',
        selected && 'bg-primary/10',
      )}
    >
      <td className="max-w-0 py-1.5 pl-3 pr-3">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs">
              {pool.name}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {pool.dexName}
            </span>
          </span>
          <PoolChartLink pool={pool} market={market} />
        </div>
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {pool.priceUsd === null ? '—' : formatPrice(pool.priceUsd)}
      </td>
      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]',
          change === null
            ? 'text-muted-foreground'
            : change >= 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {change === null
          ? '—'
          : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {pool.volume24hUsd === null ? '—' : formatCompactUsd(pool.volume24hUsd)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {reserveUsd === null ? '—' : formatCompactUsd(reserveUsd)}
      </td>
      <td className="w-[104px] py-1.5 pr-3">
        {ratio === null ? (
          <span className="block text-right font-mono text-muted-foreground">
            —
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <ShareBar
              fraction={peakRatio > 0 ? ratio / peakRatio : 0}
              tone={ratio >= 1 ? 'up' : 'muted'}
            />
            <span className="w-10 shrink-0 text-right font-mono text-[10px] [font-variant-numeric:tabular-nums]">
              {t('poolMap.turnoverValue', { value: ratio.toFixed(1) })}
            </span>
          </div>
        )}
      </td>
    </tr>
  )
}

/**
 * The pair route for a pool row, or null when the listing named neither an
 * address nor a ticker for the base leg.
 *
 * The id is `address-QUOTE` whenever the listing carried a base address, which
 * is the see-what-you-trade rule: a symbol-keyed link on a discovery board is
 * how somebody ends up charting a different token with the same ticker.
 */
function poolChartTarget(pool: PoolListingEntry, market: string) {
  const base = pool.baseAddress ?? pool.baseSymbol
  if (!base) return null
  return chartLinkProps({
    cls: 'dex',
    market,
    id: normalizeInstrumentId('dex', `${base}-${pool.quoteSymbol ?? 'USDC'}`),
  })
}

/** The row's explicit way out to the pair, for anyone not double-clicking. */
function PoolChartLink({
  pool,
  market,
}: {
  pool: PoolListingEntry
  market: string
}) {
  const { t } = useTranslation()
  const target = poolChartTarget(pool, market)
  if (!target) return null

  return (
    <Link
      {...target}
      onClick={(event) => event.stopPropagation()}
      title={t('poolMap.openPair')}
      aria-label={t('poolMap.openPair')}
      className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowUpRight className="size-3.5" />
    </Link>
  )
}
