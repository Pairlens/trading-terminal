// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bottom-sheet engine every mobile panel docks in.
 *
 * vaul is composed DIRECTLY rather than through
 * `@pairlens/ui/components/ui/drawer`. That wrapper is a modal dialog drawer:
 * it always renders an overlay, pins `max-h-[80vh]`, injects its own grab
 * handle and carries a wall of `data-[vaul-drawer-direction]` classes. The
 * Focus sheet is non-modal, fixed-top, and must leave the chart both visible
 * and tappable behind it. Sharing the engine while not sharing the chrome is
 * the right level of reuse; overriding the wrapper would be more code than the
 * composition. The wrapper is left untouched for future modal drawers.
 *
 * `modal={false}` is load-bearing. `modal` traps focus and blocks pointer
 * events on everything behind, which kills both the tap-the-chart gesture and
 * the draggable limit line.
 *
 * ## Two geometries, one component
 *
 * A panel sheet (`band` is a number) runs on vaul **snap points**: two heights,
 * the panel's designed default and one expanded snap under the price readout,
 * with a 1:1 drag between them. In that mode the element is `top: 0` and sized
 * for the LARGEST snap, and vaul translates it — that is vaul's model and it is
 * why the sheet moves on the compositor instead of relaying out a list of rows
 * every frame. What that costs is that the bottom `expanded - default` px of
 * content sit below the fold at the default snap, which the scroll region pays
 * back as `padding-bottom`: a percentage height inside it (the co-pilot's
 * `h-full` column) then resolves to the VISIBLE slice, so a composer pinned to
 * the bottom of the panel stays pinned to the bottom of the screen.
 *
 * A full-height sheet (`band === 'full'`, the pair and venue pickers) has
 * nowhere to expand to and keeps the original top-anchored geometry verbatim.
 */
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Drawer } from 'vaul'

import { cn } from '@pairlens/ui'
import {
  parseTranslateY,
  resolveSheetSnaps,
  sheetTop,
  shouldDismissSheet,
} from '../lib/mobile-geometry'
import type {
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'

/**
 * vaul nulls `document.body.style.pointerEvents` while a sheet is present even
 * with `modal={false}` (measured, vaul 1.1) — which would kill the
 * tap-the-chart dismiss gesture and every context-bar control. Watch the body
 * style while open and undo exactly that write. Setting '' when the value is
 * 'none' cannot loop: the follow-up mutation no longer matches the guard.
 */
function useBodyPointerEventsGuard(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const clear = () => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = ''
      }
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    })
    return () => {
      observer.disconnect()
      clear()
    }
  }, [open])
}

type ShellMetrics = { chartTop: number; viewport: number }

/**
 * The two numbers the snap geometry needs in px: the resolved `--pl-chart-top`
 * and the viewport height vaul itself measures.
 *
 * `--pl-chart-top` folds in `env(safe-area-inset-top)`, which only the browser
 * can resolve, so it is measured off a zero-width probe element rather than
 * guessed — `getComputedStyle` hands back a custom property's unresolved token
 * list, not a length. The probe's own `ResizeObserver` catches a safe-area or
 * font-size change without a polling loop; the window listener catches the
 * URL-bar collapse, which is the one that has to stay in lockstep with vaul
 * (it reads `window.innerHeight`, never `svh`).
 */
