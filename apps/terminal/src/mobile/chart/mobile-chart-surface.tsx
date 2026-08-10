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
 * read) and hands a handful of booleans to a memoized inner, which is the same
 * isolation `ChartPane` uses: the tick reaches this function, not the tree.
 * Those booleans are also what says whether the market on screen has arrived
 * yet — see `ChartSwitchIndicator` for the wait it draws.
 */
import { memo, useCallback, useRef } from 'react'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { PriceReadout } from '../primitives/price-readout'
import {
  advanceChartSwitch,
  initialChartSwitchState,
} from '../lib/chart-switch'
import { useMobileFocus } from '../mobile-focus-context'
import { MobileChart } from './mobile-chart'
import { ChartSwitchIndicator } from './chart-switch-indicator'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useOptionalCandleData } from '@/lib/chart-terminal-context'

export type MobileChartSurfaceProps = {
  /**
   * 'full' when the chart owns the screen, 'compact' when a panel is docked
   * over it. It is a STATE, not a size: the chart's box is the same in both
   * (see `CHART_FRAME`). It gates the crosshair placement layer, the price
   * readout's scale and the scrim's height.
   */
  band: 'full' | 'compact'
  /** True while the docked sheet sits at its expanded snap. */
  expanded?: boolean
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
 *
 * It is reserved ALWAYS, not only while the toolbar is docked: the chart's box
 * has to be identical in all five views (see `CHART_FRAME`), and the strip is
 * covered by the sheet in the four panel views anyway.
 */
const FOOTER_HEIGHT_PX = 50

/**
 * The chart's box — one constant, every view.
 *
 * The compact band used to size the chart to the sliver of screen a docked
 * sheet left visible, which meant every panel open and close resized the WebGL
 * viewport and re-laid-out the series. It now fills the band from the chart top
 * to the toolbar reserve and panels simply COVER it: the same chart, the same
 * bar spacing, the same price axis, running behind whatever is docked.
 *
 * The limit-line overlay carries the identical style because it converts price
 * to pixels against its own box — a slot taller than the plot would let the
 * line be dragged to a price the chart never shows.
 */
const CHART_FRAME = { bottom: `${FOOTER_HEIGHT_PX}px` } as const

/**
 * How far the chart falls back while the next market loads.
 *
 * Softer than the desktop's 0.45 because there is less to dim: the phone's
 * plot is already empty by then, so this only takes the axis and the grid
 * down, and the badge — not the dim — is what carries the message.
 */
const SWITCH_DIM = 0.55

/** A tap: under 10px of travel and under 400ms. Anything else is a pan. */
const TAP_SLOP_PX = 10
const TAP_MS = 400

export function MobileChartSurface(props: MobileChartSurfaceProps) {
  const candleData = useOptionalCandleData()
  const hasSnapshot = candleData?.hasSnapshot ?? false

  // `useMobileFocus` and not `useChartConfig`: the venue is the only field of
  // the chart config this needs, and the focus context changes on a pair or
  // venue switch where the config object changes on every tool arm, timeframe
  // and drawing edit. Same value either way (see mobile-focus-context.tsx).
  const { focusedVenue } = useMobileFocus()

  // The venue-change bit has to be remembered by something that outlives the
  // indicator: the switch and the cleared snapshot happen in the SAME render,
  // so a component mounted afterwards would compare a venue against itself and
  // always conclude nothing changed. This function is mounted for the life of
  // the session, so the ref is safe here and nowhere below it. The write is a
  // pure fold (see `advanceChartSwitch`) — idempotent under StrictMode.
  const switchRef = useRef(initialChartSwitchState(focusedVenue))
  switchRef.current = advanceChartSwitch(
    switchRef.current,
    focusedVenue,
    hasSnapshot,
  )

  return (
    <MobileChartSurfaceInner
      {...props}
      desktopOnly={candleData?.desktopOnly ?? false}
      hasSnapshot={hasSnapshot}
      noData={candleData?.noData ?? false}
      venueChanged={switchRef.current.venueChanged}
    />
  )
}

const MobileChartSurfaceInner = memo(function MobileChartSurfaceInner({
  band,
  expanded = false,
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
  venueChanged,
}: MobileChartSurfaceProps & {
  desktopOnly: boolean
  noData: boolean
  hasSnapshot: boolean
  venueChanged: boolean
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
  // Same test the desktop pane runs (`phase` in chart-pane.tsx): the buffer is
  // cleared the moment the request changes, so "no snapshot yet" IS "waiting".
  // It is bounded by the states above — a venue that never answers resolves to
  // `noData` and the empty state takes over from the indicator.
  const switching = !unavailable && !hasSnapshot

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
        // `pl-chart-band` now carries only the opacity fade and the
        // touch-action pin — the height transition it used to run died with
        // the resize it was smoothing over.
        <div
          className="pl-chart-band absolute inset-x-0 top-0 isolate"
          // Dimmed while the next market loads, on the band's own 200ms
          // opacity transition — the desktop's dim-then-crossfade, multiplied
          // into whatever dim the docked panel already asked for rather than
          // overriding it.
          style={{
            opacity: switching ? opacity * SWITCH_DIM : opacity,
            ...CHART_FRAME,
          }}
        >
          <MobileChart band={band} />
        </div>
      )}

      {switching ? (
        <ChartSwitchIndicator
          venueChanged={venueChanged}
          venueLabel={venueLabel}
        />
      ) : null}

      {/* Two gradients with two jobs. The seam is a constant, tight fade that
          hides the tonal step where the top chrome meets the chart canvas; the
          scrim is the price readout's backstop and scales and fades with the
          sheet, exactly like the readout it protects. */}
      <div aria-hidden className="pl-chart-scrim" />
      <div aria-hidden className="pl-chart-seam" />

      {/* Price + timeframe chip, 8px under the chart top. Both track the
          sheet's live position through `--pl-sheet-dock` / `--pl-sheet-expand`
          rather than through props — see mobile-sheet.tsx. */}
      <div className="pointer-events-none absolute inset-x-4 top-2 z-20 flex items-start justify-between gap-3">
        <PriceReadout />
        {timeframeSlot ? (
          <div
            className="pl-tf-chip pointer-events-auto shrink-0"
            // Faded to nothing at the expanded snap: the chip is what the
            // limit-line tag used to collide with up there.
            data-faded={expanded ? 'true' : undefined}
          >
            {timeframeSlot}
          </div>
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

          It carries the SAME `CHART_FRAME` as the chart, not the band's
          `inset-0`: overlays in this slot measure themselves to convert price
          to pixels, and a slot taller than the chart lets the limit line be
          dragged into a price several screens below the plot. */}
      {overlay ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20"
          style={CHART_FRAME}
        >
          {overlay}
        </div>
      ) : null}

      {/* The toolbar is mounted in every view and REVEALED by the sheet
          leaving, rather than mounted when it has already left. Mounting it at
          dismiss time is what made it pop: a drag-dismiss uncovers this strip
          long before the gesture ends, so the toolbar used to appear into
          already-visible empty space. Now it rides `--pl-sheet-dock`, which is
          the sheet's own position — the entrance cannot desynchronise from the
          exit because it IS the exit. */}
      {footer ? (
        // `inert` while docked: the strip is hidden by opacity/transform, and
        // an invisible toolbar must not keep nine buttons in the tab order and
        // the accessibility tree under every panel.
        <div
          className="pl-chart-footer absolute inset-x-0 bottom-0 z-30"
          data-docked={dismissible ? 'true' : undefined}
          inert={dismissible || undefined}
        >
          {footer}
        </div>
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
