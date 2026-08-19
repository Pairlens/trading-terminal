// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Who inside the company has been buying or selling it.
 *
 * The direction is stated in trader language, Buy and Sell, rather than in the
 * filing's own acquisition/disposal. That is not dumbing it down: the whole
 * reason to open this pane is to compare it against your own position, and
 * 'disposal' is a word nobody puts next to a short.
 *
 * The summary line leads with counts and the SPAN they cover, because the
 * counts alone lie. A company files nothing for two years and then eleven sales
 * in a week; '2 buys, 40 sells' with no span reads like this month either way.
 * The span is the range actually loaded (the server keeps the newest 200
 * filings), never a window we claim to have asked for.
 *
 * Value is shares times price and is BLANK on a grant, because a grant has no
 * price and a $0 sitting in a column of dollars reads as a worthless trade
 * rather than as one that was never a purchase.
 *
 * Filings come from the App Server (`/api/insider-transactions`), not from a
 * connector: a broker fills orders, it does not publish Form 4s. The venue is
 * still what decides whether this symbol is a company at all, the same guard
 * the Company pane carries and for the same reason ('BTC' is a real NYSE Arca
 * ticker).
 */
import { UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePanePair } from '@pairlens/plugin-sdk'
import { cn } from '@pairlens/ui'
import type { InsiderTransaction } from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty, Th } from '@/components/panes/pane-primitives'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { equityTickerOf } from '@/hooks/use-equity-positions'
import { useInsiderTransactions } from '@/hooks/use-equity-fundamentals'
import { useOptionalChartConfig } from '@/lib/chart-terminal-context'
import {
  formatCompactCount,
  formatCompactMoney,
  formatMoneyPrecise,
} from '@/lib/equities/company-format'
import {
  insiderValue,
  summarizeInsiderActivity,
} from '@/lib/equities/insider-activity'
import { formatResolutionDate } from '@/lib/format-time'

export function InsiderActivityPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return <InsiderActivityPaneInner pairKey={activePair.pairKey} />
}

function InsiderActivityPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const ticker = equityTickerOf(pairKey)
  const market = useOptionalChartConfig()?.market ?? ''

  // Same guard as the Company pane: the VENUE decides whether this is a stock,
  // never the symbol. A venue we cannot identify is allowed through, because
  // nothing says it is crypto and the pane was placed by hand.
  const { markets } = useAvailableMarkets()
  const venueInfo = markets.find((m) => m.value === market)
  const servesStocks = venueInfo
    ? venueInfo.assetClasses.includes('stocks')
    : true

  const { data, isLoading, unavailable } = useInsiderTransactions(
    servesStocks ? ticker : '',
  )
  const transactions = data?.transactions ?? []
  const summary = summarizeInsiderActivity(transactions)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The counts ride in the shell's own header row: the pane is named
          'Insider Activity' up there already, and a second title under it was
          the pane's only piece of chrome. */}
      {transactions.length > 0 && (
        <>
          <PaneHeaderMetric>
            {t('insiderActivity.summary', {
              buys: summary.buys,
              sells: summary.sells,
            })}
            {summary.spanDays !== null && (
              <span className="text-muted-foreground/70">
                {' · '}
                {t('insiderActivity.span', { count: summary.spanDays })}
              </span>
            )}
          </PaneHeaderMetric>

          <table className="w-full shrink-0 px-1.5 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <Th>{t('insiderActivity.columns.date')}</Th>
                <Th>{t('insiderActivity.columns.insider')}</Th>
                <Th align="right">{t('insiderActivity.columns.shares')}</Th>
                <Th align="right">{t('insiderActivity.columns.price')}</Th>
                <Th align="right">{t('insiderActivity.columns.value')}</Th>
              </tr>
            </thead>
          </table>
        </>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!servesStocks ? (
          <PaneEmpty
            body={t('insiderActivity.notEquityBody', {
              venue: venueInfo?.label ?? market,
            })}
            icon={UserRound}
            title={t('insiderActivity.notEquityTitle')}
          />
        ) : unavailable ? (
          <UnavailableState reason={unavailable} />
        ) : isLoading ? (
          <LoadingRows />
        ) : transactions.length === 0 ? (
          // Data, not a seam: plenty of companies go a quarter with nobody
          // inside filing anything.
          <PaneEmpty
            body={t('insiderActivity.noFilingsBody')}
            icon={UserRound}
            title={t('insiderActivity.noFilingsTitle', { symbol: ticker })}
          />
        ) : (
          <table className="w-full px-1.5 text-xs">
            <tbody>
              {transactions.map((tx, i) => (
                <InsiderRow
                  key={`${tx.date}:${tx.name}:${tx.security ?? ''}:${i}`}
                  transaction={tx}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/**
 * One filing.
 *
 * The name carries the role underneath it, small: a CEO selling and a director
 * selling are different facts, and a title column would take the width the
 * numbers need.
 */
function InsiderRow({ transaction }: { transaction: InsiderTransaction }) {
  const { t } = useTranslation()
  const isBuy = transaction.type === 'acquisition'
  const value = insiderValue(transaction.shares, transaction.sharePrice)

  return (
    <tr className="border-b border-border/40 align-top last:border-0 hover:bg-accent/40">
      <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatResolutionDate(`${transaction.date}T00:00:00Z`)}
      </td>
      <td className="max-w-[12rem] pr-3">
        <p className="flex items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded px-1 py-px text-[9.5px] font-medium uppercase tracking-wide',
              isBuy ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
            )}
          >
            {isBuy ? t('insiderActivity.buy') : t('insiderActivity.sell')}
          </span>
          <span className="truncate text-[11.5px]">{transaction.name}</span>
        </p>
        {transaction.title && (
          <p className="truncate text-[11px] text-muted-foreground/80">
            {transaction.title}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap pr-3 text-right font-mono text-[11px] tabular-nums">
        {formatCompactCount(transaction.shares) ?? ''}
      </td>
      <td className="whitespace-nowrap pr-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {/* A grant has no price. Blank, never zero. */}
        {formatMoneyPrecise(transaction.sharePrice, null) ?? ''}
      </td>
      <td
        className={cn(
          'whitespace-nowrap text-right font-mono text-[11px] tabular-nums',
          value === null && 'text-muted-foreground/60',
        )}
      >
        {value === null ? (
          <span className="text-[10px]">{t('insiderActivity.noValue')}</span>
        ) : (
          // USD is not a guess: these are SEC Form 4 filings, and the wire
          // carries no currency because there is only one.
          formatCompactMoney(value, 'USD')
        )}
      </td>
    </tr>
  )
}

/** The three ways there are no filings that are not about the company. */
function UnavailableState({ reason }: { reason: FundamentalsUnavailable }) {
  const { t } = useTranslation()

  if (reason === 'rate_limited') {
    return (
      <PaneEmpty
        body={t('insiderActivity.providerBusyBody')}
        icon={UserRound}
        title={t('insiderActivity.providerBusyTitle')}
      />
    )
  }
  if (reason === 'upstream_error') {
    return (
      <PaneEmpty
        body={t('insiderActivity.providerErrorBody')}
        icon={UserRound}
        title={t('insiderActivity.providerErrorTitle')}
      />
    )
  }
  return (
    <PaneEmpty
      body={t('insiderActivity.needsProviderBody')}
      icon={UserRound}
      title={t('insiderActivity.needsProviderTitle')}
    />
  )
}

function LoadingRows() {
  return (
    <div className="space-y-1.5 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="h-6 animate-pulse rounded bg-muted" key={i} />
      ))}
    </div>
  )
}
