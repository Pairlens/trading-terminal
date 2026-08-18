// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The selected chain's pools as a map: area for size, colour for the day.
 *
 * A ranked table answered "which pool is top" and nothing else. The shape a
 * chain actually has — two pools carrying most of the volume and a tail that
 * rounds to nothing — is a picture, and reading it off sorted rows means
 * comparing numbers by eye. The tiles do it at a glance, and the four modes are
 * four different questions about the same twenty pools.
 *
 * Two rules the map cannot drop. Tiles key on the POOL ADDRESS, so a chain
 * listing two pools for two different tokens both ticking as PYTH draws two
 * tiles rather than one that flickers between them. And a pool with no
 * publishable liquidity figure is off the map entirely: sizing by volume alone
 * put a six-thousand-dollar pool with a bot pointed at it on the largest tile.
 * The full listing, dust included, stays one click away behind the footer.
 *
 * A click selects (feeding the detail and flow panes beside it); a double click
 * opens the pair. Both pin the base token's ADDRESS, never its ticker.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Droplets } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import type { PoolListingEntry } from '@pairlens/shared/instrument-types'

import type { SelectedPool } from '@/lib/dex/discovery-store'
import type { PoolTileMode } from '@/lib/dex/pool-math'
import {
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { TreemapGrid } from '@/components/panes/treemap-grid'
import { DexPaneHeader, ShareBar } from '@/components/dex/dex-pane-primitives'
import { usePoolListing } from '@/hooks/use-pool-stats'
import { useDexChains } from '@/hooks/use-dex-chains'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import {
  comparePoolsByTurnover,
  isRankablePool,
  measurableReserveUsd,
  moveTintAlpha,
  poolTileKey,
  poolTileLines,
  tileSizeFor,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { poolChartTarget } from '@/lib/dex/pool-link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'

/** Rows drawn in the full listing. Deeper than the pane shows without a scroll. */
const MAX_ROWS = 60
/**
 * Tiles on the map. Past this the smallest tiles are colour with no room for a
 * label, which is what the listing behind the footer is for.
 */
const MAX_TILES = 14

/** Volume first: it is the question most people open a chain asking. */
const MODES: ReadonlyArray<PoolTileMode> = [
  'volume',
  'liquidity',
  'trades',
  'turnover',
]

export function PoolMapPane() {
  const { t } = useTranslation()
  const chain = useDexDiscoveryStore((s) => s.chain)
  const selected = useDexDiscoveryStore((s) => s.selectedPool)
  const userPicked = useDexDiscoveryStore((s) => s.userPicked)
  const selectPool = useDexDiscoveryStore((s) => s.selectPool)
  const autoSelectPool = useDexDiscoveryStore((s) => s.autoSelectPool)
  const chains = useDexChains()
  const navigate = useNavigate()

  const [mode, setMode] = useState<PoolTileMode>('volume')
  const [view, setView] = useState<'map' | 'list'>('map')

  const chainRow = chains.find((c) => c.market === chain) ?? null
  const chainName = chainRow?.displayName ?? chain ?? ''
  // The volume ranking, three pages deep: on bot-heavy chains the provider's
  // trending page holds almost none of the real top pools, and the quality bar
  // needs a wide enough net to keep a full mosaic after it strips the fakes.
  const { pools, isLoading, error } = usePoolListing(chain, true, {
    sort: 'volume',
    depth: 3,
  })

  // A listing with no trade counts anywhere is a provider that does not
  // publish them, and a mode that would draw an empty map is worse than a mode
  // that is not offered.
  const hasTradeCounts = useMemo(
    () => pools.some((pool) => pool.trades24h != null),
    [pools],
  )
  const modes = useMemo(
    () => (hasTradeCounts ? MODES : MODES.filter((m) => m !== 'trades')),
    [hasTradeCounts],
  )
  const activeMode = modes.includes(mode) ? mode : 'volume'

  /** Map candidates: past the quality floor, sized by the active mode. */
  const tiles = useMemo(() => {
    const sized = pools
      .filter(isRankablePool)
      .map((pool) => ({ pool, size: tileSizeFor(pool, activeMode) }))
      .filter((entry) => entry.size > 0)
    sized.sort((a, b) => b.size - a.size)
    return sized.slice(0, MAX_TILES).map((entry) => entry.pool)
  }, [pools, activeMode])

  /** The full listing, dust included, ranked the way the table always was. */
  const rows = useMemo(() => {
    const sorted = pools.slice()
    if (activeMode === 'volume')
      sorted.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    else if (activeMode === 'liquidity')
      sorted.sort((a, b) => (b.reserveUsd ?? 0) - (a.reserveUsd ?? 0))
    else if (activeMode === 'trades')
      sorted.sort((a, b) => tradeCount(b) - tradeCount(a))
    else sorted.sort(comparePoolsByTurnover)
    return sorted.slice(0, MAX_ROWS)
  }, [pools, activeMode])

  const peakRatio = useMemo(() => {
    let peak = 0
    for (const pool of rows) {
      const ratio = volumeToTvl(pool.volume24hUsd, pool.reserveUsd)
      if (ratio !== null && ratio > peak) peak = ratio
    }
    return peak
  }, [rows])

  /**
   * The board's own default.
   *
   * Without it this map opened beside a detail pane reading "No pool selected"
   * and a flow pane reading "Pick a pool", which is a discovery board asking to
   * be told what to discover. Seeded from the deepest-volume pool regardless of
   * the active mode, because that is the pool a chain is about. A click sets
   * `userPicked` and the store stops listening.
   */
  const listed = useMemo(
    () => new Set(pools.map((pool) => pool.address)),
    [pools],
  )
  const needsSeed =
    selected === null || (!userPicked && !listed.has(selected.address))
  const topByVolume = useMemo(() => {
    let top: PoolListingEntry | null = null
    for (const pool of pools) {
      if (!isRankablePool(pool)) continue
      if (!top || (pool.volume24hUsd ?? 0) > (top.volume24hUsd ?? 0)) top = pool
    }
    return top
  }, [pools])

  useEffect(() => {
    if (!chain || !needsSeed || !topByVolume) return
    autoSelectPool(toSelection(topByVolume, chain))
  }, [chain, needsSeed, topByVolume, autoSelectPool])

  const handleSelect = useCallback(
    (pool: PoolListingEntry) => {
      if (chain) selectPool(toSelection(pool, chain))
    },
    [chain, selectPool],
  )

  const handleActivate = useCallback(
    (pool: PoolListingEntry) => {
      const target = chain ? poolChartTarget(pool, chain) : null
      if (target) void navigate(target)
    },
    [chain, navigate],
  )

  // The store carries the Pairlens market id, the tile key carries the
  // provider's network slug, and the two are not the same string (Solana is
  // `jupiter` here and `solana` there). Resolved through the listing rather
  // than rebuilt from either one.
  const selectedTileKey = useMemo(() => {
    if (!selected) return null
    const match = tiles.find((pool) => pool.address === selected.address)
    return match ? poolTileKey(match) : null
  }, [tiles, selected])

  const sizeOf = useCallback(
    (pool: PoolListingEntry) => tileSizeFor(pool, activeMode),
    [activeMode],
  )
  const tintFor = useCallback((pool: PoolListingEntry) => {
    const alpha = moveTintAlpha(pool.change24hPct)
    if (alpha <= 0) return 'var(--card)'
    const base = (pool.change24hPct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'
    return `color-mix(in oklch, ${base} ${alpha.toFixed(1)}%, var(--card))`
  }, [])
  const lines = useCallback(
    (pool: PoolListingEntry, width: number, height: number) =>
      poolTileLines(pool, width, height, formatCompactUsd),
    [],
  )

  if (!chain) {
    return (
      <PaneEmpty
        icon={Droplets}
        title={t('poolMap.noChainTitle')}
        body={t('poolMap.noChainBody')}
      />
    )
  }

  const listView = view === 'list'
  const empty = listView ? rows.length === 0 : tiles.length === 0
  /** The provider answered, and the map's floor is what emptied it. */
  const belowFloor = !listView && empty && pools.length > 0

  return (
    <div className="flex h-full flex-col">
      <DexPaneHeader
        title={
          listView
            ? t('poolMap.listTitle', { chain: chainName })
            : t('poolMap.title', { chain: chainName })
        }
        subtitle={
          listView ? t('poolMap.subtitle') : t(MODE_SUBTITLE[activeMode])
        }
      >
        <div className="flex shrink-0 items-center gap-1">
          {listView ? (
            <button
              type="button"
              onClick={() => setView('map')}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" aria-hidden="true" />
              {t('poolMap.backToMap')}
            </button>
          ) : (
            modes.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={activeMode === key}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] transition-colors',
                  activeMode === key
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {t(MODE_LABEL[key])}
              </button>
            ))
          )}
        </div>
      </DexPaneHeader>

      {error ? (
        <div className="px-3 pt-2">
          <PaneErrorBanner venue={chainName} message={error} />
        </div>
      ) : null}

      {isLoading && pools.length === 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-6 grid-rows-4 gap-1 p-1.5">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      ) : empty ? (
        // Two different nothings. The provider returning no pools for a chain
        // is one state; a chain whose every pool sits under the map's own
        // quality floor is another, and telling the reader "no pools returned"
        // there would blame the provider for a filter we applied. The second
        // one keeps its way through to the unfiltered listing.
        belowFloor ? (
          <PaneEmpty
            icon={Droplets}
            title={t('poolMap.belowFloorTitle')}
            body={t('poolMap.belowFloorBody')}
            action={
              <button
                type="button"
                onClick={() => setView('list')}
                className="mt-3 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('poolMap.morePools')}
              </button>
            }
          />
        ) : (
          <PaneEmpty
            icon={Droplets}
            title={t('poolMap.emptyTitle')}
            body={t('poolMap.emptyBody')}
          />
        )
      ) : listView ? (
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
                  key={poolTileKey(pool)}
                  pool={pool}
                  market={chain}
                  peakRatio={peakRatio}
                  selected={selected?.address === pool.address}
                  onSelect={() => handleSelect(pool)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <TreemapGrid
          data={tiles}
          sizeOf={sizeOf}
          tintFor={tintFor}
          keyOf={poolTileKey}
          lines={lines}
          selected={selectedTileKey}
          onSelect={handleSelect}
          onActivate={handleActivate}
          footerTile={{
            label: t('poolMap.morePools'),
            onClick: () => setView('list'),
          }}
        />
      )}
    </div>
  )
}

