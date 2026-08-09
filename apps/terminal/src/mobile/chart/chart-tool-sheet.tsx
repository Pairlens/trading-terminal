// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart toolbar's sheet — one frame, two panels.
 *
 * The drawing tools and the indicators are two doors on the same bar, and they
 * open into the SAME `MobileSheet`. That is not tidiness: a snap-mode sheet
 * owns the `--pl-sheet-dock` channel from a rAF while it is on screen, and a
 * second one mounted through the swap would have the outgoing sheet's exit
 * loop walking the channel back to zero underneath the incoming one — the
 * drawing toolbar would slide back in under a fully docked panel. One sheet
 * changing its mind is the same answer the shell gives its four tabs, and it
 * is why the swap sequencing below is `planPanelSwap`, the shell's own rule.
 *
 * The search field lives in the sheet's non-scrolling header rather than in
 * the list: the header survives a scroll and a drag, and a sticky row inside
 * the scroll region would have to know the height of every section header
 * stacked under it.
 */
import { Suspense, memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MobileSheet } from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import { SHEET_BAND, sheetTop } from '../lib/mobile-geometry'
import { planPanelSwap } from '../lib/panel-swap'
import { lazyChunk } from '@/lib/lazy-chunk'

const DrawingToolsPanel = lazyChunk(() => import('./drawing-tools-sheet'))
const IndicatorsPanel = lazyChunk(() => import('./indicators-sheet'))

export type ChartToolSheetView = 'tools' | 'indicators'

export type ChartToolSheetProps = {
  /** Which panel is requested; null closes the sheet. */
  view: ChartToolSheetView | null
  onOpenChange: (open: boolean) => void
  /** Pushes a picked drawing tool into the toolbar's LRU slots. */
  onPickTool: (key: string) => void
}

/**
 * What the sheet is actually SHOWING, which lags what was requested.
 *
 * Same three cases the shell sequences: adopt immediately into an empty sheet,
 * fade the outgoing panel out before adopting the next, and hold the current
 * one until a closing sheet has finished leaving (a sheet that empties itself
 * mid-exit reads as a page navigation).
 */
function useToolPanelSwap(requested: ChartToolSheetView | null): {
  shown: ChartToolSheetView | null
  leaving: boolean
} {
  const [shown, setShown] = useState<ChartToolSheetView | null>(requested)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const command = planPanelSwap(shown, requested)
    if (command.kind === 'none') return
    if (command.kind === 'show') {
      setShown(command.panel)
      setLeaving(false)
      return
    }
    if (command.kind === 'fadeThenShow') {
      setLeaving(true)
      const timer = setTimeout(() => {
        setShown(command.panel)
        setLeaving(false)
      }, command.delay)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setShown(null), command.delay)
    return () => clearTimeout(timer)
  }, [requested, shown])

  return { shown, leaving }
}

export default memo(function ChartToolSheet({
  view,
  onOpenChange,
  onPickTool,
}: ChartToolSheetProps) {
  const { t } = useTranslation()
  const { shown, leaving } = useToolPanelSwap(view)
  const [query, setQuery] = useState('')

  const open = view !== null

  // The query belongs to a visit, not to the sheet: a search left behind would
  // greet the next open with a filtered list and no obvious reason why. Keyed
  // on `view`, which covers both a close (null) and a swap to the other panel.
  useEffect(() => {
    setQuery('')
  }, [view])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const title =
    shown === 'indicators'
      ? t('chart.toolbar.indicators')
      : t('mobile.chart.drawingTools')

  // Named per panel and deliberately EQUAL: the two are one sheet, so a band
  // that differed would resize it mid-swap. The constants are separate so a
  // future split has somewhere to diverge.
  const band =
    shown === 'indicators' ? SHEET_BAND.indicators : SHEET_BAND.drawingTools

  return (
    <>
      <ChartDim band={band} open={open} />
      <MobileSheet
        band={band}
        header={
          <>
            <div className="flex items-center justify-between px-4 pb-2 pt-1">
              <p className="text-[17px] font-semibold text-foreground">
                {title}
              </p>
              <button
                aria-label={t('mobile.shell.dismiss')}
                className="pl-hit-44 pl-press-soft -mr-1 flex size-9 items-center justify-center rounded-full text-muted-foreground"
                onClick={close}
                type="button"
                {...PRESS}
              >
                <X className="size-[18px]" />
              </button>
            </div>
            {shown === 'indicators' ? (
              <div className="px-4 pb-2">
                {/* 16px, like every focusable input on this surface: iOS zooms
                    the whole page on focus for anything smaller. */}
                <label className="pl-field flex h-10 items-center gap-2 rounded-xl px-3">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    aria-label={t('indicators.searchPlaceholder')}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
                    enterKeyHint="search"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('indicators.searchPlaceholder')}
                    type="search"
                    value={query}
                  />
                </label>
              </div>
            ) : null}
          </>
        }
        label={title}
        onOpenChange={onOpenChange}
        open={open}
        swapping={leaving}
      >
        <Suspense fallback={null}>
          {shown === 'indicators' ? (
            <IndicatorsPanel query={query} />
          ) : shown === 'tools' ? (
            <DrawingToolsPanel onClose={close} onPick={onPickTool} />
          ) : null}
        </Suspense>
      </MobileSheet>
    </>
  )
})

/**
 * The chart dims to .7 behind this sheet (design screen 3) — the same
 * treatment the Watchlist and Discover panels get from the shell's panel
 * table, which this sheet is not part of.
 *
 * Portaled to the body because the toolbar renders inside the chart band's
 * `z-30` footer, and a stacking context cannot lift a child above its own
 * z-index. Bounded to the chart band so the context bar above it stays sharp,
 * and `pointer-events-none` so it never eats a gesture.
 */
function ChartDim({ band, open }: { band: number; open: boolean }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-[39] bg-background/30"
      style={{
        top: 'var(--pl-chart-top)',
        height: `calc(${sheetTop(band)} - var(--pl-chart-top))`,
      }}
    />,
    document.body,
  )
}
