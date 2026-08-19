// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where this order should go, above the book it will hit.
 *
 * The ladder leads the execution rail because it answers the question the book
 * cannot: the depth pane shows one venue's ladder in detail, and this shows
 * every venue's top of book at once. Rows are ordered by the side being
 * traded, so the venue to route to is always the first line.
 *
 * Prices come from `useVenueQuotes`, and every subscription it opens is
 * multiplexed on `ticker:<venue>:<pair>` by the market-data provider. So the
 * ladder, the multi-price pane and the dossier on one board share one ticker
 * per venue rather than three, and adding this pane to a workspace that
 * already quotes venues costs nothing at all.
 *
 * It is the one consumer that asks for `topOfBook`, because it is the one that
 * RANKS on bid and ask. ByBit, MEXC and Upbit quote no book on their ticker
 * channel at all, so without it those three sat blank here while the header
 * two panes over showed the very same venue's spread off the depth stream.
 * The option opens a book only for a venue proven to tick without quoting
 * one, which for the charted venue is a stream the terminal already holds.
 *
 * Render discipline: quotes publish on a 400ms cadence, rows are memoized on
 * their own venue's numbers, and the ORDER is recomputed on a slow interval
 * rather than per publish. A ladder that re-sorted every tick would swap two
 * rows under the cursor between hover and click, which on this pane means
 * routing an order to the wrong exchange.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, ListOrdered, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { usePanePair } from '@pairlens/plugin-sdk'

import type { LadderRow, LadderSide } from '@/lib/venue-ladder'
import type { MarketOption } from '@/hooks/use-available-markets'
import { buildVenueLadder } from '@/lib/venue-ladder'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useVenueQuotes } from '@/hooks/use-venue-quotes'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePriceTick } from '@/hooks/use-price-tick'
import { TickArrow } from '@/components/tick-arrow'
import { formatBookPrice } from '@/lib/format-price'
import { useSwitchVenue } from '@/hooks/use-switch-venue'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty } from '@/components/panes/pane-primitives'

/**
 * How often the ladder is allowed to change ORDER. Prices update at the hook's
 * own 400ms cadence; only the sort waits, so the board reads live while the
 * rows stay put long enough to be clicked.
 */
const RESORT_INTERVAL_MS = 3000

// Venue takes what is left; the two prices and the spread are fixed so the
// decimal points line up down the column. The spread joins at 15rem, which is
// where the three fixed tracks stop eating the venue name.
const LADDER_GRID =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-1.5 @min-[15rem]/pane:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.75rem]'

