// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What is coming: who reports, and what is about to list.
 *
 * Both views are grouped by day rather than sorted into a flat table, because
 * the only reading anyone wants from a calendar is "which day", and a table
 * sorted by symbol makes them scan for tomorrow. Today's group is named, so the
 * row that matters most needs no arithmetic.
 *
 * There is no before-the-bell column on the earnings view, and that is the feed
 * rather than a design choice: the provider publishes a report DATE and no
 * time. A BMO/AMC badge would be a guess about the one detail a trader
 * positions on, so the pane says nothing instead of something plausible.
 *
 * Three scopes on earnings, because the whole market reports about four hundred
 * times a week and nobody reads that: today, the week, and the one that is
 * actually useful, the next report for each name already on a watchlist. The
 * IPO view has no scopes: the entire forward pipeline is a few dozen rows, and
 * filtering it by watchlist is meaningless when nothing in it trades yet.
 * Beyond a cap either view stops drawing rows and says how many it left out
 * rather than mounting a thousand of them (each row also resolves a logo).
 *
 * Rows link at the chart through `chartLinkProps`, so a name in the calendar is
 * one click from its tape. IPO rows do not: there is no tape to link to until
 * the thing lists.
 */
import { useMemo, useState } from 'react'
import { CalendarDays, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui'
import { Tabs, TabsList, TabsTrigger } from '@pairlens/ui/components/ui/tabs'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import type {
  EarningsCalendarEntry,
  IpoCalendarEntry,
} from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { PaneEmpty, Th } from '@/components/panes/pane-primitives'
import {
  useEarningsCalendar,
  useIpoCalendar,
} from '@/hooks/use-equity-fundamentals'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useSymbolLogo } from '@/hooks/use-symbol-logo'
import { chartLinkProps } from '@/lib/market-ref/link'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import {
  earningsDayKind,
  groupEarningsByDate,
  groupIposByDate,
} from '@/lib/equities/earnings-schedule'
import { formatMoneyPrecise } from '@/lib/equities/company-format'
import { formatIpoPriceRange } from '@/lib/equities/ipo-range'
import { formatCalendarDay } from '@/lib/equities/economic-schedule'
import {
  readWatchlistEntry,
  useWatchlistsStore,
} from '@/stores/watchlists-store'

type ScopeId = 'today' | 'week' | 'watchlist'

const SCOPES: ReadonlyArray<ScopeId> = ['today', 'week', 'watchlist']

type SourceId = 'earnings' | 'ipo'

/** A quarter ahead for watched names: their next print, whenever it lands. */
const WATCHLIST_DAYS = 92

/** Enough rows to scan, few enough to mount. */
const MAX_ROWS = 80

