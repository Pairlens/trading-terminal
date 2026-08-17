// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a prediction order pays, above the gesture that places it.
 *
 * The phone's counterpart to the desktop `PredictionOrderSummary` card, and
 * deliberately only the DRAWING of it: every number arrives from
 * `predictionPayout` in `lib/predictions/ticket-math`, the same function the
 * desktop card and the ticket's max-loss row read, so the two shells can never
 * disagree about what an order stakes or returns. Nothing is computed here.
 *
 * Both sides are stated the same way, because one contract settles at one unit
 * of collateral whichever way it is held: a sell posts the rest of the dollar
 * and keeps the premium, so quoting its premium as the payout would understate
 * a 212% return as 68%.
 *
 * The card is rendered only for a payout that exists — a size AND a usable
 * price. A figure that survived an unusable price would be the previous
 * order's, sitting directly above a live confirm slider.
 *
 * Render budget: props are scalars and `memo` compares them, so the once-a-
 * second price sample only repaints this card when a figure actually moved.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import type { PredictionPayout } from '@/lib/predictions/ticket-math'
import { formatCollateral } from '@/lib/predictions/ticket-math'

export type TradePayoutCardProps = {
  payout: PredictionPayout
  /** The outcome as the venue names it, already defaulted by the caller. */
  outcome: string
  side: 'buy' | 'sell'
}

export const TradePayoutCard = memo(function TradePayoutCard({
  payout,
  outcome,
  side,
}: TradePayoutCardProps) {
  const { t } = useTranslation()
  // The order in one shape: what it costs against what it returns.
  const costPercent = Math.min(100, (payout.stake / payout.payout) * 100)

  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
      style={{
        background: 'color-mix(in oklch, var(--up) 10%, transparent)',
        boxShadow:
          'inset 0 0 0 1px color-mix(in oklch, var(--up) 26%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {side === 'buy'
            ? t('terminal.trade.ifWins', { outcome })
            : t('terminal.trade.ifDoesNotWin', { outcome })}
        </span>
        <span className="shrink-0 font-mono text-[19px] font-semibold tabular-nums text-up">
          {formatCollateral(payout.payout)}
        </span>
      </div>

      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="bg-muted-foreground/50"
          style={{ width: `${costPercent}%` }}
        />
        <span className="flex-1 bg-up" />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="shrink-0">
          {t('terminal.trade.stakeLine', {
            amount: formatCollateral(payout.stake),
          })}
        </span>
        <span className="truncate">
          {t('terminal.trade.profitLine', {
            amount: formatCollateral(payout.profit),
            roi: `+${(payout.roi * 100).toFixed(0)}%`,
          })}
        </span>
      </div>
    </div>
  )
})