function useShellMetrics(
  probeRef: RefObject<HTMLDivElement | null>,
): ShellMetrics {
  const [metrics, setMetrics] = useState<ShellMetrics>(() => ({
    chartTop: 0,
    viewport: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))

  useLayoutEffect(() => {
    const probe = probeRef.current
    const measure = () => {
      const chartTop = probe
        ? Math.round(probe.getBoundingClientRect().height)
        : 0
      const viewport = window.innerHeight
      setMetrics((prev) =>
        prev.chartTop === chartTop && prev.viewport === viewport
          ? prev
          : { chartTop, viewport },
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const observer = new ResizeObserver(measure)
    if (probe) observer.observe(probe)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      observer.disconnect()
    }
  }, [probeRef])

  return metrics
}

/**
 * The sheet's scrolling element, for panels that virtualize their list.
 *
 * A context rather than a prop because the sheet builds the element itself and
 * the panel is a `children` several layers down; the value is a ref object, so
 * publishing it costs no render anywhere. Null outside a `MobileSheet` — a
 * panel must treat that as "not virtualizable yet" rather than assuming the
 * window scrolls, because on this surface nothing does.
 */
const SheetScrollContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null)

export function useSheetScrollRef(): RefObject<HTMLDivElement | null> | null {
  return useContext(SheetScrollContext)
}

/** vaul reads this off the pointer target to decide drag vs scroll. */
const NO_DRAG_ATTR = 'data-vaul-no-drag'

export type MobileSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chart-band height below the context bar; use a SHEET_BAND constant. */
  band: number | 'full'
  /** 'default' = rgba(20,19,17,.97). 'copilot' = #131217 + magic hairline. */
  variant?: 'default' | 'copilot'
  /** Grab handle 40×4. Default true. */
  handle?: boolean
  /** Accessible name. REQUIRED — the Trade sheet has no visible title. */
  label: string
  /** Non-scrolling region under the handle (search field, header row). */
  header?: ReactNode
  /**
   * True while the panel inside is on its way out and the next one has not
   * arrived. Fades the scroll region — the sheet, its handle and its
   * background are untouched, which is the whole point: one sheet changing
   * its mind, not four sheets taking turns.
   */
  swapping?: boolean
  /**
   * Fires whenever the active snap changes, including the reset to the default
   * on a tab switch or a close. The sheet owns that state; a parent that needs
   * it for something else (the chart's scrim and price readout) mirrors it.
   */
  onExpandedChange?: (expanded: boolean) => void
  /** Scrolls; gets overscroll containment and safe-bottom padding. */
  children: ReactNode
  className?: string
}

