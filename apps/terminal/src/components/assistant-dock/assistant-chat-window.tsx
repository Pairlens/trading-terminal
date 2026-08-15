// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Floating chat panel for the unified assistant dock. It grows out of the orb
 * (transform origin bottom right), holds a header, a body, an optional notice
 * strip and an optional footer.
 *
 * It is ALWAYS mounted and only animates between shown and hidden. Unmounting
 * on close would tear down the conversation inside it, and the whole point of
 * the dock is that minimizing it does not stop a run that is under way.
 *
 * Purely presentational: no data, no chat state. The parent owns placement and
 * every string arrives translated.
 */
import { Sparkles, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { Button } from '@pairlens/ui/components/ui/button'

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

export type AssistantChatWindowProps = {
  open: boolean
  onClose: () => void
  /** Header title, translated. */
  title: string
  /** Optional subtitle line under the title (e.g. what it is watching). */
  subtitle?: string | null
  /** Accessible name for the close button, translated. */
  closeLabel?: string
  /** Right-hand header slot: persona menu, clear button etc. */
  headerActions?: ReactNode
  /**
   * The body. It owns its own scrolling: the conversation nests a
   * message list, an error strip and a composer, and a scroller out
   * here would fight the list's stick-to-bottom.
   */
  children: ReactNode
  /** Fixed footer under the body, when the body does not carry one. */
  footer?: ReactNode
  /** Optional error/notice strip rendered between children and footer. */
  notice?: ReactNode
  /** Measured by the drag hook to keep the window inside the viewport. */
  windowRef?: React.Ref<HTMLDivElement>
  /** Spread onto the header, which doubles as the title bar. */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  dragging?: boolean
}

export function AssistantChatWindow({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  headerActions,
  children,
  footer,
  notice,
  windowRef,
  dragHandleProps,
  dragging = false,
}: AssistantChatWindowProps) {
  const reduceMotion = useReducedMotion() ?? false

  // Escape closes only when focus sits inside the window, and only when nothing
  // nested (a menu, a popover) already handled the key. Everything else keeps
  // its own Escape behaviour.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.stopPropagation()
    onClose()
  }

  return (
    <motion.div
      ref={windowRef}
      role="dialog"
      data-assistant-window=""
      data-open={open ? '' : undefined}
      aria-label={title}
      // Collapsed is hidden, never unmounted. A run in flight has to
      // survive the user putting the window away, so the conversation
      // below stays mounted and only its visibility animates.
      aria-hidden={!open}
      inert={!open}
      onKeyDown={handleKeyDown}
      initial={false}
      animate={open ? 'open' : 'closed'}
      variants={
        reduceMotion
          ? {
              open: { opacity: 1, visibility: 'visible' },
              closed: { opacity: 0, visibility: 'hidden' },
            }
          : {
              open: { opacity: 1, scale: 1, y: 0, visibility: 'visible' },
              closed: {
                opacity: 0,
                scale: 0.94,
                y: 12,
                visibility: 'hidden',
              },
            }
      }
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        transformOrigin: 'bottom right',
        pointerEvents: open ? 'auto' : 'none',
      }}
      className="bg-card text-card-foreground border-border relative flex h-[min(620px,calc(100svh-8rem))] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg"
    >
      {/* Decorative seam, the same one the copilot and builder panels wear. */}
      <div className="magic-gradient pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px]" />

      {/* The header is the title bar: grab anywhere on it that is not a
          control and the window follows. `select-none` so a drag does
          not smear a text selection across the title. */}
      <div
        {...dragHandleProps}
        className={`border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-2 select-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <Sparkles
          className="size-3.5 shrink-0"
          style={{ color: 'var(--magic-1)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium leading-none">{title}</p>
          {subtitle ? (
            <p className="text-muted-foreground mt-1 truncate font-mono text-[10px] leading-none tracking-tight">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerActions}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {notice ? <div className="shrink-0 px-3 pb-1">{notice}</div> : null}

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </motion.div>
  )
}
