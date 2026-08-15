// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The assistant dock ───────────────────────────────────────────────
//
// Pinned bottom-right, mounted outside the routed content, so it is the
// same assistant on the chart, on the bots page and in the workbench.
// Collapsing it hides the window and nothing else: the conversation
// stays mounted and a run in flight keeps running, which is the whole
// reason it does not live in a pane.
//
// Mobile does not render this. The phone has no room for a floating
// window and already has a Co-pilot tab, which mounts the same
// conversation.

import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { AssistantOrbButton } from './assistant-orb-button'
import { AssistantChatWindow } from './assistant-chat-window'
import { AssistantConversation } from './assistant-conversation'
import type { Persona } from '@/components/copilot/persona-menu'
import type { AssistantConversationHandle } from './assistant-conversation'
import type { AssistantRunStatus } from '@/lib/assistant-core/run-status'
import { useAssistantStore } from '@/stores/assistant-store'
import { useAssistantSurfaces } from '@/lib/assistant-core/surface-registry'
import { PersonaMenu } from '@/components/copilot/persona-menu'
import { usePersistedState } from '@/hooks/use-persisted-state'

const IDLE_STATUS: AssistantRunStatus = { phase: 'idle', toolName: null }

export function AssistantDock() {
  const { t } = useTranslation()
  const isOpen = useAssistantStore((state) => state.isOpen)
  const toggle = useAssistantStore((state) => state.toggle)
  const close = useAssistantStore((state) => state.close)

  const [runStatus, setRunStatus] = useState<AssistantRunStatus>(IDLE_STATUS)
  const controlsRef = useRef<AssistantConversationHandle | null>(null)
  // Owned here rather than in the conversation: the control that changes
  // it sits in this window's header. The key is the copilot's old one, so
  // a user's existing choice carries over.
  const [persona, setPersona] = usePersistedState<Persona>(
    'copilot.persona',
    'balanced',
  )

  // Re-renders when a surface mounts, unmounts or bumps its revision,
  // which is exactly when the companion line can change.
  const registry = useAssistantSurfaces()
  const suggestion = registry.getSuggestion()

  const handleStatusChange = useCallback((status: AssistantRunStatus) => {
    setRunStatus(status)
  }, [])

  const busy = runStatus.phase !== 'idle'
  const label = busy
    ? statusLabel(runStatus, t)
    : suggestion
      ? t(suggestion.key, suggestion.values)
      : t('assistantDock.defaultSuggestion')

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {/*
        No `pointer-events-auto` here. The window is hidden, never unmounted,
        so its 420x620 box stays in the layout while collapsed — enabling hits
        on this wrapper parks an invisible target over the bottom-right of the
        workspace and eats wheel events aimed at the pane underneath (the news
        column on the Discovery board). The window sets its own pointer-events
        from `open`, so the collapsed box stays inert and the open one doesn't.
      */}
      <div>
        <AssistantChatWindow
          open={isOpen}
          onClose={close}
          title={t('assistantDock.title')}
          subtitle={busy ? statusLabel(runStatus, t) : null}
          closeLabel={t('assistantDock.close')}
          headerActions={
            <>
              <PersonaMenu persona={persona} onPersonaChange={setPersona} />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={t('assistantDock.clear')}
                      onClick={() => controlsRef.current?.clear()}
                    >
                      <Eraser className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent>{t('assistantDock.clear')}</TooltipContent>
              </Tooltip>
            </>
          }
        >
          <AssistantConversation
            onStatusChange={handleStatusChange}
            controlsRef={controlsRef}
            persona={persona}
          />
        </AssistantChatWindow>
      </div>

      <div className="pointer-events-auto">
        <AssistantOrbButton
          label={label}
          busy={busy}
          open={isOpen}
          openLabel={t('assistantDock.open')}
          closeLabel={t('assistantDock.close')}
          onClick={toggle}
        />
      </div>
    </div>
  )
}

function statusLabel(
  status: AssistantRunStatus,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (status.phase === 'search') return t('assistantDock.statusSearching')
  if (status.phase === 'tool') return t('assistantDock.statusUsingTools')
  return t('assistantDock.statusThinking')
}
