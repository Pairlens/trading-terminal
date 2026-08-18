// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One pair, every venue we can reach, side by side.
 *
 * The pane exists to answer two questions a single-venue chart cannot: where
 * is this pair cheapest right now, and is the gap between two venues wide
 * enough to be worth crossing. So the default order is by price rather than
 * by venue — the row that moves to the top IS the answer — and the ranking
 * column measures every venue against the cheapest rather than against some
 * average nobody trades at.
 *
 * Which venues appear follows the same rules as the venue picker in the top
 * bar, because a pane that quoted venues the picker refuses would be offering
 * prices the user cannot act on:
 *  - only venues sharing an asset class with the charted one (a CEX spot pair
 *    is not quoted against a Solana AMM, and vice versa),
 *  - the four CORS-closed venues are listed but never subscribed in a browser,
 *    carrying the same Desktop mark the picker uses,
 *  - a venue that does not list the pair says so instead of spinning.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpDown,
  Info,
  Monitor,
  Pause,
  Play,
  Scale,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { usePanePair } from '@pairlens/plugin-sdk'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { VenueQuote } from '@/hooks/use-venue-quotes'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useVenueQuotes } from '@/hooks/use-venue-quotes'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { findArbEdge, premiumPct, summarizeQuotes } from '@/lib/venue-spread'
import { formatBookPrice } from '@/lib/format-price'
import { useSwitchVenue } from '@/hooks/use-switch-venue'
import { DesktopDownloadDialog } from '@/components/feedback/desktop-download-dialog'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'

type SortMode = 'price' | 'venue'

// Three tiers, because a pane column can be dragged to any width and the
// fixed tracks alone outgrow it: venue + price is the floor (at 11rem the
// three-column version left the venue track at zero and the name vanished
// entirely), the premium joins at 16rem, and 24h at 24rem. Every column past
// the floor is a comparison the BEST/HIGH badge already makes qualitatively,
// so dropping them costs emphasis rather than meaning.
const VENUE_GRID =
  'grid grid-cols-[minmax(0,1fr)_5.25rem] items-center gap-2 @min-[16rem]/pane:grid-cols-[minmax(0,1fr)_5.5rem_4rem] @min-[24rem]/pane:grid-cols-[minmax(0,1fr)_5.75rem_4.25rem_4.25rem]'

