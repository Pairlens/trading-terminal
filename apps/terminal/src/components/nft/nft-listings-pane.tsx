// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ask side, flat.
 *
 * The ladder next door draws the same rows as depth, which answers "how much is
 * offered". This one answers the other half of the question a buyer actually
 * has: WHICH ones. Sweeping the floor of a collection means taking specific
 * tokens with specific ranks off specific venues, and a depth bar cannot carry
 * a thumbnail, a rarity rank and an expiry at once.
 *
 * Cheapest first, always. A listings table sorted any other way is a catalogue,
 * and the floor is the first row by definition.
 *
 * The expiry column is not decoration. A listing that lapses in twenty minutes
 * is not depth a sweep can count on, and every marketplace that publishes one
 * publishes it for that reason.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ListOrdered } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain } from '@pairlens/shared/nft-types'
import {
  PANE_FOOTNOTE,
  PANE_TABLE_BODY,
  PaneEmpty,
  Th,
} from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import {
  NFT_NO_VALUE,
  NftErrorBanner,
  NftPaneFallback,
  NftThumbnail,
  nftMarketplaceLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { NftLoadingRows } from '@/components/nft/nft-board-skeletons'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftListings } from '@/hooks/use-nft-market'
import { formatNftPrice, formatNftUsd, formatTokenId } from '@/lib/nft/format'
import { formatTimeUntil } from '@/lib/format-time'

export function NftListingsPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftListings.noPairBody')}
        icon={ListOrdered}
        title={t('nftListings.noPairTitle')}
      />
    )
  }

  return <NftListingsInner chain={target.chain} contract={target.contract} />
}

function NftListingsInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { listings, ...status } = useNftListings(chain, contract)
  const phase = nftPanePhase(status, listings.length > 0)

  const sorted = useMemo(
    () => [...listings].sort((a, b) => a.price - b.price),
    [listings],
  )

  if (phase === 'loading') {
    return (
      <NftLoadingRows
        cells={['w-16', 'w-14', 'w-8', 'w-10', 'w-10']}
        label={t('nftListings.loadingLabel')}
        template="grid-cols-[1fr_auto_auto_auto_auto]"
        thumbnail
      />
    )
  }

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftListings.emptyBody')}
        emptyTitle={t('nftListings.emptyTitle')}
        icon={ListOrdered}
        phase={phase}
        status={status}
      />
    )
  }

  const currency = sorted[0]?.priceCurrency

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftListings.count', { count: sorted.length })}
      </PaneHeaderMetric>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className={cn('w-full', PANE_TABLE_BODY)}>
          {/* The column's own card surface: a sticky bg-background head reads
              as a hole once the pane sits on a --card column. */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th>{t('nftListings.columns.item')}</Th>
              <Th align="right">{t('nftListings.columns.price')}</Th>
              <Th align="right">{t('nftListings.columns.rank')}</Th>
              <Th>{t('nftListings.columns.venue')}</Th>
              <Th align="right">{t('nftListings.columns.expires')}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((listing, index) => (
              <tr
                className="border-none"
                key={`${listing.tokenId}-${listing.orderId ?? index}`}
              >
                <td className="py-[3px] pr-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <NftThumbnail
                      className="size-5 rounded-[4px]"
                      imageUrl={listing.imageUrl}
                    />
                    <span className="truncate" title={listing.name}>
                      {formatTokenId(listing.tokenId)}
                    </span>
                  </div>
                </td>
                <td className="py-[3px] pr-3 text-right">
                  <div className="text-down">
                    {formatNftPrice(listing.price, listing.priceCurrency)}
                  </div>
                  {listing.priceUsd != null && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatNftUsd(listing.priceUsd)}
                    </div>
                  )}
                </td>
                <td className="py-[3px] pr-3 text-right text-muted-foreground">
                  {listing.rarityRank != null
                    ? `#${listing.rarityRank}`
                    : NFT_NO_VALUE}
                </td>
                <td className="py-[3px] pr-3 text-[10px] uppercase tracking-[.04em] text-muted-foreground">
                  {t(nftMarketplaceLabelKey(listing.marketplace))}
                </td>
                <td className="py-[3px] text-right text-muted-foreground">
                  {listing.expiresMs
                    ? formatTimeUntil(listing.expiresMs)
                    : NFT_NO_VALUE}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-2 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftListings.footnote', {
            floor: formatNftPrice(sorted[0]?.price, currency),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}
