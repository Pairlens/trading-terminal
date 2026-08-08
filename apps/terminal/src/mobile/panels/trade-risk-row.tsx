// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Risk used 1.6% of 2.0% cap" — the ticket's third summary row.
 *
 * The design calls this first-class and it is: the desk carries a persistent
 * risk bar, and a phone that quietly drops it would be the one surface where a
 * user cannot see how big the order they are about to place actually is.
 *
 * The numbers are the real ones. `orderNotionalUsd` + `evaluatePositionSize`
 * are the same pure functions the guarded order path enforces with
 * (`market-data-provider`), and the cap is the user's own `maxPositionSize`.
 * This row is therefore a preview of a decision that is made elsewhere — it can
 * never be the thing that permits an order, only the thing that explains one.
 *
 * When no cap is configured the row still renders: the share of the portfolio
 * an order represents is worth knowing whether or not a limit is set on it.
 *
 * The row calls `useTradeRisk` ITSELF rather than taking a computed verdict.
 * `usePortfolioValue` opens one ticker subscription per held asset and bumps
 * state on every tick of every one of them; owned by the ticket, that woke the
 * whole 900-line form — and the fields the user is typing into — at socket
 * rate, which is exactly what the ticket's `LivePriceProbe` exists to prevent.
 * Owned here, the ticks re-render one 12px line. The props are all scalars, so
 * `memo` actually compares them (a verdict object never matched), and the one
 * fact the ticket needs back — whether risk BLOCKS the order — is reported
 * through `onBlocksChange`, which only fires when the answer changes.
 */
import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  evaluatePositionSize,
  orderNotionalUsd,
} from '@/lib/risk/position-size'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import { useRiskConfigStore } from '@/stores/risk-config-store'

export type TradeRiskVerdict = {
  /** Order notional as a percent of portfolio, or null when unpriceable. */
  ratioPct: number | null
  /** The user's maxPositionSize, in percent. 0 when no cap is configured. */
  capPct: number
  /** Over the cap. */
  exceeds: boolean
  /** Over the cap AND the configured action refuses the order. */
  blocks: boolean
}

export type TradeRiskInput = {
  pairKey: string
  side: 'buy' | 'sell'
  /** The amount as typed. */
  size: number
  /** True when the amount is denominated in the quote currency. */
  quoteDenominated: boolean
  /** Limit/stop price, or the live price for a market order. */
  price: number | null
  /** Scopes the portfolio to the account this ticket would trade from. */
  credentialId?: string
}

export function useTradeRisk(input: TradeRiskInput): TradeRiskVerdict {
  const { totalValueUsd, priceUsd } = usePortfolioValue(input.credentialId)
  const capPct = useRiskConfigStore((s) => s.maxPositionSize)
  const action = useRiskConfigStore((s) => s.positionSizeAction)

  const notionalUsd = orderNotionalUsd(
    {
      pair: input.pairKey,
      size: input.size,
      quoteDenominated: input.quoteDenominated,
      price: input.price,
    },
    priceUsd,
  )

  // evaluatePositionSize fails open (an unknown price never blocks a real
  // order), so the display ratio is computed separately — "we could not price
  // this" and "this is 0% of your portfolio" are different statements.
  const { exceeds } = evaluatePositionSize(notionalUsd, totalValueUsd, capPct)
  const ratioPct =
    notionalUsd != null && totalValueUsd > 0
      ? (notionalUsd / totalValueUsd) * 100
      : null

  const blocks =
    exceeds &&
    (action === 'block_all' ||
      (action === 'block_buys' && input.side === 'buy'))

  return { ratioPct, capPct, exceeds, blocks }
}

export type TradeRiskRowProps = TradeRiskInput & {
  /**
   * Fired when the verdict's `blocks` flips. The ticket disables its confirm
   * on it; passing a `useState` setter keeps the identity stable and makes a
   * repeat of the same answer a no-op render.
   */
  onBlocksChange: (blocks: boolean) => void
}

export const TradeRiskRow = memo(function TradeRiskRow({
  onBlocksChange,
  ...input
}: TradeRiskRowProps) {
  const { t } = useTranslation()
  const { ratioPct, capPct, exceeds, blocks } = useTradeRisk(input)

  useEffect(() => {
    onBlocksChange(blocks)
  }, [blocks, onBlocksChange])

  // Unmounting the row must not leave the ticket permanently blocked: the
  // verdict it reported dies with it.
  useEffect(() => {
    return () => onBlocksChange(false)
  }, [onBlocksChange])

  const used = ratioPct == null ? '—' : `${ratioPct.toFixed(1)}%`
  const value =
    ratioPct == null
      ? used
      : capPct > 0
        ? t('mobile.trade.riskUsedValue', {
            used,
            cap: `${capPct.toFixed(1)}%`,
          })
        : t('mobile.trade.riskUsedNoCap', { used })

  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-normal">
      <span className="text-muted-foreground">
        {t('mobile.trade.riskUsed')}
      </span>
      <span
        className={cn(
          'font-mono tabular-nums',
          exceeds ? 'font-semibold text-down' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
})
