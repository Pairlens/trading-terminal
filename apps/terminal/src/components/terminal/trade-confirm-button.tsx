// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { cn } from '@pairlens/ui'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import type { ReactNode } from 'react'
import { useHoldConfirm } from '@/hooks/use-trade-confirm'

type TradeConfirmButtonProps = {
  /** Button face content (label + any badges). */
  label: ReactNode
  /** Drives the fill/shadow color: buy = up (green), sell = down (red). */
  side: 'buy' | 'sell'
  /** How long the user must hold before it fires. Ignored in click mode. */
  holdMs?: number
  disabled?: boolean
  /** External in-flight state (keeps the fill at 100% + shows a spinner). */
  busy?: boolean
  busyLabel?: string
  /** Small microcopy under the button (e.g. the criticality note). */
  hint?: string
  onConfirm: () => void
}

/**
 * The ticket's submit button.
 *
 * By default it is a press-and-hold control: a light overlay fills left→right
 * over `holdMs`, completing fires `onConfirm`, releasing early cancels. That
 * conveys the criticality of committing a trade without a modal. Users who
 * would rather not wait can switch the gesture to a single click in
 * Settings → Risk Management; `useHoldConfirm` resolves which one is in force.
 */
export function TradeConfirmButton({
  label,
  side,
  holdMs = 600,
  disabled,
  busy,
  busyLabel = 'Placing…',
  hint,
  onConfirm,
}: TradeConfirmButtonProps) {
  const blocked = Boolean(disabled) || Boolean(busy)
  const { controlProps, fillProps } = useHoldConfirm({
    holdMs,
    disabled,
    busy,
    onConfirm,
  })

  const token = side === 'buy' ? '--up' : '--down'
  const ink = side === 'buy' ? 'oklch(22% .05 150)' : 'oklch(22% .05 25)'

  return (
    <div>
      <button
        type="button"
        disabled={blocked}
        {...controlProps}
        className={cn(
          'relative flex w-full select-none items-center justify-center overflow-hidden rounded-lg py-2 text-sm font-semibold outline-none transition-[filter] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          blocked
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:brightness-105 active:brightness-100',
        )}
        style={{
          backgroundColor: `var(${token})`,
          color: ink,
          boxShadow: `0 6px 20px -8px color-mix(in oklch, var(${token}) 55%, transparent)`,
        }}
      >
        {fillProps ? <span {...fillProps} /> : null}
        <span className="relative flex items-center gap-1.5">
          {busy ? (
            <>
              <Spinner className="size-3.5" />
              {busyLabel}
            </>
          ) : (
            label
          )}
        </span>
      </button>
      {hint ? (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
