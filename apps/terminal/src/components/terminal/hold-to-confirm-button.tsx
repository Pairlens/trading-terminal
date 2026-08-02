// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

import { cn } from '@pairlens/ui'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import type { ReactNode } from 'react'

type HoldToConfirmButtonProps = {
  /** Button face content (label + any badges). */
  label: ReactNode
  /** Drives the fill/shadow color: buy = up (green), sell = down (red). */
  side: 'buy' | 'sell'
  /** How long the user must hold before it fires. */
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
 * A press-and-hold confirm button. A light overlay fills left→right over
 * `holdMs`; completing fires `onConfirm`, releasing early cancels. Conveys the
 * criticality of committing a trade without a modal. Keyboard (Enter/Space) and
 * reduced-motion users get an immediate confirm instead of the hold.
 */
export function HoldToConfirmButton({
  label,
  side,
  holdMs = 600,
  disabled,
  busy,
  busyLabel = 'Placing…',
  hint,
  onConfirm,
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduced = useRef(false)
  // Keep the latest onConfirm so the delayed fire never runs a stale closure.
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm

  useEffect(() => {
    reduced.current =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const blocked = Boolean(disabled) || Boolean(busy)

  const start = (e?: React.PointerEvent) => {
    if (blocked) return
    e?.preventDefault()
    if (reduced.current) {
      confirmRef.current()
      return
    }
    setHolding(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setHolding(false)
      confirmRef.current()
    }, holdMs)
  }

  const cancel = () => {
    if (!holding) return
    if (timer.current) clearTimeout(timer.current)
    setHolding(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (blocked) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      confirmRef.current()
    }
  }

  const token = side === 'buy' ? '--up' : '--down'
  const ink = side === 'buy' ? 'oklch(22% .05 150)' : 'oklch(22% .05 25)'

  return (
    <div>
      <div
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onKeyDown={onKeyDown}
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
        <span
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{
            width: holding || busy ? '100%' : '0%',
            background: 'color-mix(in oklch, white 26%, transparent)',
            transition: holding
              ? `width ${holdMs}ms linear`
              : 'width .16s ease',
          }}
        />
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
      </div>
      {hint ? (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
