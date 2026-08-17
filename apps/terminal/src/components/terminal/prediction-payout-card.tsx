// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a prediction order pays, above the button that places it.
 *
 * The ticket sizes in dollars and settles in contracts, and the number a
 * trader is actually deciding on sits between the two: a hundred dollars at
 * 68¢ returns $147 if the outcome happens. Until this card existed the ticket
 * showed the stake and the max loss and left the upside to be worked out in
 * the user's head, which on a probability book is the one arithmetic step
 * nobody should be doing under a live quote.
 *
 * Both sides are stated the same way, because one contract settles at one unit
 * of collateral whichever way you hold it. A sell posts the rest of the dollar
 * and keeps the premium; quoting its premium as the payout would understate a
 * 212% return as 68%. `predictionPayout` owns that rule and the max-loss row
 * below reads the same figure, so the card and the risk line can never
 * disagree about what is committed.
 *
 * Rendered only with a size AND a usable price. A payout figure that survived
 * an unusable price would be the previous order's, sitting under a confirm
 * button for this one.
 */
import { useTranslation } from 'react-i18next'

import type { PredictionPayout } from '@/lib/predictions/ticket-math'
import { formatPredictionPrice } from '@/lib/format-price'
import { predictionPayout } from '@/lib/predictions/ticket-math'

export type PredictionOrderSummaryProps = {
  /** Contract count the order would send, derived from the amount field. */
  contracts: number
  /** Dollar probability price the order is sized against (0..1), or null. */
  price: number | null
  side: 'buy' | 'sell'
  /** The outcome as the venue names it; blank on an unpinned cold link. */
  outcomeLabel: string
}

export function PredictionOrderSummary({
  contracts,
  price,
  side,
  outcomeLabel,
}: PredictionOrderSummaryProps) {
  const { t } = useTranslation()
  const payout = predictionPayout({ contracts, price, side })
  const outcome = outcomeLabel || t('terminal.trade.thisOutcome')

  return (
    <>
      {payout && <PayoutCard outcome={outcome} payout={payout} side={side} />}
      <div className="flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        <Row
          label={t('terminal.trade.avgFillPrice')}
          value={price === null ? '—' : formatPredictionPrice(price)}
        />
        <Row
          label={t('terminal.trade.maxPayout')}
          tone="up"
          value={payout === null ? '—' : usd(payout.payout)}
        />
        {/* A dash, not a stale figure: an unusable price has no worst case,
            and the last valid one would read as this order's. */}
        <Row
          label={t('terminal.trade.maxLoss')}
          tone="down"
          value={payout === null ? '—' : usd(payout.stake)}
        />
      </div>
    </>
  )
}

function PayoutCard({
  payout,
  outcome,
  side,
}: {
  payout: PredictionPayout
  outcome: string
  side: 'buy' | 'sell'
}) {
  const { t } = useTranslation()
  // The bar is the order in one shape: what it costs against what it returns.
  const costPercent = Math.min(100, (payout.stake / payout.payout) * 100)

  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl px-2.5 py-2"
      style={{
        background: 'color-mix(in oklch, var(--up) 10%, transparent)',
        boxShadow:
          'inset 0 0 0 1px color-mix(in oklch, var(--up) 26%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {side === 'buy'
            ? t('terminal.trade.ifWins', { outcome })
            : t('terminal.trade.ifDoesNotWin', { outcome })}
        </span>
        <span className="shrink-0 font-mono text-[17px] font-semibold tabular-nums text-up">
          {usd(payout.payout)}
        </span>
      </div>

      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="bg-muted-foreground/50"
          style={{ width: `${costPercent}%` }}
        />
        <span className="flex-1 bg-up" />
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {t('terminal.trade.stakeLine', { amount: usd(payout.stake) })}
        </span>
        <span className="truncate">
          {t('terminal.trade.profitLine', {
            amount: usd(payout.profit),
            roi: `+${(payout.roi * 100).toFixed(0)}%`,
          })}
        </span>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="uppercase tracking-[.16em]">{label}</span>
      <span
        className={
          value === '—'
            ? 'text-foreground'
            : tone === 'up'
              ? 'text-up'
              : tone === 'down'
                ? 'text-down'
                : 'text-foreground'
        }
      >
        {value}
      </span>
    </div>
  )
}

/** Collateral units. Whole dollars stay whole: contracts settle at exactly $1. */
function usd(value: number): string {
  return `$${value.toFixed(Number.isInteger(value) ? 0 : 2)}`
}
