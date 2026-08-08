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
import { memo, useEffect, useRef } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
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
  children,
  className,
}: FullScreenOverlayProps) {
  const { t } = useTranslation()
  const DismissIcon = dismiss === 'close' ? X : ChevronLeft
  const rootRef = useRef<HTMLDivElement | null>(null)
  useSheetFocusShield(rootRef)

  return (
    <div
      className={cn(
        'fixed inset-x-0 z-[60] flex flex-col',
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
            'flex size-11 shrink-0 items-center justify-center rounded-full text-foreground',
            dismiss === 'close' ? '-mr-2 bg-white/[0.06]' : '-ml-2',
          )}
          onClick={onBack}
          type="button"
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
