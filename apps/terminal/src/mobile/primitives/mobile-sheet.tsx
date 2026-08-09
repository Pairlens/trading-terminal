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
 *
 * ## The exit
 *
 * Closing has to be a CSS ANIMATION and not a transition: Radix's `Presence`
 * keeps a closing node mounted only while `animationName` is something, and
 * waits only for `animationend`. vaul does ship one (`slideToBottom`, gated on
 * `data-vaul-snap-points=false` — an attribute that is `isOpen && hasSnapPoints`
 * and so flips false exactly when the sheet closes), and it is not usable here:
 * it travels to `--initial-transform`, which is short of the viewport for a
 * snap sheet, and it starts wherever vaul's inline transform happens to be
 * after its release logic has repositioned the sheet. Both ends are therefore
 * restated by `.pl-sheet[data-state='closed']` in mobile.css, from px this
 * component computes. The full argument lives on that rule.
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
  parseInlineTranslateY,
  parseTranslateY,
  resolveSheetSnaps,
  sheetProgress,
  sheetTop,
  shouldDismissSheet,
} from '../lib/mobile-geometry'
import { SHEET_EXIT_MS } from '../lib/panel-swap'
import type { SheetSnaps } from '../lib/mobile-geometry'
import type {
  CSSProperties,
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

/**
 * The sheet's live position, published to CSS.
 *
 * `--pl-sheet-dock` runs 0 (off screen) → 1 (default snap);
 * `--pl-sheet-expand` runs 0 (default snap) → 1 (expanded snap). Everything in
 * the chart band that has to move WITH the sheet — the price readout's scale,
 * the timeframe chip's fade, the drawing toolbar's entrance — reads these
 * instead of a React prop, which is what keeps a finger-tracked sheet off the
 * render path entirely. `.pl-sheet-driving` on <html> means "a rAF owns these
 * values this frame"; consumers switch their transitions off while it is
 * present and animate on vaul's curve when it is not.
 */
const DOCK_VAR = '--pl-sheet-dock'
const EXPAND_VAR = '--pl-sheet-expand'
const DRIVING_CLASS = 'pl-sheet-driving'

/**
 * How long tracking outlives the finger. vaul settles a released snap over
 * 0.5s on its own curve; following its transform for a beat longer is what
 * makes the readout ride the settle instead of racing it with a second
 * transition of its own.
 */
const SETTLE_MS = 620

/**
 * How long tracking outlives a CLOSE.
 *
 * A dismiss is a gesture the sheet performs on its own: it animates out over
 * the same 0.5s curve (see The exit, above), and the chart band's chrome has to
 * RIDE that travel rather than race it with a transition of its own.
 * Deliberately longer than the 0.5s exit, because the last frames
 * are exactly the ones that hand the drawing toolbar its final few percent — a
 * settle that fires early snaps the vars, drops `.pl-sheet-driving`, and lets a
 * SECOND animation (the toolbar's own transition) finish the entrance after the
 * sheet has already gone. That double-drive is what read as a flicker.
 */
const EXIT_TRACK_MS = 820

function writeProgressVars(dock: number, expand: number): void {
  const root = document.documentElement
  root.style.setProperty(DOCK_VAR, dock.toFixed(3))
  root.style.setProperty(EXPAND_VAR, expand.toFixed(3))
}

type ProgressState = {
  open: boolean
  expanded: boolean
  /** Snap-mode sheets only. A full-height picker must not touch the vars. */
  tracked: boolean
  viewport: number
  snaps: SheetSnaps
}

function useSheetProgressVars(
  sheetRef: RefObject<HTMLDivElement | null>,
  state: ProgressState,
): () => void {
  // A ref rather than deps: the rAF reads the newest geometry every frame and
  // must never be torn down and rebuilt mid-gesture.
  const live = useRef(state)
  live.current = state

  const frameRef = useRef(0)
  const settleUntilRef = useRef(0)

  const settle = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    document.documentElement.classList.remove(DRIVING_CLASS)
    const { open, expanded, tracked } = live.current
    writeProgressVars(open ? 1 : 0, open && tracked && expanded ? 1 : 0)
  }, [])

  const step = useCallback(() => {
    const element = sheetRef.current
    const { tracked, viewport, snaps } = live.current
    if (!element || !tracked) {
      settle()
      return
    }
    // While the finger owns the sheet, vaul's inline transform IS the live
    // position and can be read for free. On release vaul writes the TARGET
    // inline and hands the travel to a 0.5s CSS transition, so during the
    // settle only the COMPUTED matrix interpolates — reading the inline value
    // there would snap the chart-band chrome to the destination on frame one.
    const dragging = element.classList.contains('vaul-dragging')
    const translateY = dragging
      ? (parseInlineTranslateY(element.style.transform) ??
        parseTranslateY(getComputedStyle(element).transform))
      : parseTranslateY(getComputedStyle(element).transform)
    if (translateY !== null) {
      // While the sheet is LEAVING, mirror the animation's position back into
      // the inline transform it is overriding. Nothing sees it — an animation
      // outranks an inline style — until the sheet is reopened mid-exit, at
      // which point the animation stops applying and the browser falls back to
      // exactly this value. Without the mirror it falls back to the resting
      // snap instead, and the sheet pops the length of the screen into place;
      // the transition that carries a resumed entrance has to have somewhere
      // honest to start. (Blink's "before-change style" folds a removed
      // animation out and reads the underlying value, which is why the obvious
      // fixes — pinning the position in an effect or a frame callback — arrive
      // after that transition has already been started from the wrong place.)
      if (!live.current.open && !dragging) {
        element.style.transform = `translate3d(0, ${translateY}px, 0)`
      }
      const { dock, expand } = sheetProgress(translateY, viewport, snaps)
      writeProgressVars(dock, expand)
    }
    // A dragging sheet keeps itself alive; anything else gets one settle
    // window from the last pointer event. Nothing here can outlive a finger
    // that never lifts, which a `pointerdown`-latched flag would.
    const active = dragging || performance.now() < settleUntilRef.current
    if (!active) {
      settle()
      return
    }
    frameRef.current = requestAnimationFrame(step)
  }, [sheetRef, settle])

  /** Idempotent: called from every pointer event of a gesture, down to up. */
  const trackGesture = useCallback(() => {
    settleUntilRef.current = performance.now() + SETTLE_MS
    if (!live.current.tracked) return
    document.documentElement.classList.add(DRIVING_CLASS)
    if (!frameRef.current) frameRef.current = requestAnimationFrame(step)
  }, [step])

  // Every dismiss path — drag past the default snap, vaul's own flick, a tap
  // on the chart, Android back, a tab tap — is tracked frame by frame, exactly
  // like a finger. Declared ABOVE the settled-value effect so `frameRef` is
  // already armed when that one asks: otherwise a tab-tap dismiss writes dock 0
  // on the close frame and the toolbar arrives half a second before the sheet
  // has actually left.
  const wasOpenRef = useRef(state.open)
  useEffect(() => {
    const closing = wasOpenRef.current && !state.open
    wasOpenRef.current = state.open
    if (!closing || !state.tracked) return
    settleUntilRef.current = performance.now() + EXIT_TRACK_MS
    document.documentElement.classList.add(DRIVING_CLASS)
    if (!frameRef.current) frameRef.current = requestAnimationFrame(step)
  }, [state.open, state.tracked, step])

  // Everything that is NOT a finger and NOT a dismiss — opening, an expand, a
  // tab switch between two panels — lands here: write the target once and let
  // the consumers' own transitions carry it on vaul's curve, in lockstep with
  // the sheet's travel.
  useEffect(() => {
    if (!state.tracked || frameRef.current) return
    writeProgressVars(state.open ? 1 : 0, state.open && state.expanded ? 1 : 0)
  }, [state.open, state.expanded, state.tracked])

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      document.documentElement.classList.remove(DRIVING_CLASS)
      // A tracked sheet unmounting while still OPEN never rendered its
      // open→false transition, so the effect that walks the vars back never
      // ran — without this, `--pl-sheet-dock` stays pinned at 1 and the
      // drawing toolbar plus the hero readout are gone until the next panel
      // cycle. Guarded so an already-closed unmount cannot clobber a channel
      // some other, legitimately docked sheet now owns.
      if (live.current.tracked && live.current.open) writeProgressVars(0, 0)
    },
    [],
  )

  return trackGesture
}

