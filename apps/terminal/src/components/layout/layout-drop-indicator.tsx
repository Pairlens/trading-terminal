// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { cn } from '@pairlens/ui/lib/utils'

type LayoutDropIndicatorProps = {
  orientation: 'horizontal' | 'vertical'
  active: boolean
}

export function LayoutDropIndicator({
  orientation,
  active,
}: LayoutDropIndicatorProps) {
  return (
    <div
      className={cn(
        'pointer-events-none shrink-0 rounded-full bg-primary transition-all',
        orientation === 'horizontal' ? 'h-0.5 w-full' : 'h-full w-0.5',
        active ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
