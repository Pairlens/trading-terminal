// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The market-wide tape: every sale on the chain, newest first, above a size.
 *
 * The threshold is the whole pane. An unfiltered NFT tape is thousands of
 * sub-hundred-dollar prints an hour and reads as static; the same feed above
 * fifty thousand dollars is a short list of decisions somebody thought about,
 * which is the only version of this feed worth a pane on a board. So the size
 * floor is a control rather than a constant, and it is sent to the provider
 * rather than applied here: filtering client-side would page fifty dust prints
 * to show none of them.
 *
 * Prices are the collection's own settlement currency with the USD conversion
 * under it, in that order. A whale print is compared against a floor, and
 * floors are quoted in ETH or SOL by every venue that publishes one.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Receipt } from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  NFT_NO_VALUE,
  NFT_VISUAL,
  NftErrorBanner,
  NftMarketplaceBadge,
  NftPaneFallback,
  NftSkeletonRows,
  NftThumbnail,
  nftPanePhase,
} from './nft-pane-primitives'
import type { NftSale } from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PANE_TABLE_BODY, Th } from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftSales } from '@/hooks/use-nft-market'
import { useNftChainFilter } from '@/lib/nft/discovery-filter-store'
import {
  formatNftPrice,
  formatNftUsd,
  formatTokenId,
  shortenAddress,
} from '@/lib/nft/format'
import { formatRelativeTime } from '@/lib/format-time'

/** Prints held. Deeper than the pane shows without a scroll. */
const TAPE_LIMIT = 60

/**
 * The size floors on offer. Zero is every print the provider will serve, and
 * it is offered because on a quiet chain the whale filter empties the pane and
 * the reader needs a way to see that the feed itself is alive.
 */
const THRESHOLDS: ReadonlyArray<number> = [0, 10_000, 100_000, 1_000_000]

export function NftTapePane() {
  const { t } = useTranslation()
  const chain = useNftChainFilter()
  const [minPriceUsd, setMinPriceUsd] = useState<number>(THRESHOLDS[1])

  const { sales, ...status } = useNftSales(
    chain,
    undefined,
    TAPE_LIMIT,
    true,
    minPriceUsd,
  )

  // Newest first, stated here rather than assumed: providers disagree about
  // the order they serve a tape in, and a feed that is mostly descending is
  // worse than one that is not, because nobody checks.
  const rows = useMemo(
    () => [...sales].sort((a, b) => b.timestampMs - a.timestampMs),
    [sales],
  )

  const phase = nftPanePhase(status, rows.length > 0)

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>
        {minPriceUsd > 0
          ? t('nftTape.aboveMetric', { value: formatNftUsd(minPriceUsd) })
          : t('nftTape.allMetric')}
      </PaneHeaderMetric>

      {/* Controls only: the shell header already names the pane. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 pb-1.5">
        {THRESHOLDS.map((floor) => (
          <button
            aria-pressed={minPriceUsd === floor}
            className={cn(
              'h-6 rounded-md px-2 font-mono text-[11px] tabular-nums transition-colors',
              minPriceUsd === floor
                ? cn('font-medium', NFT_VISUAL.activeBg, NFT_VISUAL.text)
                : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={floor}
            onClick={() => setMinPriceUsd(floor)}
            type="button"
          >
            {floor === 0 ? t('nftTape.allSizes') : formatNftUsd(floor)}
          </button>
        ))}
      </div>

      <NftErrorBanner phase={phase} status={status} />

      {phase === 'unsupported' || phase === 'failed' ? (
        <NftPaneFallback
          emptyBody={t('nftTape.emptyBody')}
          emptyTitle={t('nftTape.emptyTitle')}
          icon={Receipt}
          phase={phase}
          status={status}
        />
      ) : phase === 'empty' ? (
        <NftPaneFallback
          // Nothing above the floor is a fact about the floor, not about the
          // chain, and the way out of it is the control directly above.
          emptyBody={
            minPriceUsd > 0
              ? t('nftTape.belowThresholdBody', {
                  value: formatNftUsd(minPriceUsd),
                })
              : t('nftTape.emptyBody')
          }
          emptyTitle={
            minPriceUsd > 0
              ? t('nftTape.belowThresholdTitle')
              : t('nftTape.emptyTitle')
          }
          icon={Receipt}
          phase={phase}
          status={status}
        />
      ) : (
        <div
          aria-busy={phase === 'loading'}
          className="min-h-0 flex-1 overflow-auto"
        >
          {phase === 'loading' ? (
            <SkeletonStatus label={t('nftTape.loadingLabel')} />
          ) : null}
          <table className={cn('w-full border-collapse', PANE_TABLE_BODY)}>
            {/* `bg-card`, not `bg-background`: the pane sits on the column's
                own card surface. */}
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <Th>{t('nftTape.columns.time')}</Th>
                <Th>{t('nftTape.columns.item')}</Th>
                <Th align="right">{t('nftTape.columns.price')}</Th>
                <Th>{t('nftTape.columns.venue')}</Th>
                <Th align="right">{t('nftTape.columns.parties')}</Th>
              </tr>
            </thead>
            <tbody>
              {phase === 'loading' ? (
                <NftSkeletonRows columns={5} rows={8} />
              ) : (
                rows.map((sale, index) => (
                  <SaleRow
                    key={`${sale.txHash ?? sale.tokenId}:${sale.timestampMs}:${index}`}
                    sale={sale}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SaleRow({ sale }: { sale: NftSale }) {
  const { t } = useTranslation()

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
        {formatRelativeTime(sale.timestampMs)}
      </td>
      <td className="max-w-0 py-1.5 pr-3">
        <span className="flex items-center gap-2">
          <NftThumbnail className="size-5" imageUrl={sale.imageUrl} />
          <span className="min-w-0 truncate">
            {sale.name ?? formatTokenId(sale.tokenId)}
          </span>
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right">
        <span className="block">
          {formatNftPrice(sale.price, sale.priceCurrency)}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {sale.priceUsd == null ? NFT_NO_VALUE : formatNftUsd(sale.priceUsd)}
        </span>
      </td>
      <td className="py-1.5 pr-3">
        <NftMarketplaceBadge marketplace={sale.marketplace} />
      </td>
      <td className="py-1.5 text-right whitespace-nowrap text-muted-foreground">
        <span title={t('nftTape.partiesHint')}>
          {shortenAddress(sale.seller)} → {shortenAddress(sale.buyer)}
        </span>
      </td>
    </tr>
  )
}
