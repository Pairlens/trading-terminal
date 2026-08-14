// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The `1D` chip and its popover — design screen 2.
 *
 * Single-purpose by design: intervals, and nothing else. Chart type, crosshair
 * mode and the price scale all live on the desktop toolbar and none of them
 * belong under the one control a thumb reaches for mid-trade.
 *
 * The interval list is `TIMEFRAME_OPTIONS` from the desktop chart toolbar
 * (exported for this file) rather than a second copy: a build that ships a new
 * interval must not ship it to one surface only. The stored value stays
 * lowercase (`1d`); `short` is the label the design draws (`1D`).
 *
 * Long-press promotes a "more" interval into the pinned row. It is a pointer
 * timer rather than a context-menu hook because the gesture has to work
 * identically under touch and a desktop-emulated pointer, and because the
 * cancel condition (10px of travel) is what tells a press apart from the start
 * of a scroll.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { MobileScrim } from '../primitives/mobile-scrim'
import { PRESS } from '../primitives/press'
import { usePinnedTimeframes } from './use-pinned-timeframes'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import type { TimeframeOption } from '@/components/terminal/chart-toolbar'
import { haptic } from '@/lib/haptics'
import { TIMEFRAME_OPTIONS } from '@/components/terminal/chart-toolbar'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { track } from '@/lib/analytics-events'

/** Long enough not to fire on a tap, short enough not to feel stuck. */
const LONG_PRESS_MS = 500
/** Past this much travel the finger is scrolling, not pressing. */
const PRESS_SLOP_PX = 10

/**
 * A 38px cell in a 6px grid gap: the ±3px expansion lands the hit area at
 * exactly 44px without overlapping its neighbour's, which `.pl-hit-44`'s fixed
 * 8px inset would do (and the last sibling would then win the overlap).
 */
const CELL =
  'relative flex h-[38px] items-center justify-center rounded-[10px] font-mono text-[12.5px] font-semibold select-none [-webkit-touch-callout:none] after:absolute after:inset-[-3px] after:content-[""]'

