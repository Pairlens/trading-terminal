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

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

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
}

export function AssistantOrbButton({
  label,
  busy,
  open,
  openLabel,
  closeLabel,
  onClick,
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
      className="hover-lift border-border/60 bg-card/80 hover:bg-card/90 aria-expanded:bg-card/90 text-muted-foreground hover:text-foreground aria-expanded:text-foreground h-9 gap-2 rounded-full border py-0 pr-1 pl-3 text-xs shadow-lg backdrop-blur-md"
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
