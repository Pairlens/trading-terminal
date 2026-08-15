// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Collapsed affordance for the unified assistant dock: a floating pill with a
 * short companion line on the left and the orb on the right, one click target.
 *
 * Purely presentational. Every string arrives translated from the caller, and
 * the parent owns placement (this component never positions itself).
 */
import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

/**
 * Floating sits over the panes and has to lift off whatever is behind
 * it: its own bordered, blurred surface with a shadow. In the bottom
 * strip there is nothing behind it, and that same treatment reads as a
 * pill stuck onto the wallpaper, so the bar variant borrows the rail's
 * hover styling instead and lets the chrome show through.
 */
const SURFACE_CLASS = {
  floating:
    'hover-lift border-border/60 bg-card/80 hover:bg-card/90 aria-expanded:bg-card/90 border shadow-lg backdrop-blur-md',
  bar: 'hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent',
} as const

export type AssistantOrbButtonProps = {
  /** Companion line. Already translated by the caller. */
  label: string
  /** true while a run is in flight, so the orb animates and the label shimmers. */
  busy: boolean
  /** true when the chat window is open (button becomes a "minimize" affordance). */
  open: boolean
  /** Accessible name while the window is closed. Already translated. */
  openLabel: string
  /** Accessible name while the window is open. Already translated. */
  closeLabel: string
  onClick: () => void
  /** Which surface it is sitting on. Defaults to over the panes. */
  variant?: keyof typeof SURFACE_CLASS
}

export function AssistantOrbButton({
  label,
  busy,
  open,
  openLabel,
  closeLabel,
  onClick,
  variant = 'floating',
}: AssistantOrbButtonProps) {
  // The label changes as the user moves around the terminal, so the key carries
  // the text itself: a new companion line cross-fades instead of swapping.
  const labelKey = `${busy ? 'busy' : 'idle'}:${label}`

  return (
    <Button
      variant="ghost"
      data-assistant-orb=""
      aria-expanded={open}
      aria-label={open ? closeLabel : openLabel}
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:text-foreground aria-expanded:text-foreground h-9 gap-2 rounded-full py-0 pr-1 pl-3 text-xs',
        SURFACE_CLASS[variant],
      )}
    >
      <span
        className={
          open
            ? 'relative flex min-w-0 items-center opacity-60'
            : 'relative flex min-w-0 items-center'
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={labelKey}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="block min-w-0"
          >
            {busy ? (
              <ShimmeringText
                text={label}
                duration={1.5}
                repeatDelay={0.3}
                spread={3}
                startOnView={false}
                className="max-w-[22ch] truncate text-xs"
              />
            ) : (
              <span className="inline-block max-w-[22ch] truncate align-middle">
                {label}
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </span>

      <AiOrb
        size="28px"
        animationDuration={15}
        state={busy ? 'thinking' : 'idle'}
        className="shrink-0"
      />
    </Button>
  )
}
