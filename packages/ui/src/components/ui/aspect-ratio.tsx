// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { cn } from '../../lib/utils'

function AspectRatio({
  ratio,
  className,
  style,
  ...props
}: React.ComponentProps<'div'> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      className={cn('relative aspect-(--ratio)', className)}
      style={
        {
          '--ratio': ratio,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { AspectRatio }