/**
 * Closing a sheet whose MOUNT belongs to somebody else.
 *
 * The full-height pickers are rendered from the overlay stack (`OverlayHost`
 * in mobile-surface.tsx) and `popOverlay` unmounts the screen in the same
 * tick, so vaul's `Presence` never sees open→false and the exit documented
 * above never draws a frame — the picker vanished where every panel slides.
 * The seam is per-screen rather than a change to the stack: hold the sheet's
 * `open` locally, flip it, and hand the parent its close only once the
 * animation has played. `chart/drawing-toolbar.tsx` closes the same way.
 *
 * Idempotent by latch, because vaul's `onOpenChange` and whatever the user
 * tapped can both ask for the same close. `onClose` MUST be the
 * identity-addressed close the host provides (`closeOverlay` bound to this
 * screen's overlay — `closeShown` in mobile-surface.tsx), never the
 * positional `popOverlay`: the exit is long enough for the user to open a
 * DIFFERENT overlay on top, and a positional pop fired 500ms later would
 * dismiss the one they just opened. Identity is also what lets unmount FLUSH
 * the owed close instead of dropping it — firing against an entry that back
 * or a tab tap already removed is a no-op.
 *
 * One duration for both paths. Under `prefers-reduced-motion` the sheet is a
 * 140ms fade (mobile.css) and the stack entry is released at 500ms anyway:
 * nothing is on screen for the difference, and a second number here would be
 * a copy of a CSS one with nothing keeping the two in step.
 *
 * `reopenKey` is the overlay object the screen was handed. Pass it: the half
 * second the exit now lasts is long enough for the user to tap the same chip
 * again, and that second tap pushes a SECOND stack entry for a screen React
 * reuses rather than remounts — the sheet would stay shut behind a shell that
 * still believes a picker is up. See the reopen effect below for why the
 * pending hand-off is deliberately left to run.
 */