export function VenueLadderPane() {
  const activePair = usePanePair()

  if (!activePair) return <PanePairPicker />

  return (
    <VenueLadderPaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function VenueLadderPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const switchVenue = useSwitchVenue()
  const [side, setSide] = usePersistedState<LadderSide>(
    'venueLadder.side',
    'buy',
  )

  // Same rule as the multi-price pane: only venues sharing an asset class with
  // the charted one. A Solana pool and a Kraken spot book are two different
  // instruments that happen to share a ticker, and routing between them is not
  // a choice anyone can act on.
  const comparable = useMemo(() => {
    const current = markets.find((m) => m.value === market)
    const classes = new Set(current?.assetClasses ?? [])
    if (classes.size === 0) return markets
    return markets.filter((m) =>
      m.assetClasses.some((assetClass) => classes.has(assetClass)),
    )
  }, [markets, market])

  const quotes = useVenueQuotes({
    pairKey,
    markets: comparable,
    topOfBook: true,
  })

  const optionByMarket = useMemo(() => {
    const map = new Map<string, MarketOption>()
    for (const option of comparable) map.set(option.value, option)
    return map
  }, [comparable])

  // The sort key, refreshed on a slow beat. `quotes` itself rides in through a
  // ref so a publish updates prices without re-arming the interval. Written in
  // an effect declared ahead of the interval's, so it is already current when
  // that effect's immediate re-sort runs.
  const quotesRef = useRef(quotes)
  useEffect(() => {
    quotesRef.current = quotes
  })

  const [order, setOrder] = useState<Array<string>>([])
  useEffect(() => {
    const resort = () =>
      setOrder(buildVenueLadder(quotesRef.current, side).map((r) => r.market))
    resort()
    const timer = setInterval(resort, RESORT_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [side, pairKey])

  // Fresh numbers, settled order: the rows are rebuilt from the current quotes
  // every publish, then laid out in the order the last re-sort agreed on. A
  // venue that arrives between re-sorts lands at the bottom rather than being
  // dropped.
  const rows = useMemo(() => {
    const built = buildVenueLadder(quotes, side)
    if (order.length === 0) return built
    const position = new Map(order.map((venue, index) => [venue, index]))
    return [...built].sort(
      (a, b) =>
        (position.get(a.market) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(b.market) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [quotes, side, order])

  if (rows.length === 0) {
    return (
      <PaneEmpty
        icon={ListOrdered}
        title={t('venueLadder.emptyTitle')}
        body={t('venueLadder.emptyBody')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      {/* Column header, doubling as the side switch: which column is "best"
          depends on whether this is a buy or a sell, and the toggle says so
          in the same place the answer is read. */}
      <div
        className={cn(
          'border-b border-border/50 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground',
          LADDER_GRID,
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{t('venueLadder.columns.venue')}</span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-4 shrink-0"
            aria-label={t('venueLadder.switchSide')}
            title={
              side === 'buy'
                ? t('venueLadder.rankedByAsk')
                : t('venueLadder.rankedByBid')
            }
            onClick={() => setSide(side === 'buy' ? 'sell' : 'buy')}
          >
            <ArrowLeftRight className="size-2.5 text-primary" />
          </Button>
        </span>
        <span className="text-right">{t('venueLadder.columns.bid')}</span>
        <span className="text-right">{t('venueLadder.columns.ask')}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="hidden text-right @min-[15rem]/pane:inline" />
            }
          >
            {t('venueLadder.columns.bps')}
          </TooltipTrigger>
          <TooltipContent>{t('venueLadder.bpsTooltip')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.map((row) => (
          <VenueLadderRow
            key={row.market}
            row={row}
            option={optionByMarket.get(row.market)}
            isCharted={row.market === market}
            onSelect={switchVenue}
          />
        ))}
      </div>
    </div>
  )
}

type VenueLadderRowProps = {
  row: LadderRow
  option: MarketOption | undefined
  isCharted: boolean
  onSelect: (market: string) => void
}

/**
 * Rows are rebuilt from scratch every publish, so reference equality would
 * never hold and the whole ladder would repaint four times a second. Comparing
 * the fields the row actually draws means only the venues that moved do.
 */
function sameLadderRow(
  a: VenueLadderRowProps,
  b: VenueLadderRowProps,
): boolean {
  return (
    a.isCharted === b.isCharted &&
    a.option === b.option &&
    a.onSelect === b.onSelect &&
    a.row.market === b.row.market &&
    a.row.bid === b.row.bid &&
    a.row.ask === b.row.ask &&
    a.row.spreadBps === b.row.spreadBps &&
    a.row.status === b.row.status &&
    a.row.bookPending === b.row.bookPending &&
    a.row.ranked === b.row.ranked &&
    a.row.isBest === b.row.isBest
  )
}

const VenueLadderRow = memo(function VenueLadderRow({
  row,
  option,
  isCharted,
  onSelect,
}: VenueLadderRowProps) {
  const { t } = useTranslation()
  const label = option?.label ?? row.market
  // One tick per column, because both columns move. Ranking reads one side,
  // but the bid changes on the very same publish as the ask, and a number that
  // changes without saying so reads as a frozen feed.
  const bidTick = usePriceTick(row.bid)
  const askTick = usePriceTick(row.ask)
  const unreachable = row.status === 'desktop-only'
  // A venue that does not list the pair is not a routing choice: charting it
  // would answer the click with an empty chart, which is worse than a row
  // that does not move.
  const unlisted = row.status === 'unlisted'
  const quoted = row.bid !== null || row.ask !== null

  const handleClick = useCallback(() => {
    if (unreachable || unlisted) return
    onSelect(row.market)
  }, [unreachable, unlisted, onSelect, row.market])

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={unreachable || unlisted}
      title={
        unreachable
          ? t('venueLadder.desktopOnlyRow', { venue: label })
          : unlisted
            ? t('venueLadder.notListed')
            : t('venueLadder.switchTo', { venue: label })
      }
      className={cn(
        'w-full px-2.5 py-1 text-left font-mono text-[11px] tabular-nums transition-colors',
        LADDER_GRID,
        !unreachable &&
          !unlisted &&
          'hover:[background-color:color-mix(in_oklch,var(--primary)_8%,transparent)]',
        row.isBest &&
          '[background-color:color-mix(in_oklch,var(--up)_9%,transparent)]',
        !row.isBest &&
          isCharted &&
          '[background-color:color-mix(in_oklch,var(--primary)_9%,transparent)]',
        !row.ranked && !quoted && 'opacity-50',
      )}
    >
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
        <span className="truncate font-sans text-[11.5px] font-medium">
          {label}
        </span>
        {row.isBest && (
          <span className="shrink-0 rounded-sm bg-up/20 px-1 text-[9px] font-semibold uppercase leading-[14px] tracking-wide text-up">
            {t('venueLadder.best')}
          </span>
        )}
      </span>

      {quoted ? (
        <>
          <span
            className={cn(
              'tick-cell flex items-center justify-end justify-self-end transition-colors duration-700',
              row.bid === null ? 'text-muted-foreground/40' : 'text-up',
              bidTick === 'up' && 'tick-up',
              bidTick === 'down' && 'tick-down',
            )}
          >
            <TickArrow direction={bidTick} />
            {row.bid === null ? '—' : formatBookPrice(row.bid)}
          </span>
          <span
            className={cn(
              'tick-cell flex items-center justify-end justify-self-end transition-colors duration-700',
              row.ask === null ? 'text-muted-foreground/40' : 'text-down',
              askTick === 'up' && 'tick-up',
              askTick === 'down' && 'tick-down',
            )}
          >
            <TickArrow direction={askTick} />
            {row.ask === null ? '—' : formatBookPrice(row.ask)}
          </span>
          <span className="hidden justify-self-end text-muted-foreground @min-[15rem]/pane:inline">
            {row.spreadBps === null ? '—' : row.spreadBps.toFixed(1)}
          </span>
        </>
      ) : (
        // One sentence across the three numeric columns, exactly where the
        // numbers would have been: the reason there is no price is the answer
        // this row has, and a row of dashes is not an answer.
        //
        // The skeleton is for rows that are still arriving, and ONLY those. A
        // venue that trades here but publishes no top of book used to pulse
        // for as long as the pane stayed open, promising a number that was
        // never coming; `bookPending` is what separates the two now.
        <span className="col-span-2 justify-self-end truncate font-sans text-[11px] font-normal text-muted-foreground @min-[15rem]/pane:col-span-3">
          {unreachable ? (
            <span className="inline-flex items-center gap-1">
              <Monitor className="size-2.5" />
              {t('venueLadder.desktopOnly')}
            </span>
          ) : row.status === 'unlisted' ? (
            t('venueLadder.notListed')
          ) : row.status === 'no-data' ? (
            t('venueLadder.noBook')
          ) : row.status === 'pending' || row.bookPending ? (
            <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted align-middle" />
          ) : (
            t('venueLadder.noTopOfBook')
          )}
        </span>
      )}
    </button>
  )
}, sameLadderRow)
