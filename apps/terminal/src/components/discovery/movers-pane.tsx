// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What moved, ranked, with enough beside each row to tell a real move from a
 * wick.
 *
 * The percentage alone is the number that gets people into bad trades: a thin
 * pair can print +31% on a few thousand dollars. So every row carries the
 * volume behind the move and how that volume compares with a typical coin's
 * (see `spot-movers.ts` for exactly what that multiple is and is not), and the
 * trend line says whether the move was one candle or a day of grinding.
 *
 * The pane is section-aware. On the equities board it ranks the broker's bulk
 * snapshot instead of the crypto one, and drops the tabs that snapshot cannot
 * serve rather than showing tabs that would always be empty. Everywhere else —
 * the spot board, a custom workspace, a pair route — it ranks crypto.
 *
 * It opens nothing for the ranked tabs: rows come from snapshots other panes
 * already fetch, and the trend lines are viewport-gated, so scrolling the table
 * is the only thing that ever costs a request. Two things read beyond that. The
 * listings tab has no snapshot and fetches its own two sources, only while it is
 * the tab on screen; and the equity rows read today's earnings calendar for
 * their reason tags, which is the same one-day window the earnings pane asks for
 * in its default scope, so on the board the two share one request.
 */
import { memo, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Sparkles, TrendingUp, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type {
  BulkTickerEntry,
  InstrumentCategory,
} from '@pairlens/shared/instrument-types'
import type { MoverRow, MoverTab, MoverWindow } from '@/lib/spot-movers'
import type { NewListingsFeed } from '@/hooks/use-new-listings'
import type { NewListingRow } from '@/lib/new-listings'
import {
  EQUITY_MOVER_TABS,
  UNUSUAL_TURNOVER,
  changeBarFraction,
  rankEquityMovers,
  rankMovers,
} from '@/lib/spot-movers'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useBulkTickerSnapshots } from '@/hooks/use-bulk-ticker-quotes'
import { useDiscoverySection } from '@/lib/discovery-section-context'
import { useEquityReasonTags } from '@/hooks/use-equity-reason-tags'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { usePriceTick } from '@/hooks/use-price-tick'
import { useSectorMembership } from '@/hooks/use-sector-membership'
import {
  useTopCoinsSnapshot,
  useTopCoinsSnapshotState,
} from '@/hooks/use-top-coins-snapshot'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneColumnHeader, PaneEmpty } from '@/components/panes/pane-primitives'
import { TickArrow } from '@/components/tick-arrow'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'
import { formatRelativeTime } from '@/lib/format-time'
import { dexChain } from '@/lib/dex/chain-catalog'
import { poolChartTarget } from '@/lib/dex/pool-link'
import { useNewListings } from '@/hooks/use-new-listings'
import { track } from '@/lib/analytics-events'

// Ordered by how often a tab is opened, not by how it was built: the two
// directional lists lead, then the two that rank size and speed, then the two
// that are a specific hunt rather than a scan.
const CRYPTO_TABS: ReadonlyArray<MoverTab> = [
  'gainers',
  'losers',
  'volume',
  'volatility',
  'newListings',
  'unusual',
]

const WINDOWS: ReadonlyArray<MoverWindow> = ['1h', '24h', '7d']

/** Rows to rank. Past this the tab is a screener, and the scanner is one pane over. */
const ROW_LIMIT = 50

/**
 * The sector selection this table shares with the tape and the scanner.
 *
 * One key, three panes: the sector tape writes it, the markets scanner reads
 * it, and so does this table. It is named for the pair picker because that is
 * where the chip started; keep the string in step with `sector-tape-pane.tsx`
 * and `markets-pane.tsx`.
 */
const SECTOR_CATEGORY_KEY = 'pair-picker.category'

/** What an unpublished figure renders as, matching the other panes. */
const DASH = '—'

// Rank, pair, change, price, volume, trend. Columns join as the pane widens:
// the change percentage is the point, price is the next thing anyone checks,
// and volume and the trend line are the two that need real width to say
// anything.
const MOVERS_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_4.75rem] items-center gap-x-2.5 @min-[24rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7rem_5rem] @min-[33rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_5.25rem_6.5rem] @min-[41rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_5.25rem_6.5rem_4.5rem]'

