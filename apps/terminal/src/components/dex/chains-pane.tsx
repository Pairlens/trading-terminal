// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chain rail: where the flow is, and what it costs to be there.
 *
 * Every chain the terminal knows appears, whether or not its connector is
 * installed — a chain that is simply absent looks like a gap in the product,
 * while a dimmed row with an install link is an answer. Selecting a chain
 * drives the pool map and the detail pane beside it through the discovery
 * store.
 *
 * The volume column says what it covers. DexPaprika publishes chain-wide
 * totals and is reachable on desktop; in a browser the same figures can only
 * be summed over the pools the provider sampled, and the subtitle switches to
 * say so rather than presenting a top-20 sum as a chain's whole day.
 */
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Link2, Plus } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'

import type { DexChainRow } from '@/hooks/use-dex-chains'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import { DexPaneHeader, ShareBar } from '@/components/dex/dex-pane-primitives'
import { PacedNote } from '@/components/dex/dex-skeletons'
import { useChainGas, useDexChains } from '@/hooks/use-dex-chains'
import { useChainStats } from '@/hooks/use-pool-stats'
import { useSlowLoad } from '@/hooks/use-slow-load'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import { formatCompactUsd } from '@/lib/format-price'

export function ChainsPane() {
  const { t } = useTranslation()
  const rows = useDexChains()
  const chain = useDexDiscoveryStore((s) => s.chain)
  const setChain = useDexDiscoveryStore((s) => s.setChain)

  const connected = useMemo(() => rows.filter((r) => r.connected), [rows])
  const markets = useMemo(() => connected.map((r) => r.market), [connected])
  const displayNames = useMemo(
    () =>
      Object.fromEntries(
        connected.map((r) => [r.market, r.displayName]),
      ) as Record<string, string>,
    [connected],
  )

  // The board opens on a chain rather than on nothing: the first connected
  // one, which is also what the pool map needs before it can rank anything.
  const firstConnected = connected[0]?.market ?? null

  // The selected chain leads the sweep. Its aggregate is summed from the same
  // listing page the pool map is already fetching for it, so the two collapse
  // into one request and the row the reader is looking at fills first rather
  // than last.
  //
  // `?? firstConnected` is doing real work: the selection is not persisted, so
  // on a cold board `chain` is null for the first render and the effect below
  // fills it on the second. React Query keeps the queryFn a fetch started
  // with, so a lead named one render late is a lead that never applies, and
  // the row the reader lands on would queue with the rest of the sweep. The
  // board opens on the first connected chain; naming it here is the same
  // answer the effect is about to reach.
  const {
    byMarket,
    pendingMarkets,
    error: statsError,
    throttled,
  } = useChainStats(markets, displayNames, {
    leadMarket: chain ?? firstConnected,
  })
  const { gweiByMarket } = useChainGas(rows)

  useEffect(() => {
    if (chain === null && firstConnected) setChain(firstConnected)
  }, [chain, firstConnected, setChain])

  const peakVolume = useMemo(() => {
    let peak = 0
    for (const row of byMarket.values()) {
      if (row.volume24hUsd && row.volume24hUsd > peak) peak = row.volume24hUsd
    }
    return peak
  }, [byMarket])

  // Four seconds of shimmer is a pane that looks slow; four seconds of shimmer
  // with a reason is a pane that looks paced. Reading the whole sweep rather
  // than one row, because what the note explains is the queue behind all of
  // them.
  const slow = useSlowLoad(pendingMarkets.size > 0)

  // Every provider row carries the same coverage, so the first one speaks for
  // the column.
  const coverage = byMarket.values().next().value?.coverage ?? null

  if (rows.length === 0) {
    return (
      <PaneEmpty
        icon={Link2}
        title={t('dexChains.emptyTitle')}
        body={t('dexChains.emptyBody')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <DexPaneHeader
        // The design's second line reads "24h volume · net liquidity". There is
        // no signed 24h liquidity delta on any provider we can reach, at any
        // grain, so the rail names what it actually summed and keeps absolute
        // liquidity on the row's third line.
        subtitle={
          coverage === 'network'
            ? t('dexChains.subtitleNetwork')
            : t('dexChains.subtitleSampled')
        }
      />

      {/* Only when the column is entirely blank. A rail that got five chains
          out of six shows the five and dashes the sixth; a banner over that
          would be louder than the gap it describes. */}
      {statsError && byMarket.size === 0 ? (
        <div className="pt-2">
          <PaneErrorBanner
            venue={t('dexChains.volumesLabel')}
            // A throttle words itself; anything else is plumbing. Same rule,
            // and the same sentence, as the three panes beside this rail.
            message={throttled ? statsError : t('poolMap.unavailableBody')}
          />
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={pendingMarkets.size > 0}
      >
        {pendingMarkets.size > 0 ? (
          <SkeletonStatus label={t('dexChains.loadingLabel')} />
        ) : null}
        {rows.map((row, index) => (
          <ChainRow
            key={row.market}
            row={row}
            index={index}
            selected={row.market === chain}
            onSelect={() => row.connected && setChain(row.market)}
            volumeUsd={byMarket.get(row.market)?.volume24hUsd ?? null}
            reserveUsd={byMarket.get(row.market)?.reserveUsd ?? null}
            poolsCount={byMarket.get(row.market)?.poolsCount ?? null}
            peakVolume={peakVolume}
            gwei={gweiByMarket.get(row.market) ?? null}
            pending={pendingMarkets.has(row.market)}
          />
        ))}
        {/* Under the rows rather than over them, and only once the wait has
            earned it: the rail is already showing every chain's name, so the
            sentence explains the missing NUMBERS rather than an empty pane. */}
        <PacedNote show={slow}>{t('dexChains.pacedNote')}</PacedNote>
      </div>
    </div>
  )
}

function ChainRow({
  row,
  index,
  selected,
  onSelect,
  volumeUsd,
  reserveUsd,
  poolsCount,
  peakVolume,
  gwei,
  pending,
}: {
  row: DexChainRow
  /** Position in the rail, which staggers the shimmer down the column. */
  index: number
  selected: boolean
  onSelect: () => void
  volumeUsd: number | null
  reserveUsd: number | null
  poolsCount: number | null
  peakVolume: number
  gwei: number | null
  /** This chain's own read is still in flight. Per row, not per pane. */
  pending: boolean
}) {
  const { t } = useTranslation()
  const share = peakVolume > 0 && volumeUsd ? volumeUsd / peakVolume : 0
  // Only where a number is actually missing. A chain that has answered keeps
  // its figures through the next refresh rather than flashing back to blocks.
  const waiting = pending && volumeUsd === null

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <img
            src={row.iconUrl}
            alt=""
            className="size-4 shrink-0 rounded-full"
          />
          <span className="truncate text-[13px] font-medium">
            {row.displayName}
          </span>
        </span>
        <span className="shrink-0 font-mono text-xs [font-variant-numeric:tabular-nums]">
          {volumeUsd !== null ? (
            formatCompactUsd(volumeUsd)
          ) : waiting ? (
            // A block where the figure goes, at the figure's own height. The
            // old empty string was the whole complaint: a rail that had been
            // told to wait looked exactly like a rail that had nothing to say.
            <Shimmer delayIndex={index} className="h-3 w-14" />
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="mt-1.5">
        {waiting ? (
          <Shimmer delayIndex={index} className="h-1.5 w-full rounded-full" />
        ) : (
          <ShareBar fraction={share} tone={selected ? 'accent' : 'muted'} />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="flex min-w-0 truncate">
          {reserveUsd !== null ? (
            t('dexChains.liquidityValue', {
              value: formatCompactUsd(reserveUsd),
            })
          ) : poolsCount !== null ? (
            t('dexChains.poolsValue', { count: poolsCount })
          ) : waiting ? (
            <Shimmer delayIndex={index} className="my-[3px] h-2.5 w-20" />
          ) : row.connected ? (
            ''
          ) : (
            t('dexChains.notInstalled')
          )}
        </span>
        <span className="shrink-0 font-mono [font-variant-numeric:tabular-nums]">
          {row.hasGasPrice
            ? gwei !== null
              ? t('dexChains.gasValue', {
                  gwei: gwei.toFixed(gwei < 1 ? 3 : 1),
                })
              : '—'
            : t('dexChains.gasPriority')}
        </span>
      </div>
    </>
  )

  if (!row.connected) {
    return (
      <div className="border-b border-border/40 px-1.5 py-2.5 opacity-55">
        {body}
        <Link
          to="/plugins"
          search={{ manage: row.connectorPluginId }}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-3" />
          {t('dexChains.installConnector')}
        </Link>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full border-b border-border/40 px-1.5 py-2.5 text-left transition-colors hover:bg-muted/40',
        // The accent bar eats its own 2px back out of the left pad so the
        // selected row's text stays on the same column as every other row's.
        selected && 'border-l-2 border-l-primary bg-primary/10 pl-1',
      )}
    >
      {body}
    </button>
  )
}
