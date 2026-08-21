// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chain rail: which chain the rest of the board is looking at.
 *
 * NFT data is chain-scoped at the provider, so this is not a filter over one
 * result set the way a category rail is: it is the argument every other pane
 * on the board passes. Picking Base re-asks for rankings, movers, mints and
 * the tape.
 *
 * The rows come off the installed manifests rather than a fetch, which is what
 * lets the rail be complete on the first frame. A provider that declares `*`
 * names no chains at all, and a rail that went blank on the most capable
 * provider would be exactly backwards, so that case falls back to every chain
 * the terminal knows.
 *
 * The volume share beside each row is the market overview's own `chainShare`,
 * and it is the cheap read: one market-wide request the overview strip is
 * already making, not a per-chain sweep. Where the provider does not publish
 * it the column simply is not drawn, rather than being invented from the
 * rankings page the rail happens to have.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Gem } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { NFT_CHAINS } from '@pairlens/shared/nft-types'
import {
  NFT_NO_VALUE,
  NFT_VISUAL,
  NftPaneFallback,
  NftShareBar,
  formatNftShare,
  nftChainLabelKey,
  nftPanePhase,
} from './nft-pane-primitives'
import type { NftChain } from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftChains, useNftOverview } from '@/hooks/use-nft-market'
import {
  useNftChainFilter,
  useNftFilterStore,
} from '@/lib/nft/discovery-filter-store'

export function NftChainsPane() {
  const { t } = useTranslation()
  const served = useNftChains()
  const chain = useNftChainFilter()
  const setChain = useNftFilterStore((s) => s.setChain)
  const { overview, ...status } = useNftOverview()

  /**
   * Declared order, not manifest order: two providers listing the same chains
   * in different orders must not reshuffle the rail when one of them is
   * enabled.
   */
  const chains = useMemo(() => {
    if (served.length === 0) return NFT_CHAINS
    const declared = new Set<NftChain>(served)
    return NFT_CHAINS.filter((c) => declared.has(c))
  }, [served])

  const shares = useMemo(() => {
    const map = new Map<NftChain, number>()
    for (const entry of overview?.chainShare ?? [])
      map.set(entry.chain, entry.share)
    return map
  }, [overview])

  const phase = nftPanePhase(
    // The rows themselves never fail: they are read off the manifests. Only
    // the share column is fetched, and it degrades to blank rather than
    // emptying a rail the board depends on.
    { ...status, error: null, isLoading: false },
    chains.length > 0,
  )

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftChains.emptyBody')}
        emptyTitle={t('nftChains.emptyTitle')}
        icon={Gem}
        phase={phase}
        status={status}
      />
    )
  }

  const waiting = status.isLoading && shares.size === 0

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>
        {shares.size > 0 || waiting
          ? t('nftChains.subtitleShare')
          : t('nftChains.subtitle')}
      </PaneHeaderMetric>

      <div aria-busy={waiting} className="min-h-0 flex-1 overflow-y-auto">
        {waiting ? (
          <SkeletonStatus label={t('nftChains.loadingLabel')} />
        ) : null}
        {chains.map((row, index) => (
          <ChainRow
            chain={row}
            index={index}
            key={row}
            onSelect={() => setChain(row)}
            selected={row === chain}
            share={shares.get(row) ?? null}
            waiting={waiting}
          />
        ))}
      </div>
    </div>
  )
}

function ChainRow({
  chain,
  index,
  onSelect,
  selected,
  share,
  waiting,
}: {
  chain: NftChain
  /** Position in the rail, which staggers the shimmer down the column. */
  index: number
  onSelect: () => void
  selected: boolean
  share: number | null
  waiting: boolean
}) {
  const { t } = useTranslation()
  const label = t(nftChainLabelKey(chain))

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'w-full rounded-md px-1.5 py-2 text-left transition-colors',
        selected ? NFT_VISUAL.activeBg : 'hover:bg-muted/40',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'truncate text-[13px]',
            selected ? cn('font-medium', NFT_VISUAL.text) : '',
          )}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {share !== null ? (
            formatNftShare(share)
          ) : waiting ? (
            <Shimmer className="h-3 w-9" delayIndex={index} />
          ) : (
            NFT_NO_VALUE
          )}
        </span>
      </div>

      <div className="mt-1.5">
        {share === null && waiting ? (
          <Shimmer className="h-1.5 w-full rounded-full" delayIndex={index} />
        ) : (
          <NftShareBar
            fraction={share ?? 0}
            tone={selected ? 'accent' : 'muted'}
          />
        )}
      </div>
    </button>
  )
}