// Listed-ago first: on this tab the age IS the ranking, so it reads before the
// name rather than trailing it. Venue, price and liquidity join as the pane
// widens, in the order somebody vetting a fresh listing asks for them.
const LISTINGS_GRID =
  'grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-2.5 @min-[24rem]/pane:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem] @min-[33rem]/pane:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_5.25rem] @min-[41rem]/pane:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_5.25rem_5.5rem]'

export function MoversPane() {
  const section = useDiscoverySection()
  return section === 'stocks' ? <EquityMovers /> : <CryptoMovers />
}

// ── Crypto ──────────────────────────────────────────────────────────

function CryptoMovers() {
  const { t } = useTranslation()
  const coins = useTopCoinsSnapshot()
  const state = useTopCoinsSnapshotState()
  const membership = useSectorMembership()
  const market = usePreferredMarketResolver()('crypto')

  const [tab, setTab] = usePersistedState<MoverTab>('movers.tab', 'gainers')
  const [window, setWindow] = usePersistedState<MoverWindow>(
    'movers.window',
    '24h',
  )
  // The sector tape's own selection, read rather than owned: clicking DeFi
  // over there narrows this table to DeFi, which is the whole point of the two
  // panes sitting in one column. `watchlists` is a scanner-only value and
  // names no sector, so it reads as no filter here.
  const [category, setCategory] = usePersistedState<string>(
    SECTOR_CATEGORY_KEY,
    'all',
  )
  const sector =
    category === 'all' || category === 'watchlists'
      ? null
      : (category as InstrumentCategory)

  const rows = useMemo(() => {
    const all = [...coins.values()]
    // Narrow BEFORE ranking, not after: ranking first and filtering the top 50
    // would leave a small sector with three rows on a board that has fifty to
    // give it.
    const scoped = sector
      ? all.filter((coin) =>
          membership.categoriesOf.get(coin.symbol)?.includes(sector),
        )
      : all
    return rankMovers(scoped, tab, window, ROW_LIMIT)
  }, [coins, membership, sector, tab, window])

  return (
    <MoversTable
      tabs={CRYPTO_TABS}
      tab={tab}
      onTabChange={setTab}
      window={window}
      onWindowChange={setWindow}
      rows={rows}
      loading={state === 'loading'}
      // Reported rather than returned early: the listings tab has its own two
      // sources, so a refused top-coins snapshot must not take the tab strip
      // down with it.
      snapshotUnavailable={state === 'unavailable'}
      market={market}
      assetClass="crypto"
      quote="USDT"
      // Translated here rather than in the row: the equity board's tags are
      // sentences from a calendar, not catalog categories, so the shared row
      // takes a finished label and renders it.
      categoryOf={(symbol) => {
        const first = membership.categoriesOf.get(symbol)?.[0]
        return first ? t(`markets.category.${first}`) : null
      }}
      sectorLabel={sector ? t(`markets.category.${sector}`) : null}
      onClearSector={() => setCategory('all')}
    />
  )
}

// ── Equities ────────────────────────────────────────────────────────

/**
 * The same table over a broker's bulk snapshot.
 *
 * A stock has one venue, and that venue serves nothing without the user's own
 * key — so the two states before any row exists are "no broker installed" and
 * "no key yet", and they get different answers because their fixes are
 * different. The key one is a compact prompt rather than the full hero: this
 * pane sits on a board where the session strip is gated on the same key, and
 * two centred paragraphs of the same sentence read as a broken workspace.
 */
