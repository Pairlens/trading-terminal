// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The tape, for this collection.
 *
 * Listings say what sellers want and offers say what buyers will pay. Only the
 * tape says what actually cleared, which is why every trading surface in this
 * terminal has one and why an NFT board is no different. The floor can sit at
 * 12 ETH all afternoon with nothing trading under 14; the prints are how you
 * find that out.
 *
 * Newest first, both currencies on the price. An NFT print is denominated in
 * the settlement currency by contract, and a reader comparing today's clears to
 * last month's needs the USD beside it because the settlement currency moved
 * too.
 *
 * Buyer and seller are shown because on a thin collection the same two wallets
 * printing back and forth IS the volume, and a tape that hides the
 * counterparties hides the wash.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'

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
  NftErrorBanner,
  NftPaneFallback,
  NftThumbnail,
  nftMarketplaceLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { NftLoadingRows } from '@/components/nft/nft-board-skeletons'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftSales } from '@/hooks/use-nft-market'
import {
  formatNftPrice,
  formatNftUsd,
  formatTokenId,
  shortenAddress,
} from '@/lib/nft/format'
import { formatRelativeTime } from '@/lib/format-time'

export function NftSalesPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftSales.noPairBody')}
        icon={History}
        title={t('nftSales.noPairTitle')}
      />
    )
  }

  return <NftSalesInner chain={target.chain} contract={target.contract} />
}

function NftSalesInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { sales, ...status } = useNftSales(chain, contract)
  const phase = nftPanePhase(status, sales.length > 0)

  const sorted = useMemo(
    () => [...sales].sort((a, b) => b.timestampMs - a.timestampMs),
    [sales],
  )

  if (phase === 'loading') {
    return (
      <NftLoadingRows
        cells={['w-12', 'w-16', 'w-14', 'w-10', 'w-14', 'w-14']}
        label={t('nftSales.loadingLabel')}
        template="grid-cols-[auto_1fr_auto_auto_auto_auto]"
        thumbnail
      />
    )
  }

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftSales.emptyBody')}
        emptyTitle={t('nftSales.emptyTitle')}
        icon={History}
        phase={phase}
        status={status}
      />
    )
  }

  // What the tape itself says the collection is clearing at, which is a
  // different number from the floor and the only one derived from fills.
  const average =
    sorted.reduce((sum, sale) => sum + sale.price, 0) / sorted.length
  const currency = sorted[0]?.priceCurrency

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftSales.prints', { count: sorted.length })}
      </PaneHeaderMetric>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className={cn('w-full', PANE_TABLE_BODY)}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th>{t('nftSales.columns.time')}</Th>
              <Th>{t('nftSales.columns.item')}</Th>
              <Th align="right">{t('nftSales.columns.price')}</Th>
              <Th>{t('nftSales.columns.venue')}</Th>
              <Th>{t('nftSales.columns.buyer')}</Th>
              <Th>{t('nftSales.columns.seller')}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sale, index) => (
              <tr
                className="border-none"
                key={`${sale.txHash ?? sale.tokenId}-${sale.timestampMs}-${index}`}
              >
                <td className="whitespace-nowrap py-[3px] pr-3 text-muted-foreground">
                  {formatRelativeTime(sale.timestampMs)}
                </td>
                <td className="py-[3px] pr-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <NftThumbnail
                      className="size-5 rounded-[4px]"
                      imageUrl={sale.imageUrl}
                    />
                    <span className="truncate" title={sale.name}>
                      {formatTokenId(sale.tokenId)}
                    </span>
                  </div>
                </td>
                <td className="py-[3px] pr-3 text-right">
                  <div>{formatNftPrice(sale.price, sale.priceCurrency)}</div>
                  {sale.priceUsd != null && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatNftUsd(sale.priceUsd)}
                    </div>
                  )}
                </td>
                <td className="py-[3px] pr-3 text-[10px] uppercase tracking-[.04em] text-muted-foreground">
                  {t(nftMarketplaceLabelKey(sale.marketplace))}
                </td>
                <td className="py-[3px] pr-3 text-muted-foreground">
                  {shortenAddress(sale.buyer)}
                </td>
                <td className="py-[3px] text-muted-foreground">
                  {shortenAddress(sale.seller)}
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
          {t('nftSales.footnote', {
            count: sorted.length,
            average: formatNftPrice(average, currency),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}
