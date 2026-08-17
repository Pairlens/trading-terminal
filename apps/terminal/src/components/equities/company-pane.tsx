// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ticker as a business: what it is worth, how fast it grows, what it keeps,
 * and when it next reports.
 *
 * One pane replaces a five-tab strip, so the reading order is the order a
 * trader asks the questions in: the catalyst first (a print in three days
 * changes what every other number is worth), then valuation, growth, margins,
 * the range and the street.
 *
 * Two rules run through it. A cell whose figure the provider did not publish is
 * REMOVED, not filled with a dash, and a group with no cells left disappears
 * with them: a grid of dashes reads as a pane still loading and never stopping,
 * which is exactly what this pane used to be. And the graceful absence survives
 * the feature landing, because plenty of builds still have nowhere to ask: a
 * standalone terminal, an App Server with no fundamentals key, an older one
 * that has never heard of the route. All three keep the honest seam.
 *
 * Fundamentals come from the App Server (`/api/company-overview`), not from a
 * connector. A broker quotes and fills; it does not publish a P/E.
 */
import { Building2, CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePanePair } from '@pairlens/plugin-sdk'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Skeleton } from '@pairlens/ui/components/ui/skeleton'
import type {
  CompanyFundamentals,
  EarningsCalendarEntry,
} from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useSymbolLogo } from '@/hooks/use-symbol-logo'
import { equityTickerOf } from '@/hooks/use-equity-positions'
import { useCompanyOverview } from '@/hooks/use-equity-fundamentals'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { useOptionalChartConfig } from '@/lib/chart-terminal-context'
import {
  daysUntilDate,
  formatCompactCount,
  formatCompactMoney,
  formatMoneyPrecise,
  formatPercentFraction,
  formatRatio,
  formatSectorLabel,
  formatSignedPercentFraction,
  joinValues,
  summarizeAnalystRatings,
} from '@/lib/equities/company-format'
import { formatResolutionDate } from '@/lib/format-time'

export function CompanyPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return <CompanyPaneInner pairKey={activePair.pairKey} />
}

function CompanyPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const ticker = equityTickerOf(pairKey)
  const market = useOptionalChartConfig()?.market ?? ''
  const venue = usePaneVenue(market)
  const logoUrl = useSymbolLogo(ticker, 'stocks')

  // The instruments index is the identity source that is not a quote: the
  // discovery snapshot carries the company name and, where the venue published
  // one, the listing MIC.
  const { items } = useMarketInstruments({
    assetClass: 'stocks',
    symbols: ticker,
  })
  const instrument = items.find(
    (inst) => inst.kind === 'equity' && inst.symbol === ticker,
  )
  const mic = instrument?.kind === 'equity' ? instrument.mic : undefined

  // Only a stock has a P/E, and the VENUE decides whether this is one, never
  // the symbol: 'BTC' is a real NYSE Arca ticker (a spot-bitcoin ETF), so
  // asking a fundamentals provider about a crypto pair's base leg answers with
  // a different asset's valuation. That mistake already shipped once here with
  // a broker quoting an ETF under a crypto pair. A venue we cannot identify (a
  // custom workspace with no chart bound) is allowed through: nothing says it
  // is crypto, and the pane was placed by hand.
  const { markets } = useAvailableMarkets()
  const venueInfo = markets.find((m) => m.value === market)
  const servesStocks = venueInfo
    ? venueInfo.assetClasses.includes('stocks')
    : true

  const { data, isLoading, unavailable } = useCompanyOverview(
    servesStocks ? ticker : '',
  )
  const fundamentals = data?.fundamentals ?? null
  const nextEarnings = data?.nextEarnings ?? null
  const sector = formatSectorLabel(
    fundamentals?.industry ?? fundamentals?.sector ?? null,
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        {logoUrl ? (
          <img alt="" className="size-7 shrink-0 rounded-full" src={logoUrl} />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-3.5 text-muted-foreground/70" />
          </span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            {ticker}
            {mic && (
              <Badge className="font-mono text-[10px]" variant="outline">
                {mic}
              </Badge>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {instrument?.name ?? fundamentals?.name ?? t('company.unknownName')}
            {sector && ` · ${sector}`}
            {venue.label && ` · ${venue.label}`}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {!servesStocks ? (
          <PaneEmpty
            body={t('company.notEquityBody', {
              venue: venueInfo?.label ?? market,
            })}
            icon={Building2}
            title={t('company.notEquityTitle')}
          />
        ) : unavailable ? (
          <UnavailableState reason={unavailable} />
        ) : isLoading ? (
          <LoadingGrid />
        ) : fundamentals ? (
          <FundamentalsGrid
            fundamentals={fundamentals}
            nextEarnings={nextEarnings}
          />
        ) : (
          // A listing the provider has a report date for but no filings behind
          // (ADRs do this) still gets its catalyst: the date is the one thing
          // known about it, and dropping it to show a tidier empty state would
          // hide the only fact there is.
          <div className="flex h-full min-h-0 flex-col">
            {nextEarnings && (
              <div className="p-3 pb-0">
                <NextCatalyst currency={null} nextEarnings={nextEarnings} />
              </div>
            )}
            <div className="min-h-0 flex-1">
              <PaneEmpty
                body={t('company.noCoverageBody')}
                icon={Building2}
                title={t('company.noCoverageTitle', { symbol: ticker })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The three ways there are no fundamentals that are not about the company.
 *
 * `not_configured` keeps the sentence this pane shipped with, because it is
 * still exactly true for that build: nothing here serves fundamentals. The
 * other two are temporary and say so, so nobody goes looking for a plugin to
 * install over a rate limit.
 */
function UnavailableState({ reason }: { reason: FundamentalsUnavailable }) {
  const { t } = useTranslation()

  if (reason === 'rate_limited') {
    return (
      <PaneEmpty
        body={t('company.providerBusyBody')}
        icon={Building2}
        title={t('company.providerBusyTitle')}
      />
    )
  }
  if (reason === 'upstream_error') {
    return (
      <PaneEmpty
        body={t('company.providerErrorBody')}
        icon={Building2}
        title={t('company.providerErrorTitle')}
      />
    )
  }
  return (
    <PaneEmpty
      body={t('company.needsProviderBody')}
      icon={Building2}
      title={t('company.needsProviderTitle')}
    />
  )
}

function LoadingGrid() {
  return (
    <div className="space-y-3 p-3">
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton className="h-11" key={i} />
        ))}
      </div>
    </div>
  )
}

function FundamentalsGrid({
  fundamentals: f,
  nextEarnings,
}: {
  fundamentals: CompanyFundamentals
  nextEarnings: EarningsCalendarEntry | null
}) {
  const { t } = useTranslation()
  const currency = f.currency
  const consensus = summarizeAnalystRatings(f.analystRatings)

  const valuation: Array<StatSpec> = [
    {
      label: t('company.marketCap'),
      value: formatCompactMoney(f.marketCap, currency),
    },
    {
      // Trailing and forward together, which is the pair a valuation is read
      // as. The label follows the value: no forward estimate, no 'fwd'.
      label: f.forwardPe !== null ? t('company.peForward') : t('company.pe'),
      value: joinValues([formatRatio(f.peRatio), formatRatio(f.forwardPe)]),
    },
    { label: t('company.peg'), value: formatRatio(f.pegRatio) },
    {
      label: t('company.epsTtm'),
      value: formatMoneyPrecise(f.epsTtm, currency),
    },
    {
      label: t('company.revenueTtm'),
      value: formatCompactMoney(f.revenueTtm, currency),
    },
    {
      label: t('company.ebitda'),
      value: formatCompactMoney(f.ebitda, currency),
    },
  ]

  const growth: Array<StatSpec> = [
    {
      label: t('company.revenueGrowth'),
      value: formatSignedPercentFraction(f.revenueGrowthYoy),
      tone: signTone(f.revenueGrowthYoy),
    },
    {
      label: t('company.earningsGrowth'),
      value: formatSignedPercentFraction(f.earningsGrowthYoy),
      tone: signTone(f.earningsGrowthYoy),
    },
  ]

  const margins: Array<StatSpec> = [
    {
      label: t('company.profitMargin'),
      value: formatPercentFraction(f.profitMargin),
    },
    {
      label: t('company.operatingMargin'),
      value: formatPercentFraction(f.operatingMargin),
    },
    {
      label: t('company.returnOnEquity'),
      value: formatPercentFraction(f.returnOnEquity),
    },
  ]

  const context: Array<StatSpec> = [
    {
      label: t('company.dividendYield'),
      value: formatPercentFraction(f.dividendYield),
    },
    { label: t('company.beta'), value: formatRatio(f.beta) },
    {
      label: t('company.week52'),
      value: joinValues([
        formatMoneyPrecise(f.week52Low, currency),
        formatMoneyPrecise(f.week52High, currency),
      ]),
    },
    {
      // Shares outstanding, and labelled as that: no provider here publishes
      // free float, and calling a share count 'float' would overstate it.
      label: t('company.sharesOutstanding'),
      value: formatCompactCount(f.sharesOutstanding),
    },
  ]

  const groups = [
    {
      key: 'valuation',
      title: t('company.groups.valuation'),
      stats: valuation,
    },
    { key: 'growth', title: t('company.groups.growth'), stats: growth },
    { key: 'margins', title: t('company.groups.margins'), stats: margins },
    { key: 'context', title: t('company.groups.context'), stats: context },
  ].map((group) => ({
    ...group,
    stats: group.stats.filter((stat) => stat.value !== null),
  }))

  const hasAnalyst = consensus !== null || f.analystTargetPrice !== null
  const anything =
    groups.some((g) => g.stats.length > 0) ||
    hasAnalyst ||
    nextEarnings !== null

  if (!anything) {
    return (
      <PaneEmpty
        body={t('company.noFiguresBody')}
        icon={Building2}
        title={t('company.noFiguresTitle')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      {nextEarnings && (
        <NextCatalyst currency={currency} nextEarnings={nextEarnings} />
      )}

      {groups.map(
        (group) =>
          group.stats.length > 0 && (
            <section key={group.key}>
              <GroupTitle>{group.title}</GroupTitle>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {group.stats.map((stat) => (
                  <Stat key={stat.label} {...stat} />
                ))}
              </div>
            </section>
          ),
      )}

      {hasAnalyst && (
        <section>
          <GroupTitle>{t('company.groups.analyst')}</GroupTitle>
          <div className="mt-1.5 rounded-lg border border-border px-2.5 py-2">
            {f.analystTargetPrice !== null && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10.5px] text-muted-foreground">
                  {t('company.targetPrice')}
                </span>
                <span className="font-mono text-[15px] font-semibold tabular-nums">
                  {formatMoneyPrecise(f.analystTargetPrice, currency)}
                </span>
              </div>
            )}
            {consensus && (
              <div className={cn(f.analystTargetPrice !== null && 'mt-2')}>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="bg-up"
                    style={{
                      width: `${(consensus.buy / consensus.total) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-muted-foreground/50"
                    style={{
                      width: `${(consensus.hold / consensus.total) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-down"
                    style={{
                      width: `${(consensus.sell / consensus.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10.5px]">
                  <span className="text-up">
                    {t('company.analystBuy', { count: consensus.buy })}
                  </span>
                  <span className="text-muted-foreground">
                    {t('company.analystHold', { count: consensus.hold })}
                  </span>
                  <span className="text-down">
                    {t('company.analystSell', { count: consensus.sell })}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {t('company.analystCoverage', { count: consensus.total })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/** The next print, and how long there is to position for it. */
function NextCatalyst({
  nextEarnings,
  currency,
}: {
  nextEarnings: EarningsCalendarEntry
  currency: string | null
}) {
  const { t } = useTranslation()
  const days = daysUntilDate(nextEarnings.reportDate)
  const estimate = formatMoneyPrecise(
    nextEarnings.epsEstimate,
    nextEarnings.currency ?? currency,
  )

  const when = Number.isNaN(days)
    ? null
    : days <= 0
      ? t('company.reportsToday')
      : days === 1
        ? t('company.reportsTomorrow')
        : t('company.reportsInDays', { count: days })

  return (
    <section className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
      <CalendarClock className="size-4 shrink-0 text-[var(--chart-4)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] text-muted-foreground">
          {t('company.nextReport')}
        </p>
        <p className="truncate text-xs font-medium">
          {joinValues([
            when,
            formatResolutionDate(`${nextEarnings.reportDate}T00:00:00Z`),
          ])}
        </p>
      </div>
      {estimate && (
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] text-muted-foreground">
            {t('company.consensusEps')}
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums">
            {estimate}
          </p>
        </div>
      )}
    </section>
  )
}

type StatSpec = {
  label: string
  value: string | null
  tone?: 'up' | 'down'
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
      {children}
    </p>
  )
}

/** Only ever rendered with a value: an absent figure removed its own cell. */
function Stat({ label, value, tone }: StatSpec) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className="truncate text-[10.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-[15px] font-semibold tabular-nums',
          tone === 'up' && 'text-up',
          tone === 'down' && 'text-down',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function signTone(value: number | null): 'up' | 'down' | undefined {
  if (value === null || value === 0) return undefined
  return value > 0 ? 'up' : 'down'
}
