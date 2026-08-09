// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The full-height frame every mobile overlay wears: a dismiss control, a
 * title, an actions slot, and a scrolling body.
 *
 * Two things it deliberately does NOT do, both taken from the design:
 *
 *   - It stops above the tab bar rather than covering it. The order-book
 *     screen keeps `Trade` lit while the book is open, and Settings keeps the
 *     bar visible too — the phone never strands the user in a screen with no
 *     way out but a back gesture.
 *   - It starts at the chart top by default, so the context bar keeps saying
 *     what is in focus. `anchor="screen"` is for the screens that replace the
 *     context bar entirely (Settings), which is why it also carries its own
 *     safe-area padding.
 *
 * z-60: above sheets (40), the timeframe popover (45) and the tab bar (50).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from './press'
import type { ReactNode, RefObject } from 'react'

/**
 * Keep focus events that belong to this overlay away from the sheet below.
 *
 * vaul 1.1.2 never forwards `modal={false}` to its internal Radix dialog, so
 * an open panel sheet keeps a live Radix focus trap: document-level
 * focusin/focusout listeners that drag focus back into the sheet the moment
 * anything outside it takes it. Every full-screen overlay renders ABOVE such
 * a sheet, so without this an overlay's text field (the All-pairs filter, a
 * rename input) takes a caret for one tick and loses it — on iOS that reads
 * as "the keyboard never opens". Radix listens on the bubble phase; catching
 * the events in the CAPTURE phase and stopping ones that involve this overlay
 * starves the trap without changing where focus actually goes. Dialogs
 * portaled to <body> from inside the overlay are covered too: their focus
 * transitions carry the overlay as relatedTarget.
 */
function useSheetFocusShield(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const involvesOverlay = (event: FocusEvent) => {
      const root = rootRef.current
      if (!root) return false
      return (
        root.contains(event.target as Node | null) ||
        root.contains(event.relatedTarget as Node | null)
      )
    }
    const shield = (event: FocusEvent) => {
      if (involvesOverlay(event)) event.stopPropagation()
    }
    document.addEventListener('focusin', shield, true)
    document.addEventListener('focusout', shield, true)
    return () => {
      document.removeEventListener('focusin', shield, true)
      document.removeEventListener('focusout', shield, true)
    }
  }, [rootRef])
}

/**
 * How long the exit runs before the host is told to unmount. Must match the
 * `[data-pl-overlay='exit']` transition in mobile.css.
 */
const EXIT_MS = 150

/**
 * Enter/exit motion for every full-screen screen in the shell.
 *
 * Two decisions worth keeping:
 *
 *   - **The phase is a DOM attribute, not React state.** An overlay body can
 *     be a two-hundred-row order book, and re-rendering it twice just to fade
 *     the frame is the kind of cost this shell budgets against. Nothing in
 *     JSX declares the attribute either, which is what makes it survive a
 *     re-render from the screen's own state: Settings swapping list → section
 *     keeps the SAME element (same component, same position), so a
 *     JSX-declared attribute would snap back to `enter` and replay the
 *     animation on every keystroke inside a section.
 *   - **Exit is owned here, not by the host.** `MobileSurface` renders the
 *     overlay conditionally and unmounting cannot animate, so the dismiss
 *     control runs the exit first and calls `onBack` when it is over. That
 *     covers every dismissal that goes through this frame's own chevron or
 *     close button. Dismissals that bypass it (hardware back, a tab tap, a
 *     row that navigates) still cut — see the notes for the host-side change
 *     that would extend the exit to those too.
 *
 * `armEnter` runs again after a deferred `onBack` that did NOT unmount us
 * (Settings section → list), so the frame fades back in instead of staying
 * stuck at `exit`.
 */
function useOverlayMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  onBack: () => void,
  exitOnDismiss: boolean,
): () => void {
  const framesRef = useRef<Array<number>>([])
  const timerRef = useRef<number | null>(null)
  const closingRef = useRef(false)

  const armEnter = useCallback(() => {
    const node = rootRef.current
    if (!node || !node.isConnected) return
    for (const handle of framesRef.current) cancelAnimationFrame(handle)
    framesRef.current = []
    node.dataset.plOverlay = 'enter'
    // Two frames, not one: a style write and its flip inside the same frame
    // land in one style recalculation and the transition never starts.
    framesRef.current.push(
      requestAnimationFrame(() => {
        framesRef.current.push(
          requestAnimationFrame(() => {
            const current = rootRef.current
            if (current?.isConnected) current.dataset.plOverlay = 'open'
          }),
        )
      }),
    )
  }, [rootRef])

  // Layout, not passive: the entry styles have to be on the node before the
  // first paint, or the screen shows at its resting position for one frame
  // and then jumps back to animate in.
  useLayoutEffect(() => {
    armEnter()
    return () => {
      for (const handle of framesRef.current) cancelAnimationFrame(handle)
      framesRef.current = []
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [armEnter])

  return useCallback(() => {
    const node = rootRef.current
    if (!node) {
      onBack()
      return
    }
    // An in-screen back step (Settings section → list) swaps CHILDREN inside
    // this same fiber — running the exit there fades the whole frame off the
    // live terminal and replays the entry for a screen that never left. The
    // phase attribute must not be touched at all: staying at 'open' is what
    // makes the swap instant, matching the already-instant forward direction.
    if (!exitOnDismiss) {
      onBack()
      return
    }
    // A second tap while the exit runs must not queue a second `onBack`: on
    // a stack two pops would take the screen behind with it.
    if (closingRef.current) return
    closingRef.current = true
    node.dataset.plOverlay = 'exit'
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      closingRef.current = false
      onBack()
      armEnter()
    }, EXIT_MS)
  }, [armEnter, exitOnDismiss, onBack, rootRef])
}

export type FullScreenOverlayProps = {
  title: string
  /** Space Grotesk 20px/600 title (Order book, Discover). */
  display?: boolean
  onBack: () => void
  /** Rendered right of the title — grouping chips, an Auto chip, a close. */
  actions?: ReactNode
  /**
   * false ⇒ a flat translucent scrim, so the chart stays faintly visible
   * behind (the venue picker). Never a `backdrop-filter`: this box is the
   * whole chart band, the WebGL chart under it never stops painting, and a
   * blur that size is re-run by the compositor on every one of those frames.
   * Default true.
   */
  opaque?: boolean
  /** 'chart' keeps the context bar; 'screen' owns the top of the display. */
  anchor?: 'chart' | 'screen'
  /** Back chevron (a step in a flow) or a close X (a destination). */
  dismiss?: 'back' | 'close'
  /**
   * false ⇒ the dismiss control's `onBack` only swaps this frame's own
   * children (Settings section → list), so it must run instantly with no exit
   * phase. Default true: `onBack` unmounts the overlay and gets the exit.
   */
  exitOnDismiss?: boolean
  children: ReactNode
  className?: string
}

export const FullScreenOverlay = memo(function FullScreenOverlay({
  title,
  display = false,
  onBack,
  actions,
  opaque = true,
  anchor = 'chart',
  dismiss = 'back',
  exitOnDismiss = true,
  children,
  className,
}: FullScreenOverlayProps) {
  const { t } = useTranslation()
  const DismissIcon = dismiss === 'close' ? X : ChevronLeft
  const rootRef = useRef<HTMLDivElement | null>(null)
  useSheetFocusShield(rootRef)
  const requestDismiss = useOverlayMotion(rootRef, onBack, exitOnDismiss)

  return (
    <div
      className={cn(
        'pl-overlay fixed inset-x-0 z-[60] flex flex-col',
        opaque ? 'bg-background' : 'bg-background/95',
        className,
      )}
      ref={rootRef}
      role="dialog"
      style={{
        top: anchor === 'screen' ? 0 : 'var(--pl-chart-top)',
        bottom: 'var(--pl-tabbar-total)',
        paddingTop:
          anchor === 'screen' ? 'max(var(--pl-safe-top), 8px)' : undefined,
      }}
    >
      <header
        className={cn(
          'flex shrink-0 items-center gap-2 px-4 py-2',
          dismiss === 'close' && 'flex-row-reverse',
        )}
      >
        <button
          aria-label={t(dismiss === 'close' ? 'common.dismiss' : 'common.back')}
          className={cn(
            'pl-press-soft flex size-11 shrink-0 items-center justify-center rounded-full text-foreground',
            dismiss === 'close'
              ? '-mr-2 bg-[color:var(--pl-wash-strong)]'
              : '-ml-2',
          )}
          onClick={requestDismiss}
          type="button"
          {...PRESS}
        >
          <DismissIcon className="size-5" />
        </button>
        <h2
          className={cn(
            'min-w-0 flex-1 truncate font-semibold tracking-[-0.02em] text-foreground',
            display ? 'font-serif text-[20px]' : 'text-[17px]',
          )}
        >
          {title}
        </h2>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
        {children}
      </div>
    </div>
  )
})