export function MultiPricePane() {
  const activePair = usePanePair()

  if (!activePair) return <PanePairPicker />

  return (
    <MultiPricePaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function MultiPricePaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const switchVenue = useSwitchVenue()
  const [live, setLive] = useState(true)
  const [sortMode, setSortMode] = usePersistedState<SortMode>(
    'multiPrice.sort',
    'price',
  )
  const [downloadOpen, setDownloadOpen] = useState(false)

  // Comparable venues: those sharing an asset class with the charted one.
  // Quoting a Solana pool against Kraken's spot book would be comparing two
  // different instruments that happen to share a ticker.
  const comparable = useMemo(() => {
    const current = markets.find((m) => m.value === market)
    const classes = new Set(current?.assetClasses ?? [])
    if (classes.size === 0) return markets
    return markets.filter((m) =>
      m.assetClasses.some((assetClass) => classes.has(assetClass)),
    )
  }, [markets, market])

  const quotes = useVenueQuotes({ pairKey, markets: comparable, enabled: live })

  // A stale quote still gets a row — the number is real, and knowing a thin
  // venue last printed 0.8% away is worth seeing. It must NOT rank, though:
  // the cheapest price on the board is a recommendation, and crowning one
  // that stopped updating a minute and a half ago points at a fill that may
  // no longer exist. Measured on BTC-USDT, where Upbit's thin USDT book sat
  // "Best" at 64,352 while every live venue traded 64,8xx.
  const fresh = useMemo(
    () => quotes.filter((q) => q.status === 'live'),
    [quotes],
  )
  const summary = useMemo(() => summarizeQuotes(fresh), [fresh])
  const arb = useMemo(() => findArbEdge(fresh), [fresh])

  const labelFor = useCallback(
    (venue: string) =>
      comparable.find((m) => m.value === venue)?.label ?? venue,
    [comparable],
  )

  const optionByMarket = useMemo(() => {
    const map = new Map<string, MarketOption>()
    for (const option of comparable) map.set(option.value, option)
    return map
  }, [comparable])

  // Live prices first (cheapest at the top), then prices that have gone
  // stale, then everything still waiting, then the definite "not here"
  // answers — so the actionable part of the board is always the top of it.
  // Ties break on venue id, and a re-sort never shuffles two equal prices.
  const rows = useMemo(() => {
    const ordered = [...quotes]
    if (sortMode === 'price') {
      ordered.sort((a, b) => {
        const bucketDelta = priceBucket(a) - priceBucket(b)
        if (bucketDelta !== 0) return bucketDelta
        if (a.last !== null && b.last !== null && a.last !== b.last) {
          return a.last - b.last
        }
        return (
          rankUnpriced(a) - rankUnpriced(b) || a.market.localeCompare(b.market)
        )
      })
    }
    return ordered
  }, [quotes, sortMode])

  return (
    <div className="relative flex h-full flex-col overflow-hidden text-xs">
      {/* Header: what is being compared, how far apart the venues are, and
          the two controls that change the answer's shape. */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1">
        <span className="truncate font-mono text-[11px] font-medium">
          {pairKey}
        </span>
        {/* Priced over total rather than a sentence: it fits the narrowest
            pane, and "9/14" needs no plural rules in seventeen languages. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground" />
            }
          >
            {summary.pricedCount}/{quotes.length}
          </TooltipTrigger>
          <TooltipContent>
            {t('multiPrice.quoting', {
              priced: summary.pricedCount,
              total: quotes.length,
            })}
          </TooltipContent>
        </Tooltip>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {summary.pricedCount > 1 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="h-4 gap-1 px-1.5 font-mono text-[10px] tabular-nums"
                  />
                }
              >
                <Scale className="size-2.5" />
                {summary.spreadPct.toFixed(2)}%
              </TooltipTrigger>
              <TooltipContent>
                {t('multiPrice.spreadTooltip', {
                  low: labelFor(summary.low?.market ?? ''),
                  high: labelFor(summary.high?.market ?? ''),
                })}
              </TooltipContent>
            </Tooltip>
          )}

          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t('multiPrice.sortBy')}
            title={
              sortMode === 'price'
                ? t('multiPrice.sortedByPrice')
                : t('multiPrice.sortedByVenue')
            }
            onClick={() =>
              setSortMode(sortMode === 'price' ? 'venue' : 'price')
            }
          >
            <ArrowUpDown
              className={cn(
                'size-3',
                sortMode === 'price' ? 'text-primary' : 'text-muted-foreground',
              )}
            />
          </Button>

          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={live ? t('multiPrice.pause') : t('multiPrice.resume')}
            title={live ? t('multiPrice.pause') : t('multiPrice.resume')}
            onClick={() => setLive((prev) => !prev)}
          >
            {live ? (
              <Pause className="size-3 text-muted-foreground" />
            ) : (
              <Play className="size-3 text-primary" />
            )}
          </Button>
        </span>
      </div>

      {/* The executable spread, when two venues publish real books. Gross of
          fees and transfer time, which the tooltip says out loud — a number
          this suggestive has to carry its own caveat. */}
      {arb && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className={cn(
                  'flex items-center gap-1.5 border-b border-border/50 px-2 py-1 font-mono text-[10px] tabular-nums',
                  arb.edgePct > 0
                    ? '[background-color:color-mix(in_oklch,var(--up)_10%,transparent)]'
                    : 'text-muted-foreground',
                )}
              />
            }
          >
            {/* The venue rides inside the phrase rather than being glued to
                the front of it — "Buy on Binance" and "Binance borsasından
                al" are not the same word order. Only the price, which is a
                number in every language, is appended, and it drops out
                below 22rem rather than truncating both venue names to
                initials; the edge percentage is the point of the strip. */}
            <span className="truncate">
              {t('multiPrice.buyAt', { venue: labelFor(arb.buyMarket) })}
              <span className="hidden @min-[22rem]/pane:inline">
                {' '}
                {formatBookPrice(arb.buyAsk)}
              </span>
            </span>
            <ArrowRight className="size-2.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {t('multiPrice.sellAt', { venue: labelFor(arb.sellMarket) })}
              <span className="hidden @min-[22rem]/pane:inline">
                {' '}
                {formatBookPrice(arb.sellBid)}
              </span>
            </span>
            <span
              className={cn(
                'ml-auto shrink-0 font-medium',
                arb.edgePct > 0 ? 'text-up' : 'text-down',
              )}
            >
              {arb.edgePct >= 0 ? '+' : ''}
              {arb.edgePct.toFixed(3)}%
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            {t('multiPrice.edgeTooltip')}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Column header */}
      <div
        className={cn(
          'border-b border-border/50 px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[.11em] text-muted-foreground',
          VENUE_GRID,
        )}
      >
        <span className="truncate">{t('multiPrice.venue')}</span>
        <span className="text-right">{t('terminal.columns.price')}</span>
        <span className="hidden truncate text-right @min-[16rem]/pane:inline">
          {t('multiPrice.vsBest')}
        </span>
        <span className="hidden text-right @min-[24rem]/pane:inline">
          {t('multiPrice.change24h')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
            {t('multiPrice.noVenues')}
          </div>
        ) : (
          rows.map((quote) => (
            <VenueRow
              key={quote.market}
              quote={quote}
              option={optionByMarket.get(quote.market)}
              isCharted={quote.market === market}
              isBest={
                summary.pricedCount > 1 && summary.low?.market === quote.market
              }
              isWorst={
                summary.pricedCount > 1 && summary.high?.market === quote.market
              }
              reference={summary.low?.price ?? null}
              onSelect={switchVenue}
              onWantDesktop={() => setDownloadOpen(true)}
            />
          ))
        )}
      </div>

      {/* Every number in this pane is gross, and the gaps it surfaces are
          routinely smaller than a taker fee — a 0.05% venue premium is inside
          what most venues charge to cross. So the caveat is permanent chrome
          rather than a tooltip on the arbitrage strip: it applies to the whole
          board, including the ordinary case where there is no crossing edge
          and someone is simply picking where to buy.

          This is the footer slot the desktop notice used to hold. Nothing was
          lost by taking it: the unreachable venues each carry their own
          Desktop mark, and their rows still open the download dialog. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex shrink-0 items-center gap-1.5 border-t border-border/50 px-2 py-1 text-[10px] text-muted-foreground" />
          }
        >
          <Info className="size-3 shrink-0" />
          <span className="truncate">{t('multiPrice.feesFooter')}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          {t('multiPrice.feesTooltip')}
        </TooltipContent>
      </Tooltip>

      <DesktopDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
      />
    </div>
  )
}

/** Live prices, then stale ones, then everything without a price at all. */
function priceBucket(quote: VenueQuote): number {
  if (quote.last === null) return 2
  return quote.status === 'live' ? 0 : 1
}

/**
 * Order among the venues that have no price: still-connecting ones above the
 * settled answers, so the bottom of the list is the part that will not change.
 */
function rankUnpriced(quote: VenueQuote): number {
  switch (quote.status) {
    case 'pending':
      return 0
    case 'no-data':
      return 1
    case 'unlisted':
      return 2
    case 'desktop-only':
      return 3
    default:
      return 0
  }
}

type TickDirection = 'up' | 'down' | null

const VenueRow = memo(function VenueRow({
  quote,
  option,
  isCharted,
  isBest,
  isWorst,
  reference,
  onSelect,
  onWantDesktop,
}: {
  quote: VenueQuote
  option: MarketOption | undefined
  isCharted: boolean
  isBest: boolean
  isWorst: boolean
  /** Cheapest venue's price — what the premium column measures against. */
  reference: number | null
  onSelect: (market: string) => void
  onWantDesktop: () => void
}) {
  const { t } = useTranslation()
  const label = option?.label ?? quote.market

  // Flash on change, same vocabulary as the watchlist. Derived from the
  // published price rather than the raw socket, so the animation runs at the
  // pane's cadence instead of the venue's.
  const [direction, setDirection] = useState<TickDirection>(null)
  const previousRef = useRef<number | null>(quote.last)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const price = quote.last
    if (price === null) return
    const previous = previousRef.current
    if (previous !== null && price !== previous) {
      setDirection(price > previous ? 'up' : 'down')
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setDirection(null), 700)
    }
    previousRef.current = price
  }, [quote.last])

  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  const premium = premiumPct(quote.last, reference)
  const unreachable = quote.status === 'desktop-only'
  // A venue that does not carry the pair is not somewhere to chart it: the
  // click would land on an empty chart, which is a worse answer than the row
  // already gives.
  const unlisted = quote.status === 'unlisted'
  const handleActivate = useCallback(() => {
    if (unreachable) {
      onWantDesktop()
      return
    }
    if (unlisted) return
    onSelect(quote.market)
  }, [unreachable, unlisted, onWantDesktop, onSelect, quote.market])

  return (
    <button
      type="button"
      onClick={handleActivate}
      disabled={unlisted}
      title={
        unreachable
          ? t('multiPrice.desktopOnlyRow', { venue: label })
          : unlisted
            ? t('multiPrice.notListed')
            : t('multiPrice.switchTo', { venue: label })
      }
      className={cn(
        'w-full px-2 py-1.5 text-left transition-colors',
        !unlisted &&
          'hover:[background-color:color-mix(in_oklch,var(--primary)_8%,transparent)]',
        VENUE_GRID,
        isCharted &&
          '[background-color:color-mix(in_oklch,var(--primary)_10%,transparent)]',
      )}
    >
      {/* Venue */}
      <span className="flex min-w-0 items-center gap-1.5">
        {option?.iconUrl && (
          <img
            src={option.iconUrl}
            alt=""
            className={cn(
              'size-3.5 shrink-0 rounded-full',
              unreachable && 'opacity-40 grayscale',
            )}
          />
        )}
        <span
          className={cn(
            'truncate font-medium',
            unreachable && 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {isBest && (
          <span className="shrink-0 rounded-sm bg-up/15 px-1 text-[9px] font-medium uppercase leading-[14px] tracking-wide text-up">
            {t('multiPrice.best')}
          </span>
        )}
        {isWorst && !isBest && (
          <span className="shrink-0 rounded-sm bg-down/15 px-1 text-[9px] font-medium uppercase leading-[14px] tracking-wide text-down">
            {t('multiPrice.high')}
          </span>
        )}
        {/* Freshness markers yield the row's width to the venue name below
            20rem — a rank badge and a marker together squeeze "Bitfinex"
            down to "B…", and the name is what the row is for. The price
            column carries no such claim either way, so nothing is lost. */}
        {quote.status === 'stale' && (
          <span className="hidden shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/60 @min-[20rem]/pane:inline">
            {t('multiPrice.stale')}
          </span>
        )}
        {/* A price that came from the 60s REST snapshot rather than the
            socket is real but not live, and the pane must not imply
            otherwise. */}
        {quote.fromSnapshot && quote.last !== null && (
          <span className="hidden shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/60 @min-[20rem]/pane:inline">
            {t('multiPrice.delayed')}
          </span>
        )}
      </span>

      {/* Price */}
      <span
        className={cn(
          'tick-cell justify-self-end font-mono tabular-nums transition-colors duration-700',
          direction === 'up'
            ? 'tick-up text-up'
            : direction === 'down'
              ? 'tick-down text-down'
              : 'text-foreground',
        )}
      >
        {quote.last !== null ? (
          formatBookPrice(quote.last)
        ) : (
          <VenueBlank status={quote.status} />
        )}
      </span>

      {/* Premium over the cheapest LIVE venue. Usually positive, since the
          reference is the minimum — but a stale row is excluded from that
          reference and can sit below it, so the sign is rendered rather than
          assumed (the assumption printed "+-0.80%"). */}
      <span
        className={cn(
          'hidden justify-self-end font-mono tabular-nums @min-[16rem]/pane:inline',
          premium === null || premium === 0
            ? 'text-muted-foreground/40'
            : premium > 0
              ? 'text-down'
              : 'text-muted-foreground',
        )}
      >
        {premium === null || premium === 0
          ? '—'
          : `${premium > 0 ? '+' : '−'}${Math.abs(premium).toFixed(2)}%`}
      </span>

      {/* 24h change */}
      <span
        className={cn(
          'hidden justify-self-end font-mono tabular-nums @min-[24rem]/pane:inline',
          quote.change24h == null
            ? 'text-muted-foreground/40'
            : quote.change24h >= 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {quote.change24h == null
          ? '—'
          : `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`}
      </span>
    </button>
  )
})

/** What stands in for a price, worded by why there isn't one. */
function VenueBlank({ status }: { status: VenueQuote['status'] }) {
  const { t } = useTranslation()

  if (status === 'desktop-only') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
        <Monitor className="size-2.5" />
        {t('multiPrice.desktop')}
      </span>
    )
  }
  if (status === 'unlisted') {
    return (
      <span className="text-[10px] font-normal text-muted-foreground/70">
        {t('multiPrice.notListed')}
      </span>
    )
  }
  if (status === 'no-data') {
    return (
      <span className="text-[10px] font-normal text-muted-foreground/70">
        {t('multiPrice.quiet')}
      </span>
    )
  }
  return (
    <span className="inline-block h-3 w-14 animate-pulse rounded bg-muted align-middle" />
  )
}
