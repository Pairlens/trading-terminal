// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Collapsed affordance for the unified assistant dock: a glass pill with a
 * short companion line on the left and the orb on the right, one click target.
 *
 * While a run is in flight the pill takes a magic ring. The orb alone is 28px
 * of signal in a corner, and a collapsed assistant that is working has to be
 * legible from the other side of a four-pane layout.
 *
 * Purely presentational. Every string arrives translated from the caller, and
 * the parent owns placement (this component never positions itself).
 */
import { AnimatePresence, motion } from 'motion/react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'
import { ShortcutHint } from '@/components/shortcut-hints'

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
  /** Display label for the toggle chord, or `''` when unbound. */
  shortcut?: string
  onClick: () => void
}

export function AssistantOrbButton({
  label,
  busy,
  open,
  openLabel,
  closeLabel,
  shortcut,
  onClick,
}: AssistantOrbButtonProps) {
  // The label changes as the user moves around the terminal, so the key carries
  // the text itself: a new companion line cross-fades instead of swapping.
  const labelKey = `${busy ? 'busy' : 'idle'}:${label}`

  return (
    <Button
      variant="ghost"
      data-assistant-orb=""
      data-busy={busy ? '' : undefined}
      aria-expanded={open}
      aria-label={open ? closeLabel : openLabel}
      onClick={onClick}
      className="ai-glass-pill hover-lift text-muted-foreground hover:text-foreground aria-expanded:text-foreground hover:bg-[var(--ai-glass)] h-10 gap-2.5 rounded-full py-0 pr-1 pl-3.5 text-xs"
    >
      <span
        className={
          open
            ? 'relative flex min-w-0 items-center opacity-55'
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

      {/* Marked so the chat window can grow out of the glyph rather than
          out of the middle of the suggestion beside it. */}
      <span data-assistant-orb-core="" className="flex shrink-0">
        <AiOrb
          size="30px"
          animationDuration={15}
          state={busy ? 'thinking' : 'idle'}
          className="shrink-0"
        />
      </span>
      {/* Invisible until a modifier is held, so the pill stays a label and
          an orb and the chord is still there to be found. */}
      <ShortcutHint keys={shortcut ?? ''} />
    </Button>
  )
}