export function useSheetExit(
  onClose: () => void,
  reopenKey?: unknown,
): {
  open: boolean
  /**
   * True for the length of the exit. Anything a tap on the sheet APPLIES has
   * to check it: `.pl-sheet[data-state='closed']` cuts pointer events, but
   * that declaration sits in a cascade layer and loses to vaul's own
   * unlayered stylesheet (measured — the rows stay hit-testable for the whole
   * half second), so a second tap on a list row would still pick a pair the
   * user was not aiming at. Stable identity, and it reads a ref: guarding
   * must not re-render a list mid-exit.
   */
  isClosing: () => boolean
  requestClose: () => void
} {
  const [open, setOpen] = useState(true)
  const closingRef = useRef(false)
  // Every owed hand-off, not just the newest: asking to close, reopening and
  // closing again inside half a second owes the stack TWO closes, and a
  // single slot would drop the first one on the floor. Each entry carries the
  // `onClose` captured when it was ARMED — the host rebinds `onClose` to
  // whatever overlay the screen currently shows, and a close owed for the
  // previous overlay must not fire against the new one.
  const pendingRef = useRef<Array<{ timer: number; close: () => void }>>([])
  useEffect(
    () => () => {
      // FLUSH, don't drop. The owed close is identity-addressed
      // (`closeOverlay` removes the one entry this screen was showing, and
      // no-ops if back or a tab tap already removed it), so firing it at
      // unmount can never double-pop — but dropping it would strand the entry
      // whenever the screen unmounts mid-exit because a DIFFERENT overlay
      // adopted the top: the incoming screen would sit on a stack two deep,
      // and dismissing it would resurrect this one.
      for (const pending of pendingRef.current) {
        window.clearTimeout(pending.timer)
        pending.close()
      }
      pendingRef.current = []
    },
    [],
  )

  /**
   * Asked for again mid-exit — the same chip tapped twice inside half a
   * second. A picker→picker push REPLACES the leaving entry (see
   * lib/overlay-stack.ts), so this screen is re-driven by the new overlay
   * without remounting; all that is left to do is reopen the sheet. The close
   * it still owes stays scheduled and simply no-ops: it is identity-addressed
   * at the replaced entry, which is already gone.
   */
  const keyRef = useRef(reopenKey)
  useEffect(() => {
    if (reopenKey === keyRef.current) return
    keyRef.current = reopenKey
    closingRef.current = false
    setOpen(true)
  }, [reopenKey])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    // The keyboard retracts WITH the sheet rather than after it: a focused
    // search field otherwise holds the layout viewport short for the whole
    // exit, and the sheet slides towards a floor that is about to move.
    const focused = document.activeElement
    if (focused instanceof HTMLElement) focused.blur()
    setOpen(false)
    const pending = { timer: 0, close: onClose }
    pending.timer = window.setTimeout(() => {
      pendingRef.current = pendingRef.current.filter((p) => p !== pending)
      pending.close()
    }, SHEET_EXIT_MS)
    pendingRef.current.push(pending)
  }, [onClose])

  const isClosing = useCallback(() => closingRef.current, [])
  return { open, isClosing, requestClose }
}

