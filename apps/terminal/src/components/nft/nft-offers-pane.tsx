// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bid side, and the one number a holder can actually sell into.
 *
 * A floor is what somebody is asking. A collection offer is what somebody is
 * PAYING, right now, for any token in the set, and it is the only price on this
 * board a holder can hit without waiting for a buyer. That is why the offers
 * pane exists as its own surface rather than as half of the ladder: the ladder
 * shows the shape of the bid, this shows who is behind it and for how many.
 *
 * Scope is the column people miss. Three offers at the same price mean very
 * different things depending on whether they are collection-wide (any token
 * takes them), trait-scoped (only a Gold Fur does) or token-specific (only
 * #4821 does). Aggregating them into one depth number would be arithmetic on
 * three different instruments, so the scope rides in the row.
 *
 * Highest first. A bid ladder read any other way buries the only bid worth
 * looking at.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain, NftOffer } from '@pairlens/shared/nft-types'
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
  nftMarketplaceLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftOffers } from '@/hooks/use-nft-market'
import {
  formatNftCount,
  formatNftPrice,
  formatTokenId,
  shortenAddress,
} from '@/lib/nft/format'
import { formatTimeUntil } from '@/lib/format-time'

export function NftOffersPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftOffers.noPairBody')}
        icon={Coins}
        title={t('nftOffers.noPairTitle')}
      />
    )
  }

  return <NftOffersInner chain={target.chain} contract={target.contract} />
}

function NftOffersInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { offers, ...status } = useNftOffers(chain, contract)
  const phase = nftPanePhase(status, offers.length > 0)

  const sorted = useMemo(
    () => [...offers].sort((a, b) => b.price - a.price),
    [offers],
  )

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftOffers.emptyBody')}
        emptyTitle={t('nftOffers.emptyTitle')}
        icon={Coins}
        phase={phase}
        status={status}
      />
    )
  }

  const currency = sorted[0]?.priceCurrency
  const bidTotal = sorted.reduce(
    (sum, offer) => sum + offer.price * Math.max(1, offer.quantity),
    0,
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftOffers.topBid', {
          price: formatNftPrice(sorted[0]?.price, currency),
        })}
      </PaneHeaderMetric>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className={cn('w-full', PANE_TABLE_BODY)}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th align="right">{t('nftOffers.columns.price')}</Th>
              <Th align="right">{t('nftOffers.columns.quantity')}</Th>
              <Th align="right">{t('nftOffers.columns.value')}</Th>
              <Th>{t('nftOffers.columns.scope')}</Th>
              <Th>{t('nftOffers.columns.venue')}</Th>
              <Th>{t('nftOffers.columns.bidder')}</Th>
              <Th align="right">{t('nftOffers.columns.expires')}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((offer, index) => {
              const quantity = Math.max(1, offer.quantity)
              return (
                <tr
                  className="border-none"
                  key={`${offer.price}-${offer.orderId ?? index}`}
                >
                  <td className="py-[3px] pr-3 text-right text-up">
                    {formatNftPrice(offer.price, offer.priceCurrency)}
                  </td>
                  <td className="py-[3px] pr-3 text-right">
                    {formatNftCount(quantity)}
                  </td>
                  <td className="py-[3px] pr-3 text-right text-muted-foreground">
                    {formatNftPrice(
                      offer.price * quantity,
                      offer.priceCurrency,
                    )}
                  </td>
                  <td className="max-w-[110px] truncate py-[3px] pr-3">
                    <OfferScope offer={offer} />
                  </td>
                  <td className="py-[3px] pr-3 text-[10px] uppercase tracking-[.04em] text-muted-foreground">
                    {t(nftMarketplaceLabelKey(offer.marketplace))}
                  </td>
                  <td className="py-[3px] pr-3 text-muted-foreground">
                    {shortenAddress(offer.bidder)}
                  </td>
                  <td className="py-[3px] text-right text-muted-foreground">
                    {offer.expiresMs
                      ? formatTimeUntil(offer.expiresMs)
                      : NFT_NO_VALUE}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-2 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftOffers.footnote', {
            value: formatNftPrice(bidTotal, currency),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}

/**
 * Collection-wide, one trait, or one token. Said in words, because the
 * difference decides whether a holder's own token can take the bid.
 */
function OfferScope({ offer }: { offer: NftOffer }) {
  const { t } = useTranslation()

  if (offer.tokenId) {
    return <span className="text-[10.5px]">{formatTokenId(offer.tokenId)}</span>
  }
  if (offer.trait) {
    const label = `${offer.trait.key}: ${offer.trait.value}`
    return (
      <span className="text-[10.5px]" title={label}>
        {label}
      </span>
    )
  }
  return (
    <span className="text-[10.5px] text-muted-foreground">
      {t('nftOffers.scopeCollection')}
    </span>
  )
}