export function EarningsCalendarPane() {
  const { t } = useTranslation()
  const [source, setSource] = useState<SourceId>('earnings')
  const [scope, setScope] = useState<ScopeId>('week')

  return (
    // One panel per source rather than TabsContent, because the two views share
    // nothing but the day grouping and mounting only the active one keeps the
    // idle view's query unsubscribed.
    <Tabs
      className="flex h-full min-h-0 flex-col gap-0 overflow-hidden"
      onValueChange={(value) => setSource(value as SourceId)}
      value={source}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
        <TabsList className="h-9 min-w-0" variant="line">
          <TabsTrigger className="text-xs" value="earnings">
            {t('earningsCalendar.title')}
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="ipo">
            {t('earningsCalendar.ipo.title')}
          </TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        {/* Scopes are an earnings idea: the IPO pipeline is short enough to
            read whole, and nothing in it is on a watchlist yet. */}
        {source === 'earnings' && (
          <ToggleGroup
            aria-label={t('earningsCalendar.scopeLabel')}
            multiple={false}
            onValueChange={(next) => {
              const value = next[0]
              if (SCOPES.includes(value as ScopeId)) setScope(value as ScopeId)
            }}
            size="sm"
            value={[scope]}
            variant="outline"
          >
            {SCOPES.map((id) => (
              <ToggleGroupItem className="text-[10px]" key={id} value={id}>
                {t(`earningsCalendar.scopes.${id}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {source === 'earnings' ? <EarningsView scope={scope} /> : <IpoView />}
    </Tabs>
  )
}

function EarningsView({ scope }: { scope: ScopeId }) {
  const { t } = useTranslation()
  const watched = useWatchedEquitySymbols()

  const isWatchlist = scope === 'watchlist'
  const { data, isLoading, unavailable } = useEarningsCalendar({
    days: isWatchlist ? WATCHLIST_DAYS : scope === 'today' ? 1 : 7,
    symbols: isWatchlist ? watched : undefined,
    // Asking the whole market for a filter of nothing would return the whole
    // market, which is the opposite of what this scope means.
    enabled: !isWatchlist || watched.length > 0,
  })

  const entries = data?.entries ?? []
  const shown = entries.slice(0, MAX_ROWS)
  const groups = groupEarningsByDate(shown)

  return (
    <>
      <table className="w-full shrink-0 px-3 text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <Th>{t('earningsCalendar.columns.symbol')}</Th>
            <Th>{t('earningsCalendar.columns.company')}</Th>
            <Th align="right">{t('earningsCalendar.columns.quarterEnd')}</Th>
            <Th align="right">{t('earningsCalendar.columns.epsEstimate')}</Th>
          </tr>
        </thead>
      </table>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {unavailable ? (
          <UnavailableState reason={unavailable} />
        ) : isWatchlist && watched.length === 0 ? (
          <PaneEmpty
            body={t('earningsCalendar.noWatchedBody')}
            icon={CalendarDays}
            title={t('earningsCalendar.noWatchedTitle')}
          />
        ) : isLoading ? (
          <LoadingRows />
        ) : groups.length === 0 ? (
          <PaneEmpty
            body={t(`earningsCalendar.noneInWindowBody.${scope}`)}
            icon={CalendarDays}
            title={t('earningsCalendar.noneInWindowTitle')}
          />
        ) : (
          <>
            {groups.map((group) => (
              <DayGroup
                date={group.date}
                entries={group.entries}
                key={group.date}
              />
            ))}
            {entries.length > shown.length && (
              <p className="px-3 py-2 text-[10.5px] text-muted-foreground">
                {t('earningsCalendar.capped', {
                  shown: shown.length,
                  total: entries.length,
                })}
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * The forward listings pipeline.
 *
 * The whole provider window, because a quarter of IPOs is a few dozen rows and
 * cutting it to a week would usually show nothing. An empty answer here is a
 * genuine drought and says so.
 */
function IpoView() {
  const { t } = useTranslation()
  const { data, isLoading, unavailable } = useIpoCalendar()

  const entries = data?.entries ?? []
  const shown = entries.slice(0, MAX_ROWS)
  const groups = groupIposByDate(shown)

  return (
    <>
      <table className="w-full shrink-0 px-3 text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <Th>{t('earningsCalendar.columns.symbol')}</Th>
            <Th>{t('earningsCalendar.columns.company')}</Th>
            <Th>{t('earningsCalendar.ipo.columns.exchange')}</Th>
            <Th align="right">
              {t('earningsCalendar.ipo.columns.priceRange')}
            </Th>
          </tr>
        </thead>
      </table>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {unavailable ? (
          <IpoUnavailableState reason={unavailable} />
        ) : isLoading ? (
          <LoadingRows />
        ) : groups.length === 0 ? (
          <PaneEmpty
            body={t('earningsCalendar.ipo.noneBody')}
            icon={Rocket}
            title={t('earningsCalendar.ipo.noneTitle')}
          />
        ) : (
          <>
            {groups.map((group) => (
              <IpoDayGroup
                date={group.date}
                entries={group.entries}
                key={group.date}
              />
            ))}
            {entries.length > shown.length && (
              <p className="px-3 py-2 text-[10.5px] text-muted-foreground">
                {t('earningsCalendar.ipo.capped', {
                  shown: shown.length,
                  total: entries.length,
                })}
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * The equity tickers on any watchlist.
 *
 * Read by class rather than by symbol shape: a watchlist holds refs, and the
 * stocks arm is the one whose id IS the ticker, so nothing here has to parse a
 * pair key.
 */
function useWatchedEquitySymbols(): Array<string> {
  const lists = useWatchlistsStore((s) => s.state.lists)
  return useMemo(() => {
    const symbols = new Set<string>()
    for (const list of lists) {
      for (const raw of list.symbols) {
        const ref = readWatchlistEntry(raw)
        if (ref.cls === 'stocks') symbols.add(ref.id.toUpperCase())
      }
    }
    return [...symbols].sort()
  }, [lists])
}

function DayGroup({
  date,
  entries,
}: {
  date: string
  entries: Array<EarningsCalendarEntry>
}) {
  return (
    <section>
      <DayHeader count={entries.length} date={date} />
      <table className="w-full text-xs">
        <tbody>
          {entries.map((entry) => (
            <EarningsRow
              entry={entry}
              key={`${entry.symbol}:${entry.reportDate}`}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function IpoDayGroup({
  date,
  entries,
}: {
  date: string
  entries: Array<IpoCalendarEntry>
}) {
  return (
    <section>
      <DayHeader count={entries.length} date={date} />
      <table className="w-full text-xs">
        <tbody>
          {entries.map((entry) => (
            <IpoRow entry={entry} key={`${entry.symbol}:${entry.date}`} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** The sticky day banner both views share: today named, everything else dated. */
function DayHeader({ date, count }: { date: string; count: number }) {
  const { t, i18n } = useTranslation()
  const kind = earningsDayKind(date)
  // Calendar dates, not instants: formatted in UTC so a reader west of UTC
  // does not see every heading shifted to the day before.
  const stamp = formatCalendarDay(date, i18n.language)
  const label =
    kind === 'today'
      ? t('earningsCalendar.today')
      : kind === 'tomorrow'
        ? t('earningsCalendar.tomorrow')
        : stamp

  return (
    <p
      className={cn(
        'sticky top-0 z-10 flex items-baseline gap-2 border-b border-border/50 bg-background/95 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[.14em] backdrop-blur-sm',
        kind === 'today' ? 'text-[var(--chart-4)]' : 'text-muted-foreground',
      )}
    >
      {label}
      {label !== stamp && (
        <span className="tracking-normal text-muted-foreground/70">
          {stamp}
        </span>
      )}
      <span className="ml-auto tabular-nums tracking-normal text-muted-foreground/70">
        {count}
      </span>
    </p>
  )
}

/**
 * One scheduled report. The logo lookup is per row and shared through
 * react-query, so the same name in two panes costs one request.
 */
function EarningsRow({ entry }: { entry: EarningsCalendarEntry }) {
  const { t, i18n } = useTranslation()
  const resolveMarket = usePreferredMarketResolver()
  const logoUrl = useSymbolLogo(entry.symbol, 'stocks')
  const target = entryToMarketRef(
    { symbol: entry.symbol, assetClass: 'stocks' },
    resolveMarket('stocks'),
  )
  const estimate = formatMoneyPrecise(entry.epsEstimate, entry.currency)

  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-accent/40">
      <td className="py-1.5 pl-3 pr-3">
        <Link
          {...chartLinkProps(target)}
          className="flex items-center gap-1.5 font-mono text-[11.5px] font-medium hover:underline"
        >
          {logoUrl ? (
            <img alt="" className="size-[18px] rounded-full" src={logoUrl} />
          ) : (
            <span className="flex size-[18px] items-center justify-center rounded-full bg-muted text-[8px] text-muted-foreground">
              {entry.symbol.slice(0, 2)}
            </span>
          )}
          {entry.symbol}
        </Link>
      </td>
      <td className="max-w-[10rem] truncate pr-3 text-[11px] text-muted-foreground">
        {entry.name ?? ''}
      </td>
      <td className="whitespace-nowrap pr-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {entry.fiscalDateEnding
          ? formatCalendarDay(entry.fiscalDateEnding, i18n.language)
          : ''}
      </td>
      <td className="whitespace-nowrap pr-3 text-right font-mono text-[11.5px] tabular-nums">
        {/* No estimate is a stated absence, never a zero: the street publishes
            consensus for the names it covers and nothing for the rest. */}
        {estimate ?? (
          <span className="text-[10px] text-muted-foreground/60">
            {t('earningsCalendar.noEstimate')}
          </span>
        )}
      </td>
    </tr>
  )
}

/**
 * One upcoming listing.
 *
 * No chart link and no logo: the symbol does not trade yet, so there is no tape
 * behind it and no brand asset keyed to it. Linking a row that lands on an
 * empty chart would be worse than not linking it.
 */
function IpoRow({ entry }: { entry: IpoCalendarEntry }) {
  const { t } = useTranslation()
  const range = formatIpoPriceRange(
    entry.priceRangeLow,
    entry.priceRangeHigh,
    entry.currency,
  )

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-1.5 pl-3 pr-3 font-mono text-[11.5px] font-medium">
        {entry.symbol}
      </td>
      <td className="max-w-[10rem] truncate pr-3 text-[11px] text-muted-foreground">
        {entry.name}
      </td>
      <td className="max-w-[7rem] truncate pr-3 text-[11px] text-muted-foreground">
        {entry.exchange ?? ''}
      </td>
      <td className="whitespace-nowrap pr-3 text-right font-mono text-[11.5px] tabular-nums">
        {/* Most of a forward calendar has not priced. That is a stated
            absence, never a $0.00 range. */}
        {range.kind === 'unknown' ? (
          <span className="text-[10px] text-muted-foreground/60">
            {t('earningsCalendar.ipo.priceTbd')}
          </span>
        ) : range.kind === 'single' ? (
          range.value
        ) : (
          t('earningsCalendar.ipo.range', { low: range.low, high: range.high })
        )}
      </td>
    </tr>
  )
}

/**
 * The three ways there is no calendar that are not about the window.
 * `not_configured` keeps the sentence the pane shipped with: a build with no
 * provider genuinely has no earnings feed.
 */
function UnavailableState({ reason }: { reason: FundamentalsUnavailable }) {
  const { t } = useTranslation()

  if (reason === 'rate_limited') {
    return (
      <PaneEmpty
        body={t('earningsCalendar.providerBusyBody')}
        icon={CalendarDays}
        title={t('earningsCalendar.providerBusyTitle')}
      />
    )
  }
  if (reason === 'upstream_error') {
    return (
      <PaneEmpty
        body={t('earningsCalendar.providerErrorBody')}
        icon={CalendarDays}
        title={t('earningsCalendar.providerErrorTitle')}
      />
    )
  }
  return (
    <PaneEmpty
      body={t('earningsCalendar.emptyBody')}
      icon={CalendarDays}
      title={t('earningsCalendar.emptyTitle')}
    />
  )
}

/** The same three provider states, in the listings pipeline's own words. */
function IpoUnavailableState({ reason }: { reason: FundamentalsUnavailable }) {
  const { t } = useTranslation()

  if (reason === 'rate_limited') {
    return (
      <PaneEmpty
        body={t('earningsCalendar.providerBusyBody')}
        icon={Rocket}
        title={t('earningsCalendar.ipo.providerBusyTitle')}
      />
    )
  }
  if (reason === 'upstream_error') {
    return (
      <PaneEmpty
        body={t('earningsCalendar.providerErrorBody')}
        icon={Rocket}
        title={t('earningsCalendar.ipo.providerErrorTitle')}
      />
    )
  }
  return (
    <PaneEmpty
      body={t('earningsCalendar.ipo.emptyBody')}
      icon={Rocket}
      title={t('earningsCalendar.ipo.emptyTitle')}
    />
  )
}

function LoadingRows() {
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="h-6 animate-pulse rounded bg-muted" key={i} />
      ))}
    </div>
  )
}