function EquityMovers() {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const snapshots = useBulkTickerSnapshots()
  const reasonOf = useEquityReasonTags()
  const [tab, setTab] = usePersistedState<MoverTab>(
    'movers.equityTab',
    'gainers',
  )

  const venue = useMemo(
    () => markets.find((m) => m.assetClasses.includes('stocks')),
    [markets],
  )
  const gate = useMarketCredentialGate(venue?.value ?? '')

  const entries = useMemo((): Array<BulkTickerEntry> => {
    if (!venue) return []
    const snapshot = snapshots.find((s) => s.market === venue.value)
    return snapshot?.tickers ?? []
  }, [snapshots, venue])

  const rows = useMemo(
    () => rankEquityMovers(entries, tab, ROW_LIMIT),
    [entries, tab],
  )

  if (!venue) {
    return (
      <PaneEmpty
        icon={TrendingUp}
        title={t('movers.noBrokerTitle')}
        body={t('movers.noBrokerBody')}
      />
    )
  }

  if (gate.state !== 'ok') {
    return (
      <PaneCredentialsRequired
        state={gate.state}
        market={venue.value}
        variant="compact"
        venueLabel={gate.venueLabel}
      />
    )
  }

  return (
    <MoversTable
      tabs={EQUITY_MOVER_TABS}
      tab={EQUITY_MOVER_TABS.includes(tab) ? tab : 'gainers'}
      onTabChange={setTab}
      window="24h"
      rows={rows}
      loading={entries.length === 0}
      market={venue.value}
      assetClass="stocks"
      categoryOf={reasonOf}
    />
  )
}

// ── Shared table ────────────────────────────────────────────────────