export const MobileSheet = memo(function MobileSheet({
  open,
  onOpenChange,
  band,
  variant = 'default',
  handle = true,
  label,
  header,
  swapping = false,
  onExpandedChange,
  children,
  className,
}: MobileSheetProps) {
  useBodyPointerEventsGuard(open)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const probeRef = useRef<HTMLDivElement | null>(null)
  const { chartTop, viewport } = useShellMetrics(probeRef)

  const snaps = useMemo(
    () =>
      resolveSheetSnaps(
        typeof band === 'number' ? band : 0,
        chartTop,
        viewport,
      ),
    [band, chartTop, viewport],
  )
  // Memoized because vaul re-runs its snap effect whenever this array's
  // IDENTITY changes, and that effect re-stamps the "just arrived, ignore
  // drags for 500ms" timer at the top snap — a fresh array every render would
  // make the expanded sheet permanently undraggable.
  const snapPoints = useMemo(
    () =>
      band === 'full'
        ? undefined
        : [`${snaps.defaultHeight}px`, `${snaps.expandedHeight}px`],
    [band, snaps],
  )

  const [expanded, setExpanded] = useState(false)
  const applyExpanded = useCallback(
    (next: boolean) => {
      setExpanded(next)
      onExpandedChange?.(next)
    },
    [onExpandedChange],
  )

  // A new panel arrives at ITS default height, and a closed sheet is never
  // remembered as expanded. Both are one rule: the snap belongs to the panel
  // currently on screen, not to the sheet.
  useEffect(() => {
    applyExpanded(false)
  }, [band, open, applyExpanded])

  const activeSnapPoint = snapPoints ? snapPoints[expanded ? 1 : 0] : undefined
  const handleSnapChange = useCallback(
    (snapPoint: number | string | null) => {
      if (!snapPoints) return
      applyExpanded(snapPoint === snapPoints[1])
    },
    [snapPoints, applyExpanded],
  )

  /**
   * One close per open, whoever asks first.
   *
   * The drag-dismiss rule below and vaul's own flick-to-close can both fire
   * for the same gesture, and `onOpenChange(false)` is not idempotent upstream
   * — it consumes a history entry. The latch clears when the sheet reopens.
   */
  const closedRef = useRef(false)
  useEffect(() => {
    if (open) closedRef.current = false
  }, [open])
  const requestClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onOpenChange(false)
  }, [onOpenChange])
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) onOpenChange(true)
      else requestClose()
    },
    [onOpenChange, requestClose],
  )

  /**
   * Drag vs scroll, decided per gesture.
   *
   * With snap points vaul answers "is this a drag?" with "yes" for anything
   * that starts while the sheet is translated at all — true at every snap
   * below full height — so a swipe on a list would scroll the list AND haul
   * the sheet at the same time. `data-vaul-no-drag` on the scroll region is
   * the documented opt-out, and toggling it from the first pointer move
   * restores the two cases worth keeping: a panel with nothing to scroll drags
   * from anywhere, and a downward pull with a list already at its top is a
   * dismiss. Everything else inside a scrollable list is a scroll.
   *
   * The attribute is re-armed on the next pointer DOWN and never on pointer up
   * — vaul asks again on release, and an attribute restored too early makes it
   * bail out of its own snap-back.
   */
  const dragOriginRef = useRef<number | null>(null)

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragOriginRef.current = event.clientY
      scrollRef.current?.setAttribute(NO_DRAG_ATTR, '')
    },
    [],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current
      const scroll = scrollRef.current
      if (origin === null || !scroll) return
      const scrollable = scroll.scrollHeight > scroll.clientHeight + 1
      const draggable =
        !scrollable || (event.clientY > origin && scroll.scrollTop <= 0)
      if (draggable === scroll.hasAttribute(NO_DRAG_ATTR)) {
        if (draggable) scroll.removeAttribute(NO_DRAG_ATTR)
        else scroll.setAttribute(NO_DRAG_ATTR, '')
      }
    },
    [],
  )

  /**
   * Dragged far enough below the default snap? Then it was a dismiss.
   *
   * vaul's snap-point release only closes on a fast flick; a deliberate slow
   * pull to the bottom of the screen would otherwise spring back, which is not
   * what the sheet did before snap points and not what a drag that ends over
   * the tab bar means. The `vaul-dragging` class is the gate — it is present
   * only when vaul actually moved the sheet, so a gesture that scrolled the
   * list can never be read as a dismiss.
   */
  const handlePointerUp = useCallback(() => {
    dragOriginRef.current = null
    const element = sheetRef.current
    if (!element || !snapPoints) return
    if (!element.classList.contains('vaul-dragging')) return
    const translateY = parseTranslateY(getComputedStyle(element).transform)
    if (translateY === null) return
    if (shouldDismissSheet(translateY, viewport, snaps.defaultHeight)) {
      requestClose()
    }
  }, [snapPoints, viewport, snaps.defaultHeight, requestClose])

  const activeHeight = expanded ? snaps.expandedHeight : snaps.defaultHeight

  return (
    <>
      {/* Resolves `--pl-chart-top` (and its safe-area inset) to px. Zero-width,
          hidden, never in flow — its only job is to be measurable. */}
      <div aria-hidden className="pl-chart-top-probe" ref={probeRef} />
      <Drawer.Root
        activeSnapPoint={activeSnapPoint}
        dismissible
        modal={false}
        onOpenChange={handleOpenChange}
        open={open}
        setActiveSnapPoint={handleSnapChange}
        snapPoints={snapPoints}
      >
        <Drawer.Portal>
          {/* No Drawer.Overlay: the design has no scrim behind a panel, and one
              would swallow the tap that dismisses it. */}
          <Drawer.Content
            aria-label={label}
            className={cn(
              'pl-sheet fixed inset-x-0 z-40 flex flex-col outline-none',
              snapPoints ? 'top-0' : 'bottom-0',
              variant === 'copilot' && 'pl-sheet-copilot',
              className,
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={sheetRef}
            // Snap mode: sized for the LARGEST snap and translated by vaul —
            // a height that changed with the snap would relayout the panel on
            // every drag frame. Full mode: both `top` and `bottom` set, so the
            // height is implicit and vaul's transform drag still works.
            style={
              snapPoints
                ? { height: `${snaps.expandedHeight}px` }
                : { top: sheetTop(band) }
            }
          >
            <Drawer.Title className="sr-only">{label}</Drawer.Title>
            {handle ? <div aria-hidden className="pl-handle shrink-0" /> : null}
            {header ? <div className="shrink-0">{header}</div> : null}
            {/* `inert` alongside the CSS pointer-events cut: an invisible
                outgoing panel must be unreachable by keyboard and screen
                reader too, not just by touch. */}
            <div
              className="pl-sheet-scroll flex-1 overflow-y-auto overscroll-contain"
              data-swapping={swapping ? 'true' : undefined}
              data-vaul-no-drag={snapPoints ? '' : undefined}
              inert={swapping || undefined}
              ref={scrollRef}
              // The below-the-fold remainder of the largest snap, handed back
              // as padding so a list ends at the fold and a percentage-height
              // child resolves to the visible slice.
              style={{
                paddingBottom: snapPoints
                  ? `calc(${snaps.expandedHeight - activeHeight}px + var(--pl-bottom-inset))`
                  : 'var(--pl-bottom-inset)',
              }}
            >
              <SheetScrollContext value={scrollRef}>
                {children}
              </SheetScrollContext>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
})
