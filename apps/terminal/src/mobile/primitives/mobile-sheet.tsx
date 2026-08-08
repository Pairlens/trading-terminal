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
 */
import { memo, useEffect } from 'react'
import { Drawer } from 'vaul'

import { cn } from '@pairlens/ui'
import { sheetTop } from '../lib/mobile-geometry'
import type { ReactNode } from 'react'

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
  children,
  className,
}: MobileSheetProps) {
  useBodyPointerEventsGuard(open)
  return (
    <Drawer.Root
      dismissible
      modal={false}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Drawer.Portal>
        {/* No Drawer.Overlay: the design has no scrim behind a panel, and one
            would swallow the tap that dismisses it. */}
        <Drawer.Content
          aria-label={label}
          className={cn(
            'pl-sheet fixed inset-x-0 bottom-0 z-40 flex flex-col outline-none',
            variant === 'copilot' && 'pl-sheet-copilot',
            className,
          )}
          // Both `top` and `bottom` set → implicit height, and vaul's
          // transform-based drag still works.
          style={{ top: sheetTop(band) }}
        >
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          {handle ? <div aria-hidden className="pl-handle shrink-0" /> : null}
          {header ? <div className="shrink-0">{header}</div> : null}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(var(--pl-safe-bottom),30px)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
})