function MoversTable({
  tabs,
  tab,
  onTabChange,
  window,
  onWindowChange,
  rows,
  loading,
  snapshotUnavailable = false,
  market,
  assetClass,
  quote,
  categoryOf,
  sectorLabel = null,
  onClearSector,
}: {
  tabs: ReadonlyArray<MoverTab>
  tab: MoverTab
  onTabChange: (tab: MoverTab) => void
  window: MoverWindow
  /** Omitted where the source only has one window — the chips hide with it. */
  onWindowChange?: (window: MoverWindow) => void
  rows: Array<MoverRow>
  loading: boolean
  /** The ranking source refused. Only the ranked tabs are affected. */
  snapshotUnavailable?: boolean
  market: string
  assetClass: string
  /** Quote leg for crypto rows; equities are bare tickers. */
  quote?: string
  /** A finished label for the row's second slot, already translated. */
  categoryOf: (symbol: string) => string | null
  /** The sector these rows are narrowed to, translated. Null means all. */
  sectorLabel?: string | null
  onClearSector?: () => void
}) {
  const { t } = useTranslation()
  // Its own sources, its own columns, its own empty state. Everything below
  // that reads a MoverRow is skipped for it.
  const listings = tab === 'newListings'
  // A stock's tag is a sentence about today ('Reports tonight'), not a
  // one-word category, so it gets the row's second line instead of a chip
  // squeezed in beside the ticker.
  const stacked = assetClass === 'stocks'

  return (
    // One panel, always the active tab: the table below is what every tab
    // shows, so a panel per tab would be five copies of the same subtree with
    // four of them unmounted. Keeping the Root around it is what ties the
    // table to the tab strip for a screen reader.
    <Tabs
      value={tab}
      onValueChange={(value) => {
        track('movers_tab_selected', { tab: value })
        onTabChange(value as MoverTab)
      }}
      className="flex h-full flex-col gap-0 overflow-hidden"
    >
      {/* The same row the board draws over a stacked cell, down to the class
          list: these tabs and the shell's tab header are the same control at
          two depths, and two different type scales for it was the thing that
          made a board of panes look assembled rather than designed. Keep this
          in step with `layout/layout-tab-group.tsx`. */}
      <div className="flex h-5 shrink-0 items-center gap-2">
        <TabsList
          variant="line"
          className="h-5 min-w-0 gap-3 overflow-x-auto rounded-none p-0"
        >
          {tabs.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                'h-5 min-w-0 flex-none rounded-none border-0 px-0 py-0',
                'text-[11.5px] leading-none font-normal text-muted-foreground',
                'data-active:bg-transparent data-active:text-[12.5px] data-active:font-medium data-active:tracking-[-0.005em] data-active:text-foreground',
                'dark:data-active:border-transparent dark:data-active:bg-transparent',
                'after:hidden',
              )}
            >
              {t(`movers.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1" />
        {/* Where the sector tape's click surfaces. Without it the table is
            narrowed by a pane the user may have scrolled past, with nothing on
            it saying so and no way back except finding that pane again. */}
        {sectorLabel && onClearSector && (
          <button
            type="button"
            onClick={onClearSector}
            aria-label={t('movers.clearSector')}
            title={t('movers.clearSector')}
            className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-muted/60 pr-1 pl-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="max-w-24 truncate">{sectorLabel}</span>
            <X className="size-3" />
          </button>
        )}
        {onWindowChange && !listings && (
          <ToggleGroup
            aria-label={t('movers.window')}
            multiple={false}
            size="sm"
            value={[window]}
            variant="outline"
            className="shrink-0"
            onValueChange={(next) => {
              const value = next[0]
              if (value && WINDOWS.includes(value as MoverWindow)) {
                onWindowChange(value as MoverWindow)
              }
            }}
          >
            {WINDOWS.map((id) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="h-6 min-w-6 px-1.5 font-mono text-[10px]"
              >
                {id}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {/* Column header */}
      {listings ? (
        <PaneColumnHeader className={cn('px-1.5 pt-2', LISTINGS_GRID)}>
          <span className="truncate">{t('movers.columns.listed')}</span>
          <span className="truncate">{t('movers.columns.asset')}</span>
          <span className="hidden truncate @min-[24rem]/pane:inline">
            {t('movers.columns.venue')}
          </span>
          <span className="hidden text-right @min-[33rem]/pane:inline">
            {t('movers.columns.price')}
          </span>
          <span className="hidden text-right @min-[41rem]/pane:inline">
            {t('movers.columns.liquidity')}
          </span>
        </PaneColumnHeader>
      ) : (
        <PaneColumnHeader className={cn('px-1.5 pt-2', MOVERS_GRID)}>
          <span>#</span>
          <span className="truncate">{t('movers.columns.pair')}</span>
          <span className="truncate">
            {t('movers.columns.change', { window })}
          </span>
          <span className="hidden text-right @min-[24rem]/pane:inline">
            {t('movers.columns.price')}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="hidden truncate text-right @min-[33rem]/pane:inline" />
              }
            >
              {t('movers.columns.volume')}
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {t(
                stacked
                  ? 'movers.tradedValueTooltip'
                  : 'movers.turnoverTooltip',
              )}
            </TooltipContent>
          </Tooltip>
          <span className="hidden text-right @min-[41rem]/pane:inline">
            {t('movers.columns.trend')}
          </span>
        </PaneColumnHeader>
      )}

      <TabsContent value={tab} className="min-h-0 flex-1 overflow-y-auto">
        {listings ? (
          <NewListingsTab />
        ) : snapshotUnavailable ? (
          <PaneEmpty
            icon={TrendingUp}
            title={t('movers.emptyTitle')}
            body={t('movers.emptyBody')}
          />
        ) : loading ? (
          <MoversSkeleton />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {sectorLabel
              ? t('movers.emptySector', { sector: sectorLabel })
              : t(`movers.empty.${tab}`)}
          </p>
        ) : (
          rows.map((row, index) => (
            <MoverTableRow
              key={row.symbol}
              row={row}
              rank={index + 1}
              barFraction={changeBarFraction(row, rows)}
              market={market}
              assetClass={assetClass}
              quote={quote}
              category={categoryOf(row.symbol)}
              stacked={stacked}
            />
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}

function MoversSkeleton() {
  return (
    <div className="space-y-2 py-2.5">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-2 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

const MoverTableRow = memo(function MoverTableRow({
  row,
  rank,
  barFraction,
  market,
  assetClass,
  quote,
  category,
  stacked = false,
}: {
  row: MoverRow
  rank: number
  barFraction: number
  market: string
  assetClass: string
  quote?: string
  category: string | null
  /** Put the label on its own line under the ticker instead of beside it. */
  stacked?: boolean
}) {
  const tick = usePriceTick(row.price)
  const up = row.changePct >= 0

  // The routing symbol, not the display one: a crypto row is charted against
  // its quote leg, a stock is its bare ticker.
  const symbol = quote ? `${row.symbol}-${quote}` : row.symbol
  const target = entryToMarketRef({ symbol, assetClass, quote }, market)

  return (
    <Link
      {...chartLinkProps(target)}
      className={cn(
        'rounded-[5px] px-1.5 py-1.5 text-xs transition-colors hover:bg-accent/40',
        MOVERS_GRID,
      )}
    >
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {rank}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <PairAvatar
          base={row.symbol}
          logoUrl={row.logoUrl}
          assetClass={assetClass}
          size="sm"
          className="size-[22px] text-[9px]"
        />
        {stacked ? (
          <span className="min-w-0">
            <span className="block truncate whitespace-nowrap font-mono text-[12px] font-semibold">
              {row.symbol}
            </span>
            {category && (
              <span className="block truncate text-[10.5px] text-muted-foreground">
                {category}
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="truncate whitespace-nowrap font-mono text-[12px] font-semibold">
              {row.symbol}
              {quote && (
                <span className="font-normal text-muted-foreground">
                  -{quote}
                </span>
              )}
            </span>
            {category && (
              <span className="hidden shrink-0 rounded-sm bg-secondary px-1.5 py-px text-[10px] font-normal text-muted-foreground @min-[30rem]/pane:inline">
                {category}
              </span>
            )}
          </>
        )}
      </span>

      <span className="flex items-center gap-2">
        <span className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted @min-[24rem]/pane:block">
          <span
            className={cn('block h-full', up ? 'bg-up' : 'bg-down')}
            style={{ width: `${(barFraction * 100).toFixed(1)}%` }}
          />
        </span>
        <span
          className={cn(
            'ml-auto shrink-0 font-mono text-[11.5px] tabular-nums',
            up ? 'text-up' : 'text-down',
          )}
        >
          {up ? '+' : ''}
          {row.changePct.toFixed(2)}%
        </span>
      </span>

      <span
        className={cn(
          'tick-cell hidden justify-end font-mono text-[11.5px] tabular-nums transition-colors duration-700 @min-[24rem]/pane:flex',
          tick === 'up' ? 'tick-up' : tick === 'down' ? 'tick-down' : undefined,
        )}
      >
        <TickArrow direction={tick} />
        {formatPrice(row.price)}
      </span>

      <span className="hidden justify-self-end whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground @min-[33rem]/pane:inline">
        {row.volume24h === null ? (
          '—'
        ) : (
          <>
            {formatCompactUsd(row.volume24h)}
            {row.turnoverMultiple !== null && (
              <>
                {' · '}
                <span
                  className={
                    row.turnoverMultiple >= UNUSUAL_TURNOVER
                      ? '[color:var(--chart-4)]'
                      : undefined
                  }
                >
                  {row.turnoverMultiple.toFixed(1)}×
                </span>
              </>
            )}
          </>
        )}
      </span>

      <span className="hidden @min-[41rem]/pane:block">
        <MiniPriceChart market={market} pair={symbol} className="h-5 w-full" />
      </span>
    </Link>
  )
})

// ── New listings ────────────────────────────────────────────────────

/**
 * What started trading recently, from two sources with different guarantees.
 *
 * A venue row is our own sweeper's first sighting, so it is accurate to the
 * hourly sweep and never predates the day tracking began — which is what the
 * footer states rather than leaving the reader to assume we have watched
 * forever. A pool row is the chain's own creation time, exact, and filtered by
 * a liquidity floor because a new-pools feed is mostly deployments.
 *
 * Either half can be missing. A build with no App Server has no venue rows and
 * says so in one line; a throttled provider drops the pools. Only both refusing
 * is empty.
 */
function NewListingsTab() {
  const { t } = useTranslation()
  const feed = useNewListings()
  const coins = useTopCoinsSnapshot()
  const { markets } = useAvailableMarkets()

  // Venue id → label, for the venue column, and the set that can be opened:
  // a listing on a connector nobody installed is still worth reading and is
  // not worth a click that lands on a dead chart.
  const venues = useMemo(
    () => new Map(markets.map((m) => [m.value, m.label])),
    [markets],
  )

  if (feed.isLoading) return <MoversSkeleton />

  if (feed.rows.length === 0) {
    return (
      <PaneEmpty
        icon={Sparkles}
        title={t('movers.newListings.emptyTitle')}
        body={
          feed.cexUnavailable && feed.dexError
            ? t('movers.newListings.emptyBodyBothOff')
            : t('movers.empty.newListings')
        }
      />
    )
  }

  return (
    <>
      {feed.rows.map((row) => (
        <NewListingTableRow
          key={row.key}
          row={row}
          venueLabel={venues.get(row.market) ?? null}
          logoUrl={
            row.base
              ? (coins.get(row.base.toUpperCase())?.logoUrl ?? null)
              : null
          }
          priceUsd={
            row.priceUsd ??
            (row.base
              ? (coins.get(row.base.toUpperCase())?.price ?? null)
              : null)
          }
        />
      ))}
      <NewListingsFooter feed={feed} />
    </>
  )
}

/**
 * What this list is and is not.
 *
 * Two claims, both stated only when true: how far back our own venue tracking
 * goes, and that the venue half is missing entirely. Without the first, a short
 * list reads as "nothing was listed"; without the second, a standalone build
 * silently shows half a feed.
 */
function NewListingsFooter({ feed }: { feed: NewListingsFeed }) {
  const { t } = useTranslation()
  if (!feed.cexUnavailable && feed.trackingSince === null) return null

  return (
    <p className="py-2.5 text-[10px] leading-relaxed text-muted-foreground">
      {feed.cexUnavailable
        ? t('movers.newListings.cexOff')
        : t('movers.newListings.trackingSince', {
            date: formatTrackingSince(feed.trackingSince),
          })}
    </p>
  )
}

function formatTrackingSince(when: number | null): string {
  if (when === null) return ''
  return new Date(when).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: undefined,
  })
}

const NewListingTableRow = memo(function NewListingTableRow({
  row,
  venueLabel,
  logoUrl,
  priceUsd,
}: {
  row: NewListingRow
  /** Null when no installed connector serves this venue — the row stays flat. */
  venueLabel: string | null
  logoUrl: string | null
  priceUsd: number | null
}) {
  const { t } = useTranslation()

  // A pool opens by ADDRESS (see pool-link.ts); a venue pair opens by symbol
  // on the venue that listed it. A venue with no installed connector has no
  // target at all, and the row renders without a link rather than pointing at
  // a chart that cannot load.
  const target =
    row.kind === 'dex'
      ? row.pool
        ? poolChartTarget(row.pool, row.market)
        : null
      : venueLabel
        ? chartLinkProps(
            entryToMarketRef(
              {
                symbol: row.label,
                assetClass: 'crypto',
                quote: row.quote ?? undefined,
              },
              row.market,
            ),
          )
        : null

  const cells = (
    <>
      <span className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {formatRelativeTime(row.listedAt)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <PairAvatar
          base={row.base ?? row.label}
          logoUrl={logoUrl}
          assetClass={row.kind === 'dex' ? 'dex' : 'crypto'}
          size="sm"
          className="size-5 text-[9px]"
        />
        <span className="truncate whitespace-nowrap font-mono text-[12px] font-semibold">
          {row.label}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-sm px-1.5 py-px text-[10px] font-normal',
            row.kind === 'dex'
              ? 'bg-secondary text-muted-foreground'
              : 'bg-primary/10 text-primary',
          )}
        >
          {row.kind === 'dex'
            ? t('movers.newListings.onChain')
            : t('movers.newListings.venue')}
        </span>
      </span>

      <span className="hidden truncate text-[11px] text-muted-foreground @min-[24rem]/pane:inline">
        {row.kind === 'dex'
          ? (dexChain(row.market)?.displayName ?? row.market)
          : (venueLabel ?? row.market)}
      </span>

      <span className="hidden justify-end font-mono text-[11.5px] tabular-nums @min-[33rem]/pane:flex">
        {priceUsd === null ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          formatPrice(priceUsd)
        )}
      </span>

      <span className="hidden justify-end whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground @min-[41rem]/pane:flex">
        {row.liquidityUsd === null ? DASH : formatCompactUsd(row.liquidityUsd)}
      </span>
    </>
  )

  const className = cn(
    'rounded-[5px] px-1.5 py-1.5 text-xs transition-colors',
    LISTINGS_GRID,
    target && 'hover:bg-accent/40',
  )

  return target ? (
    <Link {...target} className={className}>
      {cells}
    </Link>
  ) : (
    <div className={className}>{cells}</div>
  )
})
