// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The market strip: is the whole NFT market up today, and where is it trading.
 *
 * Four numbers and a bar, at a height that fits above a rankings table without
 * taking a row from it. The four are deliberately market-wide rather than
 * chain-scoped: the rail beside this one already narrows every other pane, and
 * a "total volume" that silently meant Base would be the strip contradicting
 * the board.
 *
 * The marketplace bar is the piece a price cannot say. Volume moving from
 * OpenSea to Blur is the same market with different fee and royalty economics
 * behind every fill, and a trader routing an order cares which one is actually
 * carrying the flow today.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Gem } from 'lucide-react'

import {
  NftChangeCell,
  NftErrorBanner,
  NftPaneFallback,
  formatNftShare,
  nftMarketplaceLabelKey,
  nftPanePhase,
} from './nft-pane-primitives'
import type { NftMarketOverview } from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftOverview } from '@/hooks/use-nft-market'
import { formatNftChange, formatNftCount, formatNftUsd } from '@/lib/nft/format'

/** Segments the bar draws before the tail is rolled into one block. */
const MAX_SEGMENTS = 5

export function NftOverviewPane() {
  const { t } = useTranslation()
  const { overview, ...status } = useNftOverview()
  const phase = nftPanePhase(status, overview !== null)

  const shares = useMemo(() => {
    const all = [...(overview?.marketplaceShare ?? [])].sort(
      (a, b) => b.share - a.share,
    )
    return all.slice(0, MAX_SEGMENTS)
  }, [overview])

  if (
    phase === 'unsupported' ||
    phase === 'needsKey' ||
    phase === 'failed' ||
    phase === 'empty'
  ) {
    return (
      <NftPaneFallback
        emptyBody={t('nftOverview.emptyBody')}
        emptyTitle={t('nftOverview.emptyTitle')}
        icon={Gem}
        phase={phase}
        status={status}
      />
    )
  }

  const loading = phase === 'loading'

  return (
    <div aria-busy={loading} className="@container flex h-full flex-col">
      <PaneHeaderMetric>{t('nftOverview.subtitle')}</PaneHeaderMetric>
      {loading ? (
        <SkeletonStatus label={t('nftOverview.loadingLabel')} />
      ) : null}
      <NftErrorBanner phase={phase} status={status} />

      <div className="grid shrink-0 grid-cols-2 gap-x-4 @[26rem]:grid-cols-4">
        <Stat
          change={overview?.volumeChange24h}
          index={0}
          label={t('nftOverview.volume')}
          loading={loading}
          value={formatNftUsd(overview?.volume24hUsd)}
        />
        <Stat
          index={1}
          label={t('nftOverview.marketCap')}
          loading={loading}
          value={formatNftUsd(overview?.marketCapUsd)}
        />
        <Stat
          change={overview?.salesChange24h}
          index={2}
          label={t('nftOverview.sales')}
          loading={loading}
          value={formatNftCount(overview?.sales24h)}
        />
        <Stat
          index={3}
          label={t('nftOverview.traders')}
          loading={loading}
          value={formatNftCount(overview?.traders24h)}
        />
      </div>

      <MarketplaceShare loading={loading} shares={shares} />
    </div>
  )
}

function Stat({
  change,
  index,
  label,
  loading,
  value,
}: {
  change?: number
  /** Position in the strip, which staggers the shimmer across it. */
  index: number
  label: string
  loading: boolean
  value: string
}) {
  return (
    // No horizontal padding: the grid's own gap separates the cells and the
    // column's inset already holds the strip off the pane edge.
    <div className="min-w-0 py-1">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      {loading ? (
        <Shimmer className="mt-1 h-4 w-16" delayIndex={index} />
      ) : (
        <p className="truncate font-mono text-[15px] font-semibold tabular-nums">
          {value}
        </p>
      )}
      {change == null ? null : (
        <NftChangeCell
          className="block truncate font-mono text-[10px]"
          fraction={change}
          text={formatNftChange(change)}
        />
      )}
    </div>
  )
}

/**
 * Where the day's volume filled, as one stacked bar.
 *
 * One bar rather than a row of percentages: the question is what share of the
 * market each venue holds, and a stack answers it without the reader adding
 * five numbers up. Absent entirely when the provider does not publish the
 * split, because an empty bar reads as "nobody traded anywhere".
 */
function MarketplaceShare({
  loading,
  shares,
}: {
  loading: boolean
  shares: NonNullable<NftMarketOverview['marketplaceShare']>
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="mt-1.5 shrink-0">
        <Shimmer className="h-1.5 w-full rounded-full" />
      </div>
    )
  }
  if (shares.length === 0) return null

  return (
    <div className="mt-1.5 flex shrink-0 flex-col gap-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {shares.map((entry, index) => (
          <span
            key={entry.marketplace}
            style={{
              width: `${Math.max(0, entry.share * 100)}%`,
              background: `var(--chart-${(index % 5) + 1})`,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {shares.map((entry, index) => (
          <span
            className="flex items-center gap-1 text-[10px] text-muted-foreground"
            key={entry.marketplace}
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: `var(--chart-${(index % 5) + 1})` }}
            />
            {t(nftMarketplaceLabelKey(entry.marketplace))}
            <span className="font-mono tabular-nums">
              {formatNftShare(entry.share)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
