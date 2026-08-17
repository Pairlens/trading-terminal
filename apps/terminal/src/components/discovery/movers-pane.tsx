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
 * It opens nothing. Rows come from snapshots other panes already fetch, and
 * the trend lines are viewport-gated, so scrolling the table is the only thing
 * that ever costs a request.
 */
import { memo, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { TrendingUp } from 'lucide-react'
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

import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
import type { MoverRow, MoverTab, MoverWindow } from '@/lib/spot-movers'
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
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { TickArrow } from '@/components/tick-arrow'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'

const CRYPTO_TABS: ReadonlyArray<MoverTab> = [
  'gainers',
  'losers',
  'volume',
  'volatility',
  'unusual',
]

const WINDOWS: ReadonlyArray<MoverWindow> = ['1h', '24h', '7d']

/** Rows to rank. Past this the tab is a screener, and the scanner is one pane over. */
const ROW_LIMIT = 50

// Rank, pair, change, price, volume, trend. Columns join as the pane widens:
// the change percentage is the point, price is the next thing anyone checks,
// and volume and the trend line are the two that need real width to say
// anything.
const MOVERS_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_4.75rem] items-center gap-x-2.5 @min-[24rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7rem_5rem] @min-[33rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_5.25rem_6.5rem] @min-[41rem]/pane:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_5.25rem_6.5rem_4.5rem]'

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

  const rows = useMemo(
    () => rankMovers([...coins.values()], tab, window, ROW_LIMIT),
    [coins, tab, window],
  )

  if (state === 'unavailable') {
    return (
      <PaneEmpty
        icon={TrendingUp}
        title={t('movers.emptyTitle')}
        body={t('movers.emptyBody')}
      />
    )
  }

  return (
    <MoversTable
      tabs={CRYPTO_TABS}
      tab={tab}
      onTabChange={setTab}
      window={window}
      onWindowChange={setWindow}
      rows={rows}
      loading={state === 'loading'}
      market={market}
      assetClass="crypto"
      quote="USDT"
      categoryOf={(symbol) => membership.categoriesOf.get(symbol)?.[0] ?? null}
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
 * different.
 */
function EquityMovers() {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const snapshots = useBulkTickerSnapshots()
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
      categoryOf={() => null}
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
  market,
  assetClass,
  quote,
  categoryOf,
}: {
  tabs: ReadonlyArray<MoverTab>
  tab: MoverTab
  onTabChange: (tab: MoverTab) => void
  window: MoverWindow
  /** Omitted where the source only has one window — the chips hide with it. */
  onWindowChange?: (window: MoverWindow) => void
  rows: Array<MoverRow>
  loading: boolean
  market: string
  assetClass: string
  /** Quote leg for crypto rows; equities are bare tickers. */
  quote?: string
  categoryOf: (symbol: string) => string | null
}) {
  const { t } = useTranslation()

  return (
    // One panel, always the active tab: the table below is what every tab
    // shows, so a panel per tab would be five copies of the same subtree with
    // four of them unmounted. Keeping the Root around it is what ties the
    // table to the tab strip for a screen reader.
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as MoverTab)}
      className="flex h-full flex-col gap-0 overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b px-3">
        <TabsList variant="line" className="h-8 min-w-0 overflow-x-auto">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id} className="text-xs">
              {t(`movers.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1" />
        {onWindowChange && (
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
                className="px-1.5 font-mono text-[10px]"
              >
                {id}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {/* Column header */}
      <div
        className={cn(
          'border-b border-border/50 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground',
          MOVERS_GRID,
        )}
      >
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
            {t('movers.turnoverTooltip')}
          </TooltipContent>
        </Tooltip>
        <span className="hidden text-right @min-[41rem]/pane:inline">
          {t('movers.columns.trend')}
        </span>
      </div>

      <TabsContent value={tab} className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <MoversSkeleton />
        ) : rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {t(`movers.empty.${tab}`)}
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
            />
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}

function MoversSkeleton() {
  return (
    <div className="space-y-2 px-3 py-2.5">
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
}: {
  row: MoverRow
  rank: number
  barFraction: number
  market: string
  assetClass: string
  quote?: string
  category: string | null
}) {
  const { t } = useTranslation()
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
        'px-3 py-1.5 text-xs transition-colors hover:bg-accent/40',
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
          className="size-5 text-[9px]"
        />
        <span className="truncate whitespace-nowrap font-mono text-[12px] font-semibold">
          {row.symbol}
          {quote && (
            <span className="font-normal text-muted-foreground">-{quote}</span>
          )}
        </span>
        {category && (
          <span className="hidden shrink-0 rounded-sm bg-secondary px-1.5 py-px text-[10px] font-normal text-muted-foreground @min-[30rem]/pane:inline">
            {t(`markets.category.${category}`)}
          </span>
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
