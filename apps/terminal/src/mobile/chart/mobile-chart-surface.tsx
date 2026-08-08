// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart band: scrim, price readout, the chart itself, and the gesture that
 * dismisses whatever is docked over it.
 *
 * Tap-to-dismiss is one gesture on every panel and is deliberately never
 * labelled. It is a capture layer rather than a click handler on the chart,
 * because a drag is a pan and a tap is a dismiss and only the pointer geometry
 * can tell them apart. It sits at z-10, BELOW the overlay slot at z-20, so the
 * Trade screen's draggable limit line stays draggable while a panel is open.
 *
 * The outer component subscribes to the candle stream (a sanctioned per-tick
 * read) and hands three booleans to a memoized inner, which is the same
 * isolation `ChartPane` uses: the tick reaches this function, not the tree.
 */
import { memo, useCallback, useRef } from 'react'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { MIN_SHEET_HEIGHT } from '../lib/mobile-geometry'
import { PriceReadout } from '../primitives/price-readout'
import { MobileChart } from './mobile-chart'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useOptionalCandleData } from '@/lib/chart-terminal-context'

export type MobileChartSurfaceProps = {
  /** 'full' when the chart owns the screen, 'compact' under a docked panel. */
  band: 'full' | 'compact'
  /**
   * The docked panel's chart-band height in px (a SHEET_BAND value). The chart
   * is sized to exactly the strip the sheet leaves visible — the design fills
   * whatever band it is given rather than letting the sheet cover the series.
   */
  bandHeight?: number
  /** .7 behind Watchlist / Discover / the drawing-tools sheet, 1 elsewhere. */
  opacity?: number
  /** Mounts the tap-to-dismiss capture layer. */
  dismissible: boolean
  onDismiss: () => void
  /** Right of the price on the same row — the timeframe chip. */
  timeframeSlot?: ReactNode
  /** Chart-space overlays at z-20 (the limit line). Above the tap layer. */
  overlay?: ReactNode
  /** Opens the venue picker from the desktop-only backstop. */
  onSwitchVenue: () => void
  /** Human venue name for the desktop-only copy. */
  venueLabel: string
  /** Docked directly above the tab bar — the drawing toolbar. */
  footer?: ReactNode
}

/**
 * The drawing toolbar's height (8px padding × 2 + 34px chips). A local
 * constant rather than an import from `./drawing-toolbar` — that module is
 * lazy-loaded and a static import of its exported constant would pull the
 * whole tool catalog into the shell chunk.
 */
const FOOTER_HEIGHT_PX = 50

/** A tap: under 10px of travel and under 400ms. Anything else is a pan. */
const TAP_SLOP_PX = 10
const TAP_MS = 400

export function MobileChartSurface(props: MobileChartSurfaceProps) {
  const candleData = useOptionalCandleData()
  return (
    <MobileChartSurfaceInner
      {...props}
      desktopOnly={candleData?.desktopOnly ?? false}
      hasSnapshot={candleData?.hasSnapshot ?? false}
      noData={candleData?.noData ?? false}
    />
  )
}

