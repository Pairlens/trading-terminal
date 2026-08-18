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
import { Suspense, memo, useCallback, useRef, useState } from 'react'
import { KeyRound, LockKeyhole, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { PriceReadout } from '../primitives/price-readout'
import {
  advanceChartSwitch,
  initialChartSwitchState,
} from '../lib/chart-switch'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { MobileChart } from './mobile-chart'
import { ChartSwitchIndicator } from './chart-switch-indicator'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import type { PredictionChartView } from './prediction-view-chip'
import { lazyChunk } from '@/lib/lazy-chunk'
import { useOptionalCandleData } from '@/lib/chart-terminal-context'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'

/**
 * The event header for a prediction pair. Lazy AND gated on the pair actually
 * being one, so a chart of BTC-USDT never downloads the event-browsing hooks:
 * the gate below is what makes the split worth having.
 */
const PredictionEventStrip = lazyChunk(() => import('./prediction-event-strip'))

/**
 * The probability chart, and the control that switches away from it. Both lazy
 * behind the same prediction gate as the strip: a chart of BTC-USDT never
 * downloads recharts or the event-browsing hooks.
 */
const MobileProbabilityChart = lazyChunk(
  () => import('./mobile-probability-chart'),
)
const PredictionViewChip = lazyChunk(() => import('./prediction-view-chip'))

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
  const { focusedPair, focusedVenue } = useMobileFocus()
  const credentialGate = useMarketCredentialGate(focusedVenue)
  // Directory pin first, venue asset class second — neither reads a stream.
  // It is the gate on the event strip's whole chunk, so a crypto chart never
  // pays for the event-browsing hooks.
  const isPrediction = useIsPredictionPair(focusedPair, focusedVenue)

  /**
   * Odds by default on a prediction, candles everywhere else.
   *
   * Persisted across contracts and sessions rather than reset per pair: a
   * trader who wants candles on event markets wants them on the next one too,
   * and a view that reverted under them on every navigation would read as the
   * switch not having worked.
   */
  const [predictionView, setPredictionView] =
    usePersistedState<PredictionChartView>(
      'mobile.predictions.chartView',
      'odds',
    )

  /**
   * The odds view needs an EVENT, and a cold link does not carry one.
   *
   * `usePredictionEventContext` finds the siblings by searching the venue for
   * the heading the directory pin recorded, so a contract reached by tapping a
   * card resolves and one reached by pasting a URL into a fresh browser does
   * not. The pair key alone still charts, which is exactly what the candle
   * view is: so when there is no field to draw, the chart falls back to it
   * rather than parking on an empty plot the user cannot act on.
   *
   * Keyed to the market so it re-tries on the next contract, and folded during
   * render like `switchRef` above so the fallback lands on the same frame the
   * chart reports it rather than one after.
   */
  const [eventless, setEventless] = useState<string | null>(null)
  const marketKey = `${focusedVenue}:${focusedPair}`
  const hasField = eventless !== marketKey
  const showProbability = isPrediction && predictionView === 'odds' && hasField

  const reportEventless = useCallback(
    (missing: boolean) => setEventless(missing ? marketKey : null),
    [marketKey],
  )

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
      credentialState={credentialGate.state}
      desktopOnly={candleData?.desktopOnly ?? false}
      hasSnapshot={hasSnapshot}
      noData={candleData?.noData ?? false}
      // Bare chart only. Under a docked panel the readout has compacted into
      // the band this would occupy, and the Trade ticket already carries the
      // question over its own fields.
      onEventless={reportEventless}
      onPredictionView={setPredictionView}
      // The switch is hidden, not disabled, when there is no field to draw:
      // a segmented control whose other half does nothing is worse than no
      // control, and here the fallback IS the only view available.
      predictionView={isPrediction && hasField ? predictionView : null}
      showEventStrip={isPrediction && props.band === 'full'}
      showProbability={showProbability}
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
  credentialState,
  desktopOnly,
  noData,
  hasSnapshot,
  onEventless,
  onPredictionView,
  predictionView,
  showEventStrip,
  showProbability,
  venueChanged,
}: MobileChartSurfaceProps & {
  credentialState: 'ok' | 'sealed' | 'missing'
  desktopOnly: boolean
  noData: boolean
  hasSnapshot: boolean
  onEventless: (missing: boolean) => void
  onPredictionView: (view: PredictionChartView) => void
  /** Null on anything that is not an event contract — no chip, no choice. */
  predictionView: PredictionChartView | null
  showEventStrip: boolean
  showProbability: boolean
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

  // Ahead of `noData` for the same reason as the desktop pane: with no key
  // nothing was ever subscribed, so "no chart data" would blame the venue.
  const credentialsBlocked = credentialState !== 'ok'
  // The candle-stream verdicts are the CANDLE chart's. The odds view draws
  // from `market-data:history` across the whole field and never subscribes, so
  // gating it on the stream hid a perfectly good probability chart behind "no
  // data for this pair here" on any contract quiet enough to have no candle in
  // the streamed interval. The credential and desktop-only gates still apply
  // to both: those block the venue, not the feed.
  const feedUnavailable = noData && !hasSnapshot && !showProbability
  const unavailable = credentialsBlocked || desktopOnly || feedUnavailable
  // Same test the desktop pane runs (`phase` in chart-pane.tsx): the buffer is
  // cleared the moment the request changes, so "no snapshot yet" IS "waiting".
  // It is bounded by the states above — a venue that never answers resolves to
  // `noData` and the empty state takes over from the indicator. The odds view
  // is exempt for the reason above: it has its own loading copy and would
  // otherwise sit dimmed behind a badge waiting on a stream it never reads.
  const switching = !unavailable && !hasSnapshot && !showProbability

  return (
    <div
      className="absolute inset-x-0 overflow-hidden"
      style={{
        top: 'var(--pl-chart-top)',
        bottom: 'var(--pl-tabbar-total)',
      }}
    >
      {credentialsBlocked ? (
        <ChartCredentialsRequired
          state={credentialState}
          venueLabel={venueLabel}
        />
      ) : unavailable ? (
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
            // The odds view runs to the bottom of the band: it has no drawing
            // toolbar to reserve for, and it spends those 50px on its spans.
            ...(showProbability ? { bottom: 0 } : CHART_FRAME),
          }}
        >
          {showProbability ? (
            // Fallback null rather than a spinner: the price readout and the
            // event strip are already painted over this box, and a spinner
            // under them would read as the whole chart failing.
            <Suspense fallback={null}>
              <MobileProbabilityChart onEventless={onEventless} />
            </Suspense>
          ) : (
            <MobileChart band={band} />
          )}
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
        {/* The corner carries one chip on most markets and two on an event
            contract. The interval picker is dropped in the odds view and only
            there: that view has its own spans and no candles to bucket, while
            the candle view is still a real chart that needs tuning. The view
            switch is always present, because a control you can only reach from
            the view you want to leave is a trap. */}
        {timeframeSlot || predictionView ? (
          <div
            className="pl-tf-chip pointer-events-auto flex shrink-0 items-start gap-1.5"
            // Faded to nothing at the expanded snap: the chip is what the
            // limit-line tag used to collide with up there.
            data-faded={expanded ? 'true' : undefined}
          >
            {timeframeSlot && !showProbability ? timeframeSlot : null}
            {predictionView ? (
              <Suspense fallback={null}>
                <PredictionViewChip
                  onChange={onPredictionView}
                  view={predictionView}
                />
              </Suspense>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* What the chart is ABOUT, when the chart is an event contract. Sits
          under the hero readout at a fixed offset (see the strip's own
          `STRIP_TOP_PX`) rather than displacing it: the readout cross-fades
          between two sizes on the sheet's live position, and a box that moved
          it would jump mid-drag. Fallback null — a spinner over a chart for a
          3KB chunk is worse than the strip arriving a frame late. */}
      {showEventStrip ? (
        <Suspense fallback={null}>
          <PredictionEventStrip />
        </Suspense>
      ) : null}

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
      {/* Suppressed in the odds view. The limit line converts price to pixels
          through the chart engine's own scale, and that engine is unmounted
          here — a level dragged to "68¢" would be pointing at nothing. The
          Trade ticket's numeric limit field is untouched, and candles are one
          tap away in the corner. */}
      {overlay && !showProbability ? (
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
      {/* Same reason as the overlay above: there is nothing to draw on. */}
      {footer && !showProbability ? (
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

/**
 * The venue has no public feed and we hold no usable key for it (Alpaca).
 *
 * Same split and the same copy as the desktop `PaneCredentialsRequired`, laid
 * out for 402px with 44px targets — markup, not the component, for the reason
 * `ChartUnavailable` above gives. Both buttons stay inside the chart band: the
 * whole point is that the answer is one tap from where the user is stuck, and
 * sending them to Settings to work out what happened is the state this
 * replaces.
 */
const ChartCredentialsRequired = memo(function ChartCredentialsRequired({
  state,
  venueLabel,
}: {
  state: 'sealed' | 'missing'
  venueLabel: string
}) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const { focusedVenue } = useMobileFocus()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const sealed = state === 'sealed'
  const Icon = sealed ? LockKeyhole : KeyRound

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <Icon className="size-8 text-muted-foreground/50" />
      <p className="text-[15px] font-semibold text-foreground">
        {t(
          sealed
            ? 'layout.paneCredentials.sealedTitle'
            : 'layout.paneCredentials.missingTitle',
          { venue: venueLabel },
        )}
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t(
          sealed
            ? 'layout.paneCredentials.sealedDescription'
            : 'layout.paneCredentials.missingDescription',
          { venue: venueLabel },
        )}
      </p>
      {sealed ? (
        <Button
          className="mt-2 h-11 rounded-xl px-5"
          onClick={() => setUnlockOpen(true)}
        >
          {t('security.vault.sealedBannerAction')}
        </Button>
      ) : (
        <Button
          className="mt-2 h-11 rounded-xl px-5"
          onClick={() => pushOverlay({ kind: 'connect', market: focusedVenue })}
        >
          {t('layout.paneCredentials.connectAction', { venue: venueLabel })}
        </Button>
      )}

      <VaultUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
    </div>
  )
})