const MODE_LABEL: Record<PoolTileMode, string> = {
  volume: 'poolMap.sortVolume',
  liquidity: 'poolMap.sortLiquidity',
  trades: 'poolMap.sortTrades',
  turnover: 'poolMap.sortTurnover',
}

const MODE_SUBTITLE: Record<PoolTileMode, string> = {
  volume: 'poolMap.subtitleVolume',
  liquidity: 'poolMap.subtitleLiquidity',
  trades: 'poolMap.subtitleTrades',
  turnover: 'poolMap.subtitleTurnover',
}

function tradeCount(pool: PoolListingEntry): number {
  const counts = pool.trades24h
  return counts ? counts.buys + counts.sells : 0
}

/** A listing row reduced to what the other three panes need to follow it. */
function toSelection(pool: PoolListingEntry, market: string): SelectedPool {
  return {
    market,
    address: pool.address,
    name: pool.name,
    dexName: pool.dexName,
    baseAddress: pool.baseAddress,
    baseSymbol: pool.baseSymbol,
    quoteSymbol: pool.quoteSymbol,
  }
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
        'cursor-pointer border-b border-border/50 text-xs transition-colors hover:bg-muted/40',
        selected && 'bg-primary/10',
      )}
    >
      <td className="max-w-0 py-2 pl-3 pr-3">
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
      <td className="py-2 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {pool.priceUsd === null ? '—' : formatPrice(pool.priceUsd)}
      </td>
      <td
        className={cn(
          'py-2 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]',
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
      <td className="py-2 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {pool.volume24hUsd === null ? '—' : formatCompactUsd(pool.volume24hUsd)}
      </td>
      <td className="py-2 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {reserveUsd === null ? '—' : formatCompactUsd(reserveUsd)}
      </td>
      <td className="w-[104px] py-2 pr-3">
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
