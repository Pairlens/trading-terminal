// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The claim this whole asset class is built on: a collection is a market with a
 * bid, an ask and a tape, and here is its book.
 *
 * Every NFT site draws the ask side as a shopping grid, which hides the only
 * two numbers a trader wants: how much is really offered above the floor, and
 * how much is really bid below it. Both are here, on one price axis, with
 * cumulative depth behind the rows exactly as the CEX book draws it.
 *
 * The two sides are not symmetric, and the pane does not pretend they are.
 *
 * An ask is ONE token. A buyer sweeping the floor is buying specific token ids
 * and inheriting their rarity, so every ask rung names the token and its rank:
 * aggregating them into "4 at 12.1 ETH" would hide the trade. A bid genuinely
 * aggregates, because a collection offer for any 5 tokens at 11.8 is five units
 * of executable size at one price. That asymmetry is why an NFT bid side is a
 * real depth curve and the ask side is a queue.
 *
 * Both sides arrive in one read, stamped with `asOfMs`. Fetching them
 * separately would let a withdrawn bid and a stale ask render a crossed book
 * that never existed, and the freshness stamp is printed rather than implied,
 * because a twenty-second-old book and a five-minute-old one are different
 * instruments to hit.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type {
  NftBook,
  NftChain,
  NftListing,
  NftOffer,
} from '@pairlens/shared/nft-types'
import { PANE_FOOTNOTE, PaneEmpty } from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import {
  NFT_NO_VALUE,
  NftErrorBanner,
  NftPaneFallback,
  nftMarketplaceLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftBook } from '@/hooks/use-nft-market'
import {
  magnitudeFillColor,
  magnitudeIntensity,
} from '@/components/terminal/magnitude-intensity'
import { formatNftPrice, formatTokenId } from '@/lib/nft/format'
import { formatRelativeTime } from '@/lib/format-time'

/** Rungs drawn per side. Deeper than this is scroll, not information. */
const MAX_RUNGS = 12

export type NftBookSelection =
  | { side: 'ask'; listing: NftListing }
  | { side: 'bid'; offer: NftOffer }

/**
 * `onSelect` is optional on purpose. The board mounts this pane by id and hands
 * it no props, so with nothing wired the rungs are plain rows rather than
 * buttons that go nowhere. A host that has somewhere to send a click (a ticket
 * prefill) passes the handler and the rows become targets.
 */
export function NftBookPane({
  onSelect,
}: {
  onSelect?: (selection: NftBookSelection) => void
}) {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftBook.noPairBody')}
        icon={BookOpen}
        title={t('nftBook.noPairTitle')}
      />
    )
  }

  return (
    <NftBookInner
      chain={target.chain}
      contract={target.contract}
      onSelect={onSelect}
    />
  )
}

type Rung = {
  price: number
  cumulative: number
  /** This rung's own size, which sets the tint. Always 1 on the ask side. */
  quantity: number
}

type AskRung = Rung & { listing: NftListing }
type BidRung = Rung & { offer: NftOffer }

function NftBookInner({
  chain,
  contract,
  onSelect,
}: {
  chain: NftChain
  contract: string
  onSelect?: (selection: NftBookSelection) => void
}) {
  const { t } = useTranslation()
  const { book, ...status } = useNftBook(chain, contract)
  const hasRows = Boolean(book && (book.asks.length || book.bids.length))
  const phase = nftPanePhase(status, hasRows)

  const ladder = useMemo(() => buildLadder(book), [book])

  if (phase !== 'ready' || !book || !ladder) {
    return (
      <NftPaneFallback
        emptyBody={t('nftBook.emptyBody')}
        emptyTitle={t('nftBook.emptyTitle')}
        icon={BookOpen}
        phase={phase}
        status={status}
      />
    )
  }

  const { asks, bids, maxCumulative, reference } = ladder
  const bestAsk = asks.length ? asks[asks.length - 1].price : null
  const bestBid = bids.length ? bids[0].price : null
  const mid =
    bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : null
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftBook.asOf', { when: formatRelativeTime(book.asOfMs) })}
      </PaneHeaderMetric>

      <div className="grid shrink-0 grid-cols-[1fr_auto_auto_auto] gap-x-2 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        <span>{t('nftBook.columns.price')}</span>
        <span className="text-right">{t('nftBook.columns.item')}</span>
        <span className="text-right">{t('nftBook.columns.rank')}</span>
        <span className="text-right">{t('nftBook.columns.venue')}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Asks descend to the mid, so the best ask is the row touching the
            spread. Same reading order as the CEX book. */}
        <div className="flex flex-col justify-end">
          {asks.map((rung) => (
            <BookRow
              currency={book.priceCurrency}
              key={`${rung.listing.tokenId}-${rung.listing.orderId ?? rung.price}`}
              maxCumulative={maxCumulative}
              onClick={
                onSelect
                  ? () => onSelect({ side: 'ask', listing: rung.listing })
                  : undefined
              }
              reference={reference}
              rung={rung}
              side="ask"
            />
          ))}
        </div>

        <div className="my-0.5 flex shrink-0 items-baseline justify-between gap-2 py-1 font-mono text-[11px] tabular-nums">
          <span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            {t('nftBook.mid')}
          </span>
          <span className="font-semibold">
            {formatNftPrice(mid, book.priceCurrency)}
          </span>
          <span className="text-muted-foreground">
            {spread === null || mid === null || mid <= 0
              ? NFT_NO_VALUE
              : t('nftBook.spread', {
                  amount: formatNftPrice(spread, book.priceCurrency),
                  percent: ((spread / mid) * 100).toFixed(1),
                })}
          </span>
        </div>

        <div className="flex flex-col">
          {bids.map((rung) => (
            <BookRow
              currency={book.priceCurrency}
              key={`${rung.price}-${rung.offer.orderId ?? rung.offer.marketplace}`}
              maxCumulative={maxCumulative}
              onClick={
                onSelect
                  ? () => onSelect({ side: 'bid', offer: rung.offer })
                  : undefined
              }
              reference={reference}
              rung={rung}
              side="bid"
            />
          ))}
        </div>
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-3 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftBook.depthSummary', {
            asks: asks.length,
            bids: bids.reduce((sum, r) => sum + r.quantity, 0),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}

