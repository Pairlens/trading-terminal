// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Four things a person does on an NFT market, said in the terminal's own order
 * vocabulary.
 *
 * The whole point of treating a collection as a book is that its trades are
 * ordinary orders, so this ticket refuses to invent a fifth grammar for them.
 * Each intent maps onto a side and a type, and the ticket SAYS which, in the
 * line under the tabs, because a trader who knows what a market buy is should
 * not have to guess what "sweep" does to their money:
 *
 *   Sweep N       market buy, size N. Takes the N cheapest listings.
 *   Make offer    limit buy at P, size N. A collection offer, any N tokens.
 *   List item     limit sell at P of one token you own.
 *   Accept bid    market sell of one token you own, into the best standing bid.
 *
 * Sizes are item counts, whole, because an NFT is indivisible and a fractional
 * size is a bug rather than a rounding artefact.
 *
 * A sweep is priced from the ladder, not from the floor. Buying five items when
 * the floor is one listing deep costs the sum of five asks, and quoting 5x the
 * floor would understate the trade by whatever the book is shaped like. The
 * summary shows the realised average alongside the total for the same reason.
 *
 * Everything goes out through the shared guarded `placeOrder`: the risk limits,
 * the vault gate and the lock screen all live inside it, and a pane that
 * reached a connector directly would be outside every one of them.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ShoppingBasket } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { NftChain, NftListing } from '@pairlens/shared/nft-types'
import { PANE_FOOTNOTE, PaneEmpty } from '@/components/panes/pane-primitives'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { TradeConfirmButton } from '@/components/terminal/trade-confirm-button'
import {
  NFT_NO_VALUE,
  NftPaneFallback,
  nftChainLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import {
  useNftBoardWallet,
  useNftPaneTarget,
} from '@/components/nft/nft-board-target'
import {
  useNftBook,
  useNftCollection,
  useNftHoldings,
} from '@/hooks/use-nft-market'
import { useMarketData } from '@/lib/market-data-provider'
import { formatNftPrice, formatNftUsd, formatTokenId } from '@/lib/nft/format'
import { tradeHoldMs } from '@/lib/settings/trade-confirm'

/** The four intents, and the order each one really is. */
type NftIntent = 'sweep' | 'offer' | 'list' | 'accept'

const INTENT_ORDER: Record<
  NftIntent,
  { side: 'buy' | 'sell'; type: 'market' | 'limit' }
> = {
  sweep: { side: 'buy', type: 'market' },
  offer: { side: 'buy', type: 'limit' },
  list: { side: 'sell', type: 'limit' },
  accept: { side: 'sell', type: 'market' },
}

const INTENTS: Array<NftIntent> = ['sweep', 'offer', 'list', 'accept']

const INTENT_LABEL_KEYS: Record<NftIntent, string> = {
  sweep: 'nftTicket.intents.sweep',
  offer: 'nftTicket.intents.offer',
  list: 'nftTicket.intents.list',
  accept: 'nftTicket.intents.accept',
}

const INTENT_MAPPING_KEYS: Record<NftIntent, string> = {
  sweep: 'nftTicket.mapping.sweep',
  offer: 'nftTicket.mapping.offer',
  list: 'nftTicket.mapping.list',
  accept: 'nftTicket.mapping.accept',
}

/** Literal keys, never a template: only a literal is auditable for coverage. */
const INTENT_PLACED_KEYS: Record<NftIntent, string> = {
  sweep: 'nftTicket.placed.sweep',
  offer: 'nftTicket.placed.offer',
  list: 'nftTicket.placed.list',
  accept: 'nftTicket.placed.accept',
}

export function NftTicketPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftTicket.noPairBody')}
        icon={ShoppingBasket}
        title={t('nftTicket.noPairTitle')}
      />
    )
  }

  return <NftTicketInner chain={target.chain} contract={target.contract} />
}

function NftTicketInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { placeOrder } = useMarketData()
  const { wallet, sealed, loaded } = useNftBoardWallet(chain)

  const [intent, setIntent] = useState<NftIntent>('sweep')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { book, ...bookStatus } = useNftBook(chain, contract)
  const { collection } = useNftCollection(chain, contract)
  // Owned tokens are what a sell intent names. Asked for only when one is
  // selected, so a buy-side ticket costs nothing out of the shared budget.
  const { holdings } = useNftHoldings(
    chain,
    wallet?.address,
    contract,
    Boolean(wallet) && (intent === 'list' || intent === 'accept'),
  )

  const asks = useMemo(
    () => [...(book?.asks ?? [])].sort((a, b) => a.price - b.price),
    [book],
  )
  const bestBid = useMemo(() => {
    const bids = [...(book?.bids ?? [])].sort((a, b) => b.price - a.price)
    return bids[0] ?? null
  }, [book])

  // The manifest gates this pane on a wallet, but a sealed vault and a fresh
  // profile both reach it anyway, and they need different sentences.
  if (sealed || (loaded && !wallet)) {
    return (
      <PaneCredentialsRequired
        compact
        kind="wallet"
        market={chain}
        state={sealed ? 'sealed' : 'missing'}
        venueLabel={t(nftChainLabelKey(chain))}
      />
    )
  }

  const phase = nftPanePhase(bookStatus, Boolean(book))
  if (phase === 'unsupported') {
    return (
      <NftPaneFallback
        emptyBody={t('nftTicket.emptyBody')}
        emptyTitle={t('nftTicket.emptyTitle')}
        icon={ShoppingBasket}
        phase={phase}
        status={bookStatus}
      />
    )
  }

  const currency = book?.priceCurrency ?? collection?.priceCurrency ?? undefined

  // The one honest FX rate on this board: whatever the provider itself used to
  // price the floor. Deriving it here rather than fetching a second source is
  // what keeps the ticket and the header agreeing about the same trade.
  const usdPerUnit =
    collection?.floorPrice && collection.floorPriceUsd
      ? collection.floorPriceUsd / collection.floorPrice
      : null

  const { side, type } = INTENT_ORDER[intent]
  const wantsQuantity = intent === 'sweep' || intent === 'offer'
  const wantsPrice = type === 'limit'
  const wantsToken = intent === 'list' || intent === 'accept'

  const count = wantsQuantity ? normalizeCount(quantity) : 1
  const limitPrice = wantsPrice ? normalizePrice(price) : null
  const quote = quoteOrder({
    intent,
    asks,
    bestBidPrice: bestBid?.price ?? null,
    count,
    limitPrice,
  })

  const canSubmit =
    !submitting &&
    Boolean(wallet) &&
    count > 0 &&
    (!wantsPrice || (limitPrice !== null && limitPrice > 0)) &&
    (!wantsToken || tokenId.length > 0) &&
    (intent !== 'sweep' || asks.length > 0) &&
    (intent !== 'accept' || bestBid !== null)

  const submit = async () => {
    if (!canSubmit || !wallet) return
    setSubmitting(true)
    try {
      const result = await placeOrder({
        market: chain,
        pair: contract,
        side,
        type,
        // Item counts, whole. The venue counts tokens, never fractions.
        size: String(count),
        ...(limitPrice !== null ? { price: String(limitPrice) } : {}),
        // Which token a sell names. A collection-wide buy carries none.
        ...(wantsToken && tokenId ? { tokenId } : {}),
        walletId: wallet.id,
        mode: 'live',
      })

      if (result.success) {
        toast.success(t(INTENT_PLACED_KEYS[intent]), {
          description: t('nftTicket.placedBody', {
            count,
            collection: collection?.name ?? contract,
          }),
        })
        if (wantsQuantity) setQuantity('1')
        if (wantsPrice) setPrice('')
      } else {
        toast.error(t('terminal.trade.orderRejected'), {
          description: result.error ?? t('common.unknownError'),
        })
      }
    } catch (err) {
      toast.error(t('terminal.trade.orderFailed'), { description: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 py-1">
      <div className="grid shrink-0 grid-cols-4 gap-1">
        {INTENTS.map((option) => (
          <button
            className={cn(
              'rounded-md px-1 py-1 text-[11px] font-medium transition-colors',
              option === intent
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            key={option}
            onClick={() => setIntent(option)}
            type="button"
          >
            {t(INTENT_LABEL_KEYS[option])}
          </button>
        ))}
      </div>

      <p className="shrink-0 text-[10.5px] leading-relaxed text-muted-foreground">
        {t(INTENT_MAPPING_KEYS[intent])}
      </p>

      <div className="flex shrink-0 flex-col gap-1.5">
        {wantsQuantity && (
          <Field label={t('nftTicket.quantity')}>
            <Input
              className="h-7 rounded-md border-transparent bg-muted/40 px-2 text-right font-mono text-[11.5px] tabular-nums"
              inputMode="numeric"
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="1"
              value={quantity}
            />
          </Field>
        )}

        {wantsPrice && (
          <Field
            label={t('nftTicket.price', { currency: currency ?? '' }).trim()}
          >
            <Input
              className="h-7 rounded-md border-transparent bg-muted/40 px-2 text-right font-mono text-[11.5px] tabular-nums"
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              value={price}
            />
          </Field>
        )}

        {wantsToken && (
          <Field label={t('nftTicket.token')}>
            <Select onValueChange={setTokenId} value={tokenId}>
              <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-muted/40 px-2 font-mono text-[11.5px]">
                <SelectValue placeholder={t('nftTicket.tokenPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((holding) => (
                  <SelectItem key={holding.tokenId} value={holding.tokenId}>
                    {formatTokenId(holding.tokenId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <div className="min-h-0 flex-1" />

      <dl className="flex shrink-0 flex-col gap-[3px] rounded-lg bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        <SummaryRow
          label={t('nftTicket.notional')}
          value={formatNftPrice(quote.notional, currency)}
        />
        <SummaryRow
          label={t('nftTicket.notionalUsd')}
          value={
            usdPerUnit === null || quote.notional === null
              ? NFT_NO_VALUE
              : formatNftUsd(quote.notional * usdPerUnit)
          }
        />
        {quote.average !== null && count > 1 && (
          <SummaryRow
            label={t('nftTicket.averagePrice')}
            value={formatNftPrice(quote.average, currency)}
          />
        )}
        <SummaryRow
          label={t('nftTicket.royalty')}
          value={
            collection?.royaltyBps == null
              ? NFT_NO_VALUE
              : t('nftTicket.royaltyValue', {
                  percent: (collection.royaltyBps / 100).toFixed(2),
                  amount:
                    quote.notional === null
                      ? NFT_NO_VALUE
                      : formatNftPrice(
                          quote.notional * (collection.royaltyBps / 10_000),
                          currency,
                        ),
                })
          }
        />
      </dl>

      {quote.shortfall > 0 && (
        <p className={cn('shrink-0', PANE_FOOTNOTE)}>
          {t('nftTicket.thinBook', { count: quote.shortfall })}
        </p>
      )}

      <TradeConfirmButton
        busy={submitting}
        busyLabel={t('nftTicket.placing')}
        disabled={!canSubmit}
        holdMs={tradeHoldMs(true)}
        label={t(INTENT_LABEL_KEYS[intent])}
        onConfirm={() => void submit()}
        side={side}
      />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[74px] shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate">{label}</dt>
      <dd className="shrink-0 font-mono tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  )
}

/** A whole, positive item count, or 0 for anything that is not one. */
function normalizeCount(raw: string): number {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normalizePrice(raw: string): number | null {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * What the order actually costs, walked against the real ladder.
 *
 * `shortfall` is how many of the requested items the book cannot fill. A sweep
 * of ten against six listings is not a ten-item trade, and the ticket says so
 * rather than quoting six and letting the size field claim otherwise.
 */
function quoteOrder({
  intent,
  asks,
  bestBidPrice,
  count,
  limitPrice,
}: {
  intent: NftIntent
  asks: Array<NftListing>
  bestBidPrice: number | null
  count: number
  limitPrice: number | null
}): { notional: number | null; average: number | null; shortfall: number } {
  if (count <= 0) return { notional: null, average: null, shortfall: 0 }

  if (intent === 'sweep') {
    const taken = asks.slice(0, count)
    if (taken.length === 0)
      return { notional: null, average: null, shortfall: count }
    const notional = taken.reduce((sum, listing) => sum + listing.price, 0)
    return {
      notional,
      average: notional / taken.length,
      shortfall: count - taken.length,
    }
  }

  if (intent === 'accept') {
    return bestBidPrice === null
      ? { notional: null, average: null, shortfall: 1 }
      : { notional: bestBidPrice, average: bestBidPrice, shortfall: 0 }
  }

  // Both limit intents are priced by the field, which is the whole point of a
  // limit: the book does not get to decide what it costs.
  if (limitPrice === null)
    return { notional: null, average: null, shortfall: 0 }
  const units = intent === 'offer' ? count : 1
  return {
    notional: limitPrice * units,
    average: limitPrice,
    shortfall: 0,
  }
}
