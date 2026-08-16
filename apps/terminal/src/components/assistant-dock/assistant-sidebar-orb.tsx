// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The orb, docked in the nav rail ──────────────────────────────────
//
// The quiet placement. The rail is 60px wide, so the suggestion cannot
// sit beside the orb the way it does when floating: it flies out to the
// right instead, on hover, on keyboard focus, or unprompted whenever
// the assistant is actually working.
//
// That last case is the point of the whole component. Docked here the
// orb is easy to forget, so a run in progress has to announce itself
// without being asked.

import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@pairlens/ui/components/ui/sidebar'
import { ShortcutHint } from '@/components/shortcut-hints'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { useAssistantPlacement } from '@/lib/assistant-core/placement'
import { useAssistantOrbLabel } from '@/lib/assistant-core/use-orb-label'
import {
  toggleAssistantFrom,
  useAssistantStore,
} from '@/stores/assistant-store'

/**
 * What the shell drops into the nav rail. Renders nothing unless the
 * user has chosen this placement, so the rail's markup does not have to
 * know the setting exists.
 */
export function AssistantSidebarOrbItem() {
  const { t } = useTranslation()
  const [placement] = useAssistantPlacement()
  const isOpen = useAssistantStore((state) => state.isOpen)
  const { label, busy } = useAssistantOrbLabel()
  const shortcut = useKeybindingLabel('general.toggleAssistant')

  if (placement !== 'sidebar') return null

  return (
    <AssistantSidebarOrb
      label={label}
      busy={busy}
      open={isOpen}
      openLabel={t('assistantDock.open')}
      closeLabel={t('assistantDock.close')}
      shortcut={shortcut}
      onClick={() => toggleAssistantFrom('orb')}
    />
  )
}

export type AssistantSidebarOrbProps = {
  /** Companion line, already translated. */
  label: string
  busy: boolean
  open: boolean
  openLabel: string
  closeLabel: string
  /** Display label for the toggle chord, or `''` when unbound. */
  shortcut?: string
  onClick: () => void
}

export function AssistantSidebarOrb({
  label,
  busy,
  open,
  openLabel,
  closeLabel,
  shortcut,
  onClick,
}: AssistantSidebarOrbProps) {
  const { t } = useTranslation()

  return (
    <SidebarMenuItem className="group/assistant relative">
      <SidebarMenuButton
        data-assistant-orb=""
        aria-label={open ? closeLabel : openLabel}
        aria-expanded={open}
        className="size-9 justify-center p-0"
        isActive={open}
        onClick={onClick}
        type="button"
      >
        {/* Marked for the chat window's transform origin: the panel flies
            out of the glyph, not out of the rail button around it. */}
        <span data-assistant-orb-core="" className="flex">
          <AiOrb
            size="20px"
            animationDuration={15}
            state={busy ? 'thinking' : 'idle'}
          />
        </span>
        <span className="sr-only">{t('assistantDock.title')}</span>
        {/* Every other item in the rail advertises its chord on hold-⌘; the
            orb was the one that did not, which is most of why the shortcut
            read as missing. */}
        <ShortcutHint keys={shortcut ?? ''} />
      </SidebarMenuButton>

      {/* Flies out over the content rather than widening the rail, which
          would reflow every pane behind it. Never interactive: this is a
          label, and the click target is the orb itself. */}
      <AnimatePresence>
        {label ? (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={
              busy
                ? 'pointer-events-none absolute top-1/2 left-[calc(100%+0.5rem)] z-50 -translate-y-1/2'
                : 'pointer-events-none absolute top-1/2 left-[calc(100%+0.5rem)] z-50 hidden -translate-y-1/2 group-hover/assistant:block group-focus-within/assistant:block'
            }
          >
            <span className="ai-glass-pill text-muted-foreground block max-w-[26ch] truncate rounded-lg px-2.5 py-1 text-xs">
              {busy ? <ShimmeringText text={label} duration={1.6} /> : label}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SidebarMenuItem>
  )
}