/**
 * Both sides, cumulated, capped, and sharing one depth scale.
 *
 * One scale rather than two is the whole point: a bar that is full on each side
 * says the sides are equal, and on an NFT book they almost never are. Fifty
 * listings above a floor that three wallets are bidding under is exactly the
 * imbalance a trader is looking for, and per-side normalisation erases it.
 */
function buildLadder(book: NftBook | null): {
  asks: Array<AskRung>
  bids: Array<BidRung>
  maxCumulative: number
  reference: number
} | null {
  if (!book) return null

  const sortedAsks = [...book.asks]
    .filter((a) => Number.isFinite(a.price))
    .sort((a, b) => a.price - b.price)
    .slice(0, MAX_RUNGS)
  const sortedBids = [...book.bids]
    .filter((b) => Number.isFinite(b.price))
    .sort((a, b) => b.price - a.price)
    .slice(0, MAX_RUNGS)

  let askCumulative = 0
  const asks: Array<AskRung> = sortedAsks.map((listing) => {
    askCumulative += 1
    return {
      price: listing.price,
      cumulative: askCumulative,
      quantity: 1,
      listing,
    }
  })

  let bidCumulative = 0
  const bids: Array<BidRung> = sortedBids.map((offer) => {
    const quantity = Math.max(1, Math.round(offer.quantity || 1))
    bidCumulative += quantity
    return { price: offer.price, cumulative: bidCumulative, quantity, offer }
  })

  const maxCumulative = Math.max(askCumulative, bidCumulative, 1)
  // The tint reads a rung's OWN size against the biggest single rung, so one
  // 40-item collection offer stands out from a wall of ones.
  const reference = Math.max(
    1,
    ...bids.map((b) => b.quantity),
    ...asks.map((a) => a.quantity),
  )

  // Rendered top-down, so asks run from the far side of the book to the mid.
  asks.reverse()
  return { asks, bids, maxCumulative, reference }
}

function BookRow({
  rung,
  side,
  currency,
  maxCumulative,
  reference,
  onClick,
}: {
  rung: AskRung | BidRung
  side: 'ask' | 'bid'
  currency: string
  maxCumulative: number
  reference: number
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const depthPct = (rung.cumulative / maxCumulative) * 100
  const intensity = magnitudeIntensity(rung.quantity, reference)
  const listing = 'listing' in rung ? rung.listing : null
  const offer = 'offer' in rung ? rung.offer : null
  const marketplace = listing?.marketplace ?? offer?.marketplace ?? 'unknown'

  return (
    <div
      className={cn(
        'relative grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 py-[1px] font-mono text-[11px] leading-[18px]',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0"
        style={{
          width: `${depthPct}%`,
          [side === 'bid' ? 'left' : 'right']: 0,
          backgroundColor: magnitudeFillColor(
            side === 'bid' ? 'up' : 'down',
            intensity,
          ),
          transition: 'width 300ms ease-out, background-color 300ms ease-out',
        }}
      />
      <span
        className={cn(
          'relative z-10 truncate',
          side === 'bid' ? 'text-up' : 'text-down',
        )}
      >
        {formatNftPrice(rung.price, currency)}
      </span>
      <span className="relative z-10 w-[62px] truncate text-right">
        {listing
          ? formatTokenId(listing.tokenId)
          : t('nftBook.bidQuantity', { count: rung.quantity })}
      </span>
      <span className="relative z-10 w-[46px] truncate text-right text-muted-foreground">
        {listing
          ? listing.rarityRank != null
            ? `#${listing.rarityRank}`
            : NFT_NO_VALUE
          : offer?.trait
            ? offer.trait.value
            : offer?.tokenId
              ? formatTokenId(offer.tokenId)
              : t('nftBook.collectionWide')}
      </span>
      <span className="relative z-10 w-[54px] truncate text-right text-[10px] uppercase tracking-[.04em] text-muted-foreground">
        {t(nftMarketplaceLabelKey(marketplace))}
      </span>
    </div>
  )
}
