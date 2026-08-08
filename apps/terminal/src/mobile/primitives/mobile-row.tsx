// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo } from 'react'

import { cn } from '@pairlens/ui'
import type { ReactNode } from 'react'

export type MobileRowProps = {
  /** 32px asset avatar, 28px venue mark, or an icon. */
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** IN FOCUS · read-only · desktop-only. Sits beside the title. */
  badge?: ReactNode
  /** Tinted background — the focused pair, the current venue. */
  selected?: boolean
  disabled?: boolean
  onPress?: () => void
  className?: string
}

/**
 * The 44px list row every mobile list is built from: watchlist rows, settings
 * rows, pair-search results, venue rows. Built once so the tap target, the
 * hairline and the two-line grid never drift between them.
 *
 * Renders a `<button>` when pressable and a `<div>` otherwise, so a static row
 * does not land in the tab order.
 */
export const MobileRow = memo(function MobileRow({
  leading,
  title,
  subtitle,
  trailing,
  badge,
  selected = false,
  disabled = false,
  onPress,
  className,
}: MobileRowProps) {
  const content = (
    <>
      {leading ? (
        <span className="flex shrink-0 items-center">{leading}</span>
      ) : null}
      {/* `max-w-full` and not just `min-w-0`: the column is `items-start`, so
          its children size to content — a nowrap subtitle would grow past the
          row and drag the whole screen into horizontal scroll before
          `truncate` ever engaged. */}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex min-w-0 max-w-full items-center gap-1.5">
          <span className="min-w-0 truncate text-left text-[14.5px] font-semibold leading-tight text-foreground">
            {title}
          </span>
          {badge}
        </span>
        {subtitle ? (
          <span className="min-w-0 max-w-full truncate text-left text-[11px] font-normal leading-tight text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center">{trailing}</span>
      ) : null}
    </>
  )

  const shared = cn(
    'flex w-full items-center gap-[11px] px-4 py-2.5 text-left',
    'min-h-[44px] border-t border-t-[color:var(--pl-hairline)]',
    selected && 'bg-[color:var(--pl-wash)]',
    disabled && 'opacity-45',
    className,
  )

  if (!onPress) {
    return (
      <div
        aria-current={selected || undefined}
        aria-disabled={disabled || undefined}
        className={shared}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      aria-current={selected || undefined}
      className={cn(shared, 'active:bg-[color:var(--pl-wash-strong)]')}
      disabled={disabled}
      onClick={onPress}
      type="button"
    >
      {content}
    </button>
  )
})
