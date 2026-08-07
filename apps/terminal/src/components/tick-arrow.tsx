// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { TickDirection } from '@/hooks/use-price-tick'

/**
 * The up/down caret beside a flashing price.
 *
 * The slot is always rendered, empty or not. Showing the caret only on a tick
 * would widen the price by its own width twice a second, and in a row that
 * also carries a mini price chart that shove lands on the chart — a list that
 * twitches sideways every time anything trades. Reserving the space costs
 * 12px and makes the flash a pure colour change.
 */
export function TickArrow({
  direction,
  className,
}: {
  direction: TickDirection
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex w-3 shrink-0 items-center justify-center',
        className,
      )}
    >
      {direction === 'up' && <ChevronUp className="size-3" />}
      {direction === 'down' && <ChevronDown className="size-3" />}
    </span>
  )
}
