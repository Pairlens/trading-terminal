// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Slide to buy on OKX" — the commit control.
 *
 * The design draws a slide; the gesture is a HOLD. `useHoldConfirm` is the
 * source of truth for how this product confirms an order — it owns the timing,
 * the progress fill, the reduced-motion fallback and the user's click-instead-
 * of-hold preference — and forking a drag-to-the-end gesture beside it would
 * mean a phone where Settings › Risk Management quietly does nothing. So the
 * bar looks like the design and behaves like the rest of the product: press,
 * the fill runs left to right, release early and nothing happens.
 *
 * The ink colour follows `TradeConfirmButton`'s precedent: a dark oklch on the
 * up/down token, which stays legible whichever theme the tokens resolve to.
 */
import { memo } from 'react'
import { Lock } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import { useHoldConfirm } from '@/hooks/use-trade-confirm'

export type TradeSlideConfirmProps = {
  side: 'buy' | 'sell'
  label: string
  /** Microcopy under the bar — which gesture is in force. */
  hint?: string
  disabled?: boolean
  busy?: boolean
  busyLabel: string
  holdMs: number
  onConfirm: () => void
}

export const TradeSlideConfirm = memo(function TradeSlideConfirm({
  side,
  label,
  hint,
  disabled,
  busy,
  busyLabel,
  holdMs,
  onConfirm,
}: TradeSlideConfirmProps) {
  const blocked = Boolean(disabled) || Boolean(busy)
  const { controlProps, fillProps } = useHoldConfirm({
    holdMs,
    disabled,
    busy,
    onConfirm,
  })

  const token = side === 'buy' ? '--up' : '--down'
  // Ink derived from the fill instead of a fixed dark green/red: `--up` and
  // `--down` are `--chart-2`/`--destructive`, which every theme repaints. A
  // heavy mix toward black keeps the label dark on any of them — buy/sell
  // fills are saturated mid-to-bright by convention, in light themes too.
  const ink = `color-mix(in oklab, var(${token}) 20%, black)`

  return (
    <div>
      <button
        className={cn(
          'relative flex h-[50px] w-full select-none items-center justify-center gap-2 overflow-hidden rounded-[14px] text-[16px] font-semibold outline-none',
          blocked && 'opacity-45',
        )}
        disabled={blocked}
        type="button"
        {...controlProps}
        style={{
          backgroundColor: `var(${token})`,
          color: ink,
          boxShadow: `0 8px 24px -10px color-mix(in oklch, var(${token}) 65%, transparent)`,
        }}
      >
        {fillProps ? <span {...fillProps} /> : null}
        <span className="relative flex items-center gap-2">
          {busy ? (
            <>
              <Spinner className="size-4" />
              {busyLabel}
            </>
          ) : (
            <>
              <Lock aria-hidden className="size-4" />
              {label}
            </>
          )}
        </span>
      </button>
      {hint ? (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
