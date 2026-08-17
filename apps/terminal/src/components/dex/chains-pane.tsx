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
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { ShareBar } from '@/components/dex/dex-pane-primitives'
import { useChainGas, useDexChains } from '@/hooks/use-dex-chains'
import { useChainStats } from '@/hooks/use-pool-stats'
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

  const { byMarket, isLoading } = useChainStats(markets, displayNames)
  const { gweiByMarket } = useChainGas(rows)

  // The board opens on a chain rather than on nothing: the first connected
  // one, which is also what the pool map needs before it can rank anything.
  const firstConnected = connected[0]?.market ?? null
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
      <header className="shrink-0 border-b border-border px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">{t('dexChains.title')}</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {coverage === 'network'
            ? t('dexChains.subtitleNetwork')
            : t('dexChains.subtitleSampled')}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => (
          <ChainRow
            key={row.market}
            row={row}
            selected={row.market === chain}
            onSelect={() => row.connected && setChain(row.market)}
            volumeUsd={byMarket.get(row.market)?.volume24hUsd ?? null}
            reserveUsd={byMarket.get(row.market)?.reserveUsd ?? null}
            poolsCount={byMarket.get(row.market)?.poolsCount ?? null}
            peakVolume={peakVolume}
            gwei={gweiByMarket.get(row.market) ?? null}
            loading={isLoading}
          />
        ))}
      </div>
    </div>
  )
}

function ChainRow({
  row,
  selected,
  onSelect,
  volumeUsd,
  reserveUsd,
  poolsCount,
  peakVolume,
  gwei,
  loading,
}: {
  row: DexChainRow
  selected: boolean
  onSelect: () => void
  volumeUsd: number | null
  reserveUsd: number | null
  poolsCount: number | null
  peakVolume: number
  gwei: number | null
  loading: boolean
}) {
  const { t } = useTranslation()
  const share = peakVolume > 0 && volumeUsd ? volumeUsd / peakVolume : 0

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
          {volumeUsd === null
            ? loading && row.connected
              ? ''
              : '—'
            : formatCompactUsd(volumeUsd)}
        </span>
      </div>

      <div className="mt-1.5">
        <ShareBar fraction={share} tone={selected ? 'accent' : 'muted'} />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {reserveUsd !== null
            ? t('dexChains.liquidityValue', {
                value: formatCompactUsd(reserveUsd),
              })
            : poolsCount !== null
              ? t('dexChains.poolsValue', { count: poolsCount })
              : row.connected
                ? ''
                : t('dexChains.notInstalled')}
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
      <div className="border-b border-border/50 px-3 py-2.5 opacity-55">
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
        'w-full border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/40',
        selected && 'border-l-2 border-l-primary bg-primary/10 pl-[10px]',
      )}
    >
      {body}
    </button>
  )
}
