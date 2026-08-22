// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Mint watch: collections that were deployed recently and are seeing volume.
 *
 * Its own query rather than a slice of the rankings, because "newest" is a
 * ranking the provider serves and the newest fifty collections and the
 * highest-volume fifty barely overlap: a mint that deployed this morning is
 * nowhere near the volume table, which is the entire point of watching for it.
 *
 * Age is what makes the row readable, and it is the one column the reader
 * cannot infer. Floor and volume beside it answer the follow-up: a collection
 * three hours old with real volume is a mint that landed, and the same age
 * with a floor and no volume is a listing wall nobody has hit.
 */
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  NFT_NO_VALUE,
  NFT_VISUAL,
  NftErrorBanner,
  NftPaneFallback,
  NftSkeletonRows,
  NftThumbnail,
  nftPanePhase,
} from './nft-pane-primitives'
import type { NftCollectionSummary } from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PANE_TABLE_BODY, Th } from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftCollections } from '@/hooks/use-nft-market'
import { useNftChainFilter } from '@/lib/nft/discovery-filter-store'
import { formatNftCount, formatNftPrice, formatNftUsd } from '@/lib/nft/format'
import { useNftSelect } from '@/lib/nft/navigate'
import { formatRelativeTime } from '@/lib/format-time'

export function NftMintsPane() {
  const { t } = useTranslation()
  const chain = useNftChainFilter()
  const select = useNftSelect()
  const { collections, ...status } = useNftCollections({
    chain,
    sort: 'newest',
  })
  const phase = nftPanePhase(status, collections.length > 0)

  if (
    phase === 'unsupported' ||
    phase === 'needsKey' ||
    phase === 'failed' ||
    phase === 'empty'
  ) {
    return (
      <NftPaneFallback
        emptyBody={t('nftMints.emptyBody')}
        emptyTitle={t('nftMints.emptyTitle')}
        icon={Sparkles}
        phase={phase}
        status={status}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>{t('nftMints.subtitle')}</PaneHeaderMetric>
      <NftErrorBanner phase={phase} status={status} />

      <div
        aria-busy={phase === 'loading'}
        className="min-h-0 flex-1 overflow-auto"
      >
        {phase === 'loading' ? (
          <SkeletonStatus label={t('nftMints.loadingLabel')} />
        ) : null}
        <table className={cn('w-full border-collapse', PANE_TABLE_BODY)}>
          {/* `bg-card`, not `bg-background`: the pane sits on the column's own
              card surface. */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <Th>{t('nftMints.columns.collection')}</Th>
              <Th align="right">{t('nftMints.columns.age')}</Th>
              <Th align="right">{t('nftMints.columns.floor')}</Th>
              <Th align="right">{t('nftMints.columns.volume')}</Th>
              <Th align="right">{t('nftMints.columns.supply')}</Th>
            </tr>
          </thead>
          <tbody>
            {phase === 'loading' ? (
              <NftSkeletonRows columns={5} rows={6} thumb />
            ) : (
              collections.map((row) => (
                <MintRow
                  key={`${row.chain}:${row.contract}`}
                  onSelect={() =>
                    select({
                      chain: row.chain,
                      contract: row.contract,
                      summary: row,
                    })
                  }
                  row={row}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MintRow({
  row,
  onSelect,
}: {
  row: NftCollectionSummary
  onSelect: () => void
}) {
  return (
    <tr
      className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40"
      onClick={onSelect}
    >
      <td className="max-w-0 py-1.5 pr-3">
        <span className="flex items-center gap-2">
          <NftThumbnail imageUrl={row.imageUrl} />
          <span className="min-w-0 truncate font-sans text-[12px]">
            {row.name}
          </span>
        </span>
      </td>
      <td
        className={cn(
          'py-1.5 pr-3 text-right',
          row.deployedMs == null ? 'text-muted-foreground' : NFT_VISUAL.text,
        )}
      >
        {/* A collection with no deploy timestamp is not "new", it is unknown,
            and dating it from the provider's ranking position would invent a
            number the row does not carry. */}
        {row.deployedMs == null
          ? NFT_NO_VALUE
          : formatRelativeTime(row.deployedMs)}
      </td>
      <td className="py-1.5 pr-3 text-right">
        {formatNftPrice(row.floorPrice, row.priceCurrency)}
      </td>
      <td className="py-1.5 pr-3 text-right">
        {row.volume24hUsd != null
          ? formatNftUsd(row.volume24hUsd)
          : formatNftPrice(row.volume24h, row.priceCurrency)}
      </td>
      <td className="py-1.5 text-right">{formatNftCount(row.totalSupply)}</td>
    </tr>
  )
}
