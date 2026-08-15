// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open contract positions on the prediction venues.
 *
 * A net-new surface: `positions-pane` is misnamed and renders ORDERS, and a
 * spot balance sheet has no concept of a holding that expires. What a
 * prediction position needs on screen is the question, the side taken, how
 * many contracts, what they cost, and how long until the answer is known —
 * plus, once the market resolves, what it paid.
 *
 * Deliberately no live mark: a per-outcome ticker subscription for every open
 * position would put a socket on this pane for every row. Cost basis and
 * resolution are what the pane is for; the chart is one click away for the
 * current price.
 */
import { useTranslation } from 'react-i18next'
import { Loader2, Wallet } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Link } from '@tanstack/react-router'

import type { PredictionAccountPositions } from '@/hooks/use-prediction-positions'
import {
  usePredictionAccounts,
  usePredictionPositions,
} from '@/hooks/use-prediction-positions'
import { formatPredictionPrice } from '@/lib/format-price'
import { formatTimeUntil } from '@/lib/format-time'
import {
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'

export function PredictionPositionsPane() {
  const { t } = useTranslation()
  const accounts = usePredictionAccounts()
  const { data, isLoading } = usePredictionPositions(accounts)

  if (accounts.length === 0) {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/accounts"
          >
            {t('predictionPositions.connect')} →
          </Link>
        }
        body={t('predictionPositions.noAccountsBody')}
        icon={Wallet}
        title={t('predictionPositions.noAccountsTitle')}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          {t('predictionPositions.loading')}
        </p>
      </div>
    )
  }

  const results = data ?? []
  const rowCount = results.reduce((n, r) => n + r.positions.length, 0)
  const errors = results.filter((r) => r.error)

  if (rowCount === 0 && errors.length === 0) {
    return (
      <PaneEmpty
        body={t('predictionPositions.emptyBody')}
        icon={Wallet}
        title={t('predictionPositions.emptyTitle')}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex flex-col gap-2">
        {errors.map((result) => (
          <PaneErrorBanner
            key={`err:${result.account.market}:${result.account.accountId}`}
            message={result.error ?? ''}
            venue={result.account.venueLabel}
          />
        ))}

        {rowCount > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <Th>{t('predictionPositions.colMarket')}</Th>
                <Th>{t('predictionPositions.colOutcome')}</Th>
                <Th align="right">{t('predictionPositions.colContracts')}</Th>
                <Th align="right">{t('predictionPositions.colAvgPrice')}</Th>
                <Th align="right">{t('predictionPositions.colCost')}</Th>
                <Th align="right">{t('predictionPositions.colResolves')}</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) =>
                result.positions.map((position) => (
                  <Row
                    key={`${result.account.market}:${result.account.accountId}:${position.pairKey}`}
                    position={position}
                    result={result}
                  />
                )),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function Row({
  result,
  position,
}: {
  result: PredictionAccountPositions
  position: PredictionAccountPositions['positions'][number]
}) {
  const { t } = useTranslation()
  const contracts = Number(position.contracts)
  const avgPrice = position.avgPrice ? Number(position.avgPrice) : null
  // Cost, not value: the venue reports entry price and contract count, and
  // multiplying them is the only number this pane can state without a live
  // book. A buy's cost IS its maximum loss.
  const cost =
    avgPrice !== null && Number.isFinite(contracts)
      ? contracts * (position.side === 'long' ? avgPrice : 1 - avgPrice)
      : null

  return (
    <tr className="border-b border-border/30 last:border-0">
      <td
        className="max-w-56 truncate py-1.5 pr-3"
        title={position.marketTitle}
      >
        <Link
          className="hover:underline"
          params={{ pair: position.pairKey }}
          to="/pair/$pair"
        >
          {position.marketTitle || position.pairKey}
        </Link>
        <span className="ml-1.5 text-[10px] text-muted-foreground">
          {result.account.venueLabel}
        </span>
      </td>
      <td className="py-1.5 pr-3">
        <span
          className={cn(
            'font-medium',
            position.side === 'long' ? 'text-up' : 'text-down',
          )}
        >
          {position.outcomeLabel}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {position.contracts}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {avgPrice !== null ? formatPredictionPrice(avgPrice) : '—'}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {cost !== null ? `$${cost.toFixed(2)}` : '—'}
      </td>
      <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {position.resolved ? (
          <span className="text-foreground">
            {t('predictionPositions.resolved')}
            {position.payout ? ` · $${Number(position.payout).toFixed(2)}` : ''}
          </span>
        ) : position.endMs !== undefined ? (
          formatTimeUntil(position.endMs)
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}
