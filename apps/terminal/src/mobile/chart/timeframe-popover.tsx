// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Timeframe chip + popover (design screen 2): pinned row, "more" grid,
 * long-press to pin. Owned by WS-D — replace this file's contents; the
 * default export (a self-contained chip that owns its own trigger, scrim and
 * popover) is the contract. Rendered in MobileChartSurface's timeframeSlot.
 *
 * This stand-in is the shell's original fallback chip: same inversion, same
 * scrim, a flat grid instead of pinned/more. The real source of truth for the
 * interval list is TIMEFRAME_OPTIONS in components/terminal/chart-toolbar.tsx
 * (module-private today — WS-D exports it).
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { MobileScrim } from '../primitives/mobile-scrim'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { track } from '@/lib/analytics-events'

const FALLBACK_TIMEFRAMES = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const

export default function TimeframePopoverChip() {
  const { t } = useTranslation()
  const { timeframe } = useChartConfig()
  const { setTimeframe } = useChartActions()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        aria-label={t('mobile.shell.timeframe')}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-[10px] pl-[11px] pr-[7px] font-mono text-[13.5px] font-semibold',
          open
            ? 'bg-foreground text-background'
            : 'text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]',
        )}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {timeframe}
        <ChevronDown
          className={cn(
            'size-4',
            open ? 'rotate-180 text-background' : 'text-muted-foreground',
          )}
        />
      </button>
      {open ? (
        <>
          <MobileScrim className="z-[45]" onDismiss={() => setOpen(false)} />
          <div
            className="pl-popover fixed right-4 z-[46] grid w-[238px] grid-cols-4 gap-1.5 p-[9px]"
            style={{ top: 'calc(var(--pl-chart-top) + 52px)' }}
          >
            {FALLBACK_TIMEFRAMES.map((value) => (
              <button
                className={cn(
                  'flex h-[38px] items-center justify-center rounded-[10px] font-mono text-[12.5px] font-semibold',
                  value === timeframe
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]',
                )}
                key={value}
                onClick={() => {
                  setTimeframe(value)
                  track('timeframe_changed', { timeframe: value })
                  setOpen(false)
                }}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
