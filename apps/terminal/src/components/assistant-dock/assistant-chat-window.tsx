// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Floating glass panel for the unified assistant dock. It grows out of the orb
 * (transform origin bottom right), holds a header, a body, an optional notice
 * strip and an optional footer.
 *
 * It is ALWAYS mounted and only animates between shown and hidden. Unmounting
 * on close would tear down the conversation inside it, and the whole point of
 * the dock is that minimizing it does not stop a run that is under way.
 *
 * The panel is glass because it hangs over a live chart and an opaque card
 * there reads as a hole in the screen. The fill has a floor (see
 * assistant-glass.css) so body text keeps its contrast whatever runs
 * underneath it.
 *
 * Purely presentational: no data, no chat state. The parent owns placement and
 * every string arrives translated.
 */
import { X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

export type AssistantChatWindowProps = {
  open: boolean
  onClose: () => void
  /** Header title, translated. */
  title: string
  /** Optional status line under the title (e.g. what it is doing right now). */
  subtitle?: string | null
  /** true while a run is in flight: the orb animates and the status shimmers. */
  busy?: boolean
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
  busy = false,
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
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{
        transformOrigin: 'bottom right',
        pointerEvents: open ? 'auto' : 'none',
      }}
      className="ai-glass ai-aura text-card-foreground relative flex h-[min(660px,calc(100svh-7.5rem))] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px]"
    >
      {/* Light on the top edge, masked to nothing at both ends so it reads as
          a highlight and not a progress bar. */}
      <div className="ai-seam pointer-events-none absolute inset-x-0 top-0 z-20 h-px" />

      {/* The header is the title bar: grab anywhere on it that is not a
          control and the window follows. `select-none` so a drag does
          not smear a text selection across the title. */}
      <header
        {...dragHandleProps}
        className={`relative z-10 flex shrink-0 items-center gap-2.5 px-3.5 pt-3 pb-2.5 select-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <AiOrb
          size="26px"
          animationDuration={15}
          state={busy ? 'thinking' : 'idle'}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-medium">
            {title}
          </p>
          {subtitle ? (
            <div className="text-muted-foreground mt-0.5 truncate text-[11px] leading-tight">
              {busy ? (
                <ShimmeringText
                  text={subtitle}
                  duration={1.5}
                  repeatDelay={0.3}
                  spread={3}
                  startOnView={false}
                  className="text-[11px]"
                />
              ) : (
                subtitle
              )}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerActions}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-7 rounded-full"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Hairline under the header. A `border-b` would inherit the panel's own
          edge colour; the assistant's edges are its own token. */}
      <div className="pointer-events-none mx-3.5 h-px shrink-0 bg-[var(--ai-edge-soft)]" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {notice ? (
        <div className="relative z-10 shrink-0 px-3.5 pb-1">{notice}</div>
      ) : null}

      {footer ? <div className="relative z-10 shrink-0">{footer}</div> : null}
    </motion.div>
  )
}