export default memo(function TimeframePopoverChip() {
  const { t } = useTranslation()
  const { timeframe } = useChartConfig()
  const { setTimeframe } = useChartActions()
  const { pinned, touch, promote } = usePinnedTimeframes()
  const [open, setOpen] = useState(false)

  const byValue = useMemo(() => {
    const map = new Map<string, TimeframeOption>()
    for (const option of TIMEFRAME_OPTIONS) map.set(option.value, option)
    return map
  }, [])

  // Canonical order for display; recency order stays in storage. A row that
  // reshuffled after every pick would move the target under the thumb.
  const pinnedOptions = useMemo(
    () => TIMEFRAME_OPTIONS.filter((option) => pinned.includes(option.value)),
    [pinned],
  )
  const moreOptions = useMemo(
    () => TIMEFRAME_OPTIONS.filter((option) => !pinned.includes(option.value)),
    [pinned],
  )

  const select = useCallback(
    (value: string) => {
      haptic('selection')
      setTimeframe(value)
      touch(value)
      track('timeframe_changed', { timeframe: value })
      setOpen(false)
    },
    [setTimeframe, touch],
  )

  /**
   * Promotion moves the cell out of the "more" grid the instant it fires, and
   * the grid reflows under a finger that is still down — so the click that
   * arrives on release lands on whichever interval slid into that spot and
   * switches the chart to it. Verified in a real long-press: pinning `4h` put
   * the chart on `3D`.
   *
   * The promoted cell unmounts, so its own click guard never sees that click.
   * One capture-phase listener on the document swallows exactly one click, and
   * expires on its own if the release never produces one.
   */
  const promoteAndSwallowClick = useCallback(
    (value: string) => {
      promote(value, timeframe)
      if (typeof document === 'undefined') return
      const swallow = (event: MouseEvent) => {
        event.stopPropagation()
        event.preventDefault()
        cleanup()
      }
      const cleanup = () => {
        document.removeEventListener('click', swallow, true)
        clearTimeout(timer)
      }
      const timer = setTimeout(cleanup, 900)
      document.addEventListener('click', swallow, true)
    },
    [promote, timeframe],
  )

  const label = byValue.get(timeframe)?.short ?? timeframe

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('chart.toolbar.timeframe')}
        className={cn(
          'pl-press flex h-9 items-center gap-1 rounded-[10px] pl-[11px] pr-[7px] font-mono text-[13.5px] font-semibold',
          // At rest the chip is chrome floating on the bare plot, so it takes
          // its ink and its ring from the CHART's palette, not the UI's — a
          // theme is free to give the chart a background the UI never wears,
          // and `text-foreground` on it can land dark-on-dark. Open, it is a
          // popover trigger over a scrim and goes back to the UI tokens.
          open
            ? 'bg-foreground text-background'
            : 'pl-ring-chart text-[color:var(--pl-chart-fg)]',
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
        {...PRESS}
      >
        {label}
        <ChevronDown
          className={cn(
            'size-4',
            open
              ? 'rotate-180 text-background'
              : 'text-[color:var(--pl-chart-fg)] opacity-65',
          )}
        />
      </button>

      {open ? (
        // Portaled to the body, not rendered in place. The chip lives in the
        // chart surface's price row, which carries `z-20` and therefore opens a
        // stacking context: a z-46 popover nested inside it still paints
        // *below* the surface's own z-20 overlay slot and z-30 toolbar, and
        // loses every tap to them. Verified — the first build of this file was
        // visible and completely untappable.
        <Portal>
          <MobileScrim className="z-[45]" onDismiss={() => setOpen(false)} />
          <div
            className="pl-popover fixed right-4 z-[46] w-[238px] p-[9px]"
            role="dialog"
            style={{ top: 'calc(var(--pl-chart-top) + 52px)' }}
          >
            <p className="px-1 pb-2 pt-[3px] text-[9.5px] font-semibold uppercase tracking-[.09em] text-muted-foreground">
              {t('mobile.chart.pinned')}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {pinnedOptions.map((option) => (
                <button
                  className={cn(
                    'pl-press',
                    CELL,
                    option.value === timeframe
                      ? 'bg-foreground text-background'
                      : 'bg-[color:var(--pl-wash-strong)] text-foreground',
                  )}
                  key={option.value}
                  onClick={() => select(option.value)}
                  type="button"
                  {...PRESS}
                >
                  {option.short}
                </button>
              ))}
            </div>

            <p className="px-1 pb-2 pt-[14px] text-[9.5px] font-semibold uppercase tracking-[.09em] text-muted-foreground">
              {t('mobile.chart.moreLongPress')}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {moreOptions.map((option) => (
                <MoreCell
                  key={option.value}
                  onPromote={() => promoteAndSwallowClick(option.value)}
                  onSelect={() => select(option.value)}
                  option={option}
                  selected={option.value === timeframe}
                />
              ))}
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  )
})

/** Escapes the chart surface's stacking context. See the note at the call site. */
function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

/**
 * A "more" interval: tap selects, long-press pins.
 *
 * The press timer lives per cell so a finger sliding from one cell to the next
 * cancels the first press rather than promoting whatever it started on.
 */
const MoreCell = memo(function MoreCell({
  option,
  selected,
  onSelect,
  onPromote,
}: {
  option: TimeframeOption
  selected: boolean
  onSelect: () => void
  onPromote: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  // A fired long-press must swallow the click that follows it, or promoting an
  // interval would also switch the chart to it.
  const firedRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    originRef.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      firedRef.current = false
      originRef.current = { x: event.clientX, y: event.clientY }
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        timerRef.current = null
        onPromote()
        // The long press has fired without the finger moving, so the tick is
        // the only thing that can say so. See lib/haptics.ts for what backs it
        // on each platform.
        haptic('impact')
      }, LONG_PRESS_MS)
    },
    [onPromote],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const origin = originRef.current
      if (!origin) return
      if (
        Math.abs(event.clientX - origin.x) > PRESS_SLOP_PX ||
        Math.abs(event.clientY - origin.y) > PRESS_SLOP_PX
      ) {
        cancel()
      }
    },
    [cancel],
  )

  return (
    <button
      className={cn(
        'pl-press',
        CELL,
        selected
          ? 'bg-foreground text-background'
          : 'pl-ring text-muted-foreground',
      )}
      onClick={() => {
        if (firedRef.current) {
          firedRef.current = false
          return
        }
        onSelect()
      }}
      onContextMenu={(event) => event.preventDefault()}
      // PRESS is paint and these are the long-press promote timer: both must
      // run. Spreading `{...PRESS}` here would replace the promote handlers.
      onPointerCancel={(event) => {
        PRESS.onPointerCancel(event)
        cancel()
      }}
      onPointerDown={(event) => {
        PRESS.onPointerDown(event)
        handlePointerDown(event)
      }}
      onPointerLeave={(event) => {
        PRESS.onPointerLeave(event)
        cancel()
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        PRESS.onPointerUp(event)
        cancel()
      }}
      type="button"
    >
      {option.short}
    </button>
  )
})