const MobileChartSurfaceInner = memo(function MobileChartSurfaceInner({
  band,
  bandHeight,
  opacity = 1,
  dismissible,
  onDismiss,
  timeframeSlot,
  overlay,
  onSwitchVenue,
  venueLabel,
  footer,
  desktopOnly,
  noData,
  hasSnapshot,
}: MobileChartSurfaceProps & {
  desktopOnly: boolean
  noData: boolean
  hasSnapshot: boolean
}) {
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }, [])

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const start = tapRef.current
      tapRef.current = null
      if (!start) return
      if (Date.now() - start.t > TAP_MS) return
      if (
        Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
        Math.abs(e.clientY - start.y) > TAP_SLOP_PX
      ) {
        return
      }
      onDismiss()
    },
    [onDismiss],
  )

  const unavailable = desktopOnly || (noData && !hasSnapshot)

  // Compact: the chart ends where the sheet begins — the same min() the sheet
  // top uses, so the two agree on short phones. Full: it ends above the
  // toolbar when one is docked.
  //
  // BOTH branches resolve to a `height`, and that is load-bearing rather than
  // tidy: the band eases between them, and a transition from a length to
  // `auto` (which is what dropping `height` and leaning on `bottom` gives)
  // does not animate at all. One property, two lengths, both directions.
  const fullHeight = `calc(100svh - var(--pl-chart-top) - var(--pl-tabbar-total)${
    footer ? ` - ${FOOTER_HEIGHT_PX}px` : ''
  })`
  const chartFrame =
    band === 'compact' && bandHeight != null
      ? {
          height: `min(${bandHeight}px, calc(100svh - ${MIN_SHEET_HEIGHT}px - var(--pl-chart-top)))`,
        }
      : { height: fullHeight }

  return (
    <div
      className="absolute inset-x-0 overflow-hidden"
      style={{
        top: 'var(--pl-chart-top)',
        bottom: 'var(--pl-tabbar-total)',
      }}
    >
      {unavailable ? (
        <ChartUnavailable
          desktopOnly={desktopOnly}
          onSwitchVenue={onSwitchVenue}
          venueLabel={venueLabel}
        />
      ) : (
        // `isolate` keeps the engine's internal z-indexed canvases (up to
        // z-30) inside their own stacking context, so the tap layer at z-10
        // actually sits above the chart rather than under its UI canvas.
        //
        // `pl-chart-band` eases the height so the chart follows the sheet
        // instead of snapping a frame ahead of it. That does mean the engine's
        // ResizeObserver fires through the transition rather than once — see
        // the measurement in the polish notes; a WebGL viewport resize is a
        // uniform update and a redraw of a chart that is already redrawing
        // every tick, and the measured frame budget held.
        <div
          className="pl-chart-band absolute inset-x-0 top-0 isolate bottom-0"
          style={{ opacity, ...chartFrame }}
        >
          <MobileChart band={band} />
        </div>
      )}

      <div aria-hidden className="pl-chart-scrim" />

      {/* Price + timeframe chip, 8px under the chart top. */}
      <div className="pointer-events-none absolute inset-x-4 top-2 z-20 flex items-start justify-between gap-3">
        <PriceReadout size={band === 'full' ? 'hero' : 'compact'} />
        {timeframeSlot ? (
          <div className="pointer-events-auto shrink-0">{timeframeSlot}</div>
        ) : null}
      </div>

      {/* Tap-to-dismiss. Mounted only while something is docked over the
          chart. `pointer-events-auto` is load-bearing: vaul nulls the body's
          pointer events while a sheet is open and children inherit that
          unless they opt back in. */}
      {dismissible ? (
        <div
          aria-hidden
          className="pointer-events-auto absolute inset-0 z-10"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        />
      ) : null}

      {/* Chart-space overlays. Non-interactive as a layer — the limit line's
          grab strip opts back in itself — so it never eats the dismiss tap.

          It carries the SAME `chartFrame` as the chart, not the band's
          `inset-0`: overlays in this slot measure themselves to convert price
          to pixels, and a slot taller than the chart lets the limit line be
          dragged into a price several screens below the plot. */}
      {overlay ? (
        <div
          className="pl-chart-band pointer-events-none absolute inset-x-0 bottom-0 top-0 z-20"
          style={chartFrame}
        >
          {overlay}
        </div>
      ) : null}

      {footer ? (
        <div className="absolute inset-x-0 bottom-0 z-30">{footer}</div>
      ) : null}
    </div>
  )
})

/**
 * The backstop for a venue this build cannot reach, laid out for 402px.
 *
 * It reuses `DesktopOnlyState`'s COPY and not its markup — that component is a
 * centred desktop empty state with a venue grid, and the phone's answer is one
 * tap to the venue picker.
 */
const ChartUnavailable = memo(function ChartUnavailable({
  desktopOnly,
  onSwitchVenue,
  venueLabel,
}: {
  desktopOnly: boolean
  onSwitchVenue: () => void
  venueLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <Monitor className="size-8 text-muted-foreground/50" />
      <p className="text-[15px] font-semibold text-foreground">
        {desktopOnly
          ? t('desktopCta.wall.title', { venue: venueLabel })
          : t('mobile.shell.noChartData')}
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {desktopOnly
          ? t('desktopCta.wall.description')
          : t('mobile.shell.noChartDataHint')}
      </p>
      <Button className="mt-2 h-11 rounded-xl px-5" onClick={onSwitchVenue}>
        {t('mobile.shell.switchVenue')}
      </Button>
    </div>
  )
})