/** vaul reads this off the pointer target to decide drag vs scroll. */
const NO_DRAG_ATTR = 'data-vaul-no-drag'

/**
 * How far a finger has to travel before the gesture counts as a drag, in px.
 *
 * vaul has NO slop: `isDeltaInDirection` returns true for a 1px move (measured
 * in vaul 1.1.2), so the first `pointermove` after a touch starts the drag,
 * stamps `vaul-dragging` and swallows the click. A real finger jitters 1–3px
 * during a tap — which is why every tap on a panel with nothing to scroll
 * failed on device while headless mouse taps, which have zero jitter, passed.
 */
const DRAG_SLOP_PX = 8

export type MobileSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chart-band height below the context bar; use a SHEET_BAND constant. */
  band: number | 'full'
  /**
   * Chart band left above the EXPANDED snap. Defaults to `EXPANDED_BAND`; the
   * Trade panel raises it so the limit line's grab strip stays whole.
   */
  expandedBand?: number
  /** 'default' = `--pl-surface`. 'copilot' = `--pl-surface-ai` + the magic
   *  hairline. Both follow the active theme; see the Paint block in
   *  mobile.css. */
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
  expandedBand,
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
        expandedBand,
      ),
    [band, chartTop, viewport, expandedBand],
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

  const trackGesture = useSheetProgressVars(sheetRef, {
    open,
    expanded,
    tracked: snapPoints !== undefined,
    viewport,
    snaps,
  })

  const activeSnapPoint = snapPoints ? snapPoints[expanded ? 1 : 0] : undefined

  /**
   * The snap vaul is told about — frozen for the length of the exit.
   *
   * Closing resets `expanded`, and vaul re-snaps the sheet the instant its
   * `activeSnapPoint` prop changes: it writes an inline transform on the very
   * frame the exit animation starts. Dismissing from the expanded snap
   * therefore teleported the sheet 178px DOWN (measured at 402×874) before the
   * exit had drawn a frame, and the animation then ran from the wrong place.
   * While the sheet is closing it keeps the snap it was at, so the exit starts
   * exactly where the user left it. The mirror still fires immediately —
   * `onExpandedChange(false)` is what tells the chart band to stop treating the
   * sheet as expanded, and that has to be true the moment it starts leaving.
   */
  const exitSnapRef = useRef(activeSnapPoint)
  if (open) exitSnapRef.current = activeSnapPoint
  const vaulSnapPoint = open ? activeSnapPoint : exitSnapRef.current

  /**
   * Reopening while the previous exit is still on screen.
   *
   * The exit keeps the SAME node mounted for half a second, and both of the
   * things that would normally place a reopening sheet — the inline transform
   * vaul wrote and the `--snap-point-height` rule behind it — still say
   * "resting". A panel tapped 200ms after the last one was dismissed therefore
   * popped straight to its snap instead of travelling to it, because the
   * position the sheet was VISUALLY at belonged to an animation that stopped
   * applying the instant `data-state` flipped back to open.
   *
   * The frame loop has already mirrored the exit into the inline transform
   * (see `useSheetProgressVars`), so the sheet's position is honest the moment
   * the animation stops applying. All that is left is to hand the target back:
   * clearing the inline value lets vaul's `--snap-point-height` rule own the
   * destination again, and `.pl-sheet`'s transition carries the sheet there
   * from wherever the exit had got to. Reopening the SAME panel is why this is
   * unconditional rather than left to vaul — its own snap effect only fires
   * when the snap point changes, and a sheet reopened onto the panel it just
   * closed would stay parked at the bottom of the screen.
   *
   * A fresh mount has no inline transform, so the common path is a no-op.
   */
  useLayoutEffect(() => {
    if (!open) return
    const element = sheetRef.current
    if (element?.style.transform) element.style.transform = ''
  }, [open])

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
  /**
   * Where the sheet IS at the moment of dismissal — the exit animation's
   * `from`, in px. Null when the dismiss did not come through here (a tab tap,
   * a tap on the chart), in which case the sheet is at rest and its snap is the
   * answer.
   *
   * Read here rather than in an effect because this is the last moment the
   * inline transform still says where the finger left the sheet: vaul's own
   * release logic runs immediately after ours and snaps the sheet back to the
   * nearest snap point, which is what used to teleport a long drag-dismiss
   * back up before the exit had drawn a frame.
   */
  const exitFromRef = useRef<number | null>(null)
  useEffect(() => {
    if (!open) return
    closedRef.current = false
    exitFromRef.current = null
  }, [open])
  const requestClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    const element = sheetRef.current
    exitFromRef.current = element
      ? parseTranslateY(getComputedStyle(element).transform)
      : null
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
   *
   * The hand-off is ONE-WAY and gated on `DRAG_SLOP_PX` of vertically dominant
   * travel. One-way because vaul latches `isAllowedToDrag` on the first move it
   * accepts and never re-asks for the rest of the gesture, so re-arming
   * mid-drag is dead code that only risks confusing the release path. Gated
   * because without slop a tap's own jitter armed the drag and ate the click,
   * and vertical dominance is what keeps a horizontal gesture — the Trade
   * ticket's slide-to-confirm — from hauling the sheet.
   */
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragOriginRef.current = { x: event.clientX, y: event.clientY }
      scrollRef.current?.setAttribute(NO_DRAG_ATTR, '')
      trackGesture()
    },
    [trackGesture],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current
      const scroll = scrollRef.current
      if (origin === null || !scroll) return
      trackGesture()
      // Already handed over: the gesture belongs to the sheet for good.
      if (!scroll.hasAttribute(NO_DRAG_ATTR)) return
      const dy = event.clientY - origin.y
      const dx = event.clientX - origin.x
      if (Math.abs(dy) < DRAG_SLOP_PX || Math.abs(dy) <= Math.abs(dx)) return
      const scrollable = scroll.scrollHeight > scroll.clientHeight + 1
      // A panel with nothing to scroll drags from anywhere; a scrollable one
      // only when it is already at its top and the pull is downward.
      if (scrollable && !(dy > 0 && scroll.scrollTop <= 0)) return
      scroll.removeAttribute(NO_DRAG_ATTR)
    },
    [trackGesture],
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
  const handlePointerCancel = useCallback(() => {
    dragOriginRef.current = null
    trackGesture()
  }, [trackGesture])

  const handlePointerUp = useCallback(() => {
    dragOriginRef.current = null
    trackGesture()
    const element = sheetRef.current
    if (!element || !snapPoints) return
    if (!element.classList.contains('vaul-dragging')) return
    const translateY = parseTranslateY(getComputedStyle(element).transform)
    if (translateY === null) return
    if (shouldDismissSheet(translateY, viewport, snaps.defaultHeight)) {
      requestClose()
    }
  }, [trackGesture, snapPoints, viewport, snaps.defaultHeight, requestClose])

  const activeHeight = expanded ? snaps.expandedHeight : snaps.defaultHeight

  /**
   * Where the sheet IS on the render that closes it, for every dismiss that
   * did NOT come through `requestClose` — a tap on the chart, a tab tap,
   * Android back. Those are parent-driven: `open` simply flips, and the
   * resting snap is only the right answer when the sheet was actually AT it.
   * Interrupt an entrance or a settle and it is not, and `plSheetOut`'s
   * explicit `from` would teleport the sheet the rest of its travel before it
   * starts sliding out.
   *
   * Read during RENDER, because this is the last moment the DOM still carries
   * the pre-close matrix: by the time a layout effect runs, `data-state` is
   * already 'closed', `transition: none` has cancelled the travel and
   * `getComputedStyle` reports the exit animation's own `from`.
   */
  const closingFromRef = useRef<number | null>(null)
  const wasOpenForExitRef = useRef(open)
  if (open) {
    closingFromRef.current = null
  } else if (wasOpenForExitRef.current) {
    const element = sheetRef.current
    closingFromRef.current = element
      ? parseTranslateY(getComputedStyle(element).transform)
      : null
  }
  wasOpenForExitRef.current = open

  // The exit's two ends, in px. `from` is the release position when the
  // dismiss came from a drag (sampled in `requestClose`, BEFORE vaul's release
  // logic snaps the sheet back), else the live position on the closing render,
  // else the resting snap — the FROZEN snap, because `expanded` has already
  // been reset by the time this render runs and a sheet dismissed from the
  // expanded snap would otherwise start its exit 178px below where it is.
  const restingTranslate =
    vaulSnapPoint === undefined ? 0 : viewport - parseFloat(vaulSnapPoint)
  const exitFrom =
    exitFromRef.current ?? closingFromRef.current ?? restingTranslate

  return (
    <>
      {/* Resolves `--pl-chart-top` (and its safe-area inset) to px. Zero-width,
          hidden, never in flow — its only job is to be measurable. */}
      <div aria-hidden className="pl-chart-top-probe" ref={probeRef} />
      <Drawer.Root
        activeSnapPoint={vaulSnapPoint}
        dismissible
        modal={false}
        onOpenChange={handleOpenChange}
        open={open}
        // vaul's own keyboard handling is OFF. With `repositionInputs` it
        // answers a `visualViewport` resize by writing `height` and `bottom`
        // straight onto this element — clobbering the React-controlled height
        // the snap geometry depends on, and pinning a `bottom` on a sheet that
        // is positioned by `top` + `height`. The keyboard is already handled,
        // once, by `interactive-widget=resizes-content` in the viewport meta:
        // the layout viewport shrinks, `useShellMetrics` re-measures, the snaps
        // are recomputed and vaul re-translates to them. Two mechanisms for one
        // event is what left the co-pilot composer's sheet mis-sized on focus.
        repositionInputs={false}
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
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={sheetRef}
            // Snap mode: sized for the LARGEST snap and translated by vaul —
            // a height that changed with the snap would relayout the panel on
            // every drag frame. Full mode: both `top` and `bottom` set, so the
            // height is implicit and vaul's transform drag still works.
            // `--pl-sheet-exit-*` are the two ends of the exit animation (the
            // `.pl-sheet[data-state='closed']` rule in mobile.css); the
            // ENTRANCE reads `--initial-transform`, which is vaul's own
            // escape hatch for the same number. Both default to `100%` — the
            // element's own height — which is right for a full-height sheet
            // (`top` + `bottom: 0`) and wrong for a snap sheet, which is
            // `top: 0` and sized for its LARGEST snap: 100% of it is short of
            // the viewport by the chart band, so the sheet both arrived from
            // and left towards a position still 66px on screen (measured at
            // 402×874). Everything here is px off `window.innerHeight`, never
            // `svh` — the same number vaul computes its snap offsets from.
            style={
              snapPoints
                ? ({
                    height: `${snaps.expandedHeight}px`,
                    '--initial-transform':
                      viewport > 0 ? `${viewport}px` : '100%',
                    '--pl-sheet-exit-from': `${Math.round(exitFrom)}px`,
                    '--pl-sheet-exit-to':
                      viewport > 0 ? `${viewport}px` : '100%',
                  } as CSSProperties)
                : ({
                    top: sheetTop(band),
                    // `exitFrom` and not a literal `0px`. A full-height sheet
                    // rests at 0 so the two agree almost always — but a picker
                    // FLICKED away is 260px down when vaul dismisses it
                    // (measured), and starting the exit at 0 popped it back to
                    // the top for a frame before it slid out. Invisible until
                    // this round, because the pickers used to unmount without
                    // animating at all.
                    '--pl-sheet-exit-from': `${Math.round(exitFrom)}px`,
                    '--pl-sheet-exit-to': '100%',
                  } as CSSProperties)
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
              //
              // The fold is the TAB BAR, not the bottom of the screen: the bar
              // is drawn over the sheet (z-50 against z-40) and owns
              // `--pl-tabbar-total` of it. Reserving only the safe-area inset
              // put the last ~54px of every panel underneath the bar — the
              // clipped privacy note on the signed-out co-pilot gate, the
              // half-visible final news row on Discover. One number, so no
              // panel has to remember to add it back.
              //
              // Full-height sheets keep the old reserve: the pair and venue
              // pickers already pad their own content by `--pl-tabbar-total`,
              // and adding it here would double it.
              style={{
                paddingBottom: snapPoints
                  ? `calc(${snaps.expandedHeight - activeHeight}px + var(--pl-tabbar-total))`
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
