// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The assistant dock ───────────────────────────────────────────────
//
// Mounted outside the routed content, so it is the same assistant on
// the chart, on the bots page and in the workbench. Collapsing it hides
// the window and nothing else: the conversation stays mounted and a run
// in flight keeps running, which is the whole reason it does not live
// in a pane.
//
// Three placements, and this file owns two of them. Floating puts the
// orb and its suggestion over the bottom-right of the workspace; bottom
// puts the same pair in a reserved strip below it (see
// AssistantBottomBar). For the nav rail the shell renders the orb
// itself (see AssistantSidebarOrb) and only the window lives here.
// Either way the user can drag the window wherever they want it.
//
// Mobile renders none of this. The phone has no room for a floating
// window and already has an Assistant tab, which mounts the same
// conversation.

import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser, RotateCcw } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { AssistantOrbButton } from './assistant-orb-button'
import { AssistantBottomBar } from './assistant-bottom-bar'
import { AssistantChatWindow } from './assistant-chat-window'
import { AssistantConversation } from './assistant-conversation'
import type { Persona } from '@/components/copilot/persona-menu'
import type { AssistantRunStatus } from '@/lib/assistant-core/run-status'
import type { AssistantConversationHandle } from './assistant-conversation'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { PersonaMenu } from '@/components/copilot/persona-menu'
import {
  ASSISTANT_WINDOW_ANCHOR,
  useAssistantPlacement,
} from '@/lib/assistant-core/placement'
import { useAssistantOrbLabel } from '@/lib/assistant-core/use-orb-label'
import { useWindowDrag } from '@/lib/assistant-core/use-window-drag'
import { useAssistantStore } from '@/stores/assistant-store'

export function AssistantDock() {
  const { t } = useTranslation()
  const isOpen = useAssistantStore((state) => state.isOpen)
  const close = useAssistantStore((state) => state.close)
  const toggle = useAssistantStore((state) => state.toggle)
  const setRunStatus = useAssistantStore((state) => state.setRunStatus)
  const [placement] = useAssistantPlacement()

  const controlsRef = useRef<AssistantConversationHandle | null>(null)
  const { label, busy } = useAssistantOrbLabel()
  // Owned here rather than in the conversation: the control that changes
  // it sits in this window's header. The key is the copilot's old one,
  // so a user's existing choice carries over.
  const [persona, setPersona] = usePersistedState<Persona>(
    'copilot.persona',
    'balanced',
  )

  const drag = useWindowDrag()

  // Straight into the store, so the nav-rail orb sees the same phase
  // without the shell that hosts it re-rendering per token.
  const handleStatusChange = useCallback(
    (status: AssistantRunStatus) => setRunStatus(status.phase, status.toolName),
    [setRunStatus],
  )

  // The same orb whichever of the two placements below renders it. Only
  // the surface it sits on differs, and that is the bar's business.
  const orbProps = {
    label,
    busy,
    open: isOpen,
    openLabel: t('assistantDock.open'),
    closeLabel: t('assistantDock.close'),
    onClick: toggle,
  }

  return (
    <>
      <div
        className={`pointer-events-none fixed z-40 ${
          drag.style ? 'top-0 left-0' : ASSISTANT_WINDOW_ANCHOR[placement]
        }`}
        style={drag.style}
      >
        {/*
          No `pointer-events-auto` here. The window is hidden, never
          unmounted, so its 420x620 box stays in the layout while
          collapsed: enabling hits on this wrapper parks an invisible
          target over the workspace and eats wheel events aimed at the
          pane underneath (the news column on the Discovery board). The
          window sets its own pointer-events from `open`, so the
          collapsed box stays inert and the open one does not.
        */}
        <div>
          <AssistantChatWindow
            windowRef={drag.windowRef}
            open={isOpen}
            onClose={close}
            title={t('assistantDock.title')}
            subtitle={busy ? label : null}
            closeLabel={t('assistantDock.close')}
            dragging={drag.dragging}
            dragHandleProps={drag.dragHandleProps}
            headerActions={
              <>
                {drag.isCustom ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7"
                          aria-label={t('assistantDock.resetPosition')}
                          onClick={drag.reset}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>
                      {t('assistantDock.resetPosition')}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
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
              controlsRef={controlsRef}
              persona={persona}
              onStatusChange={handleStatusChange}
            />
          </AssistantChatWindow>
        </div>
      </div>

      {placement === 'floating' ? (
        <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex justify-end">
          <div className="pointer-events-auto">
            <AssistantOrbButton {...orbProps} />
          </div>
        </div>
      ) : null}

      {placement === 'bottom' ? <AssistantBottomBar {...orbProps} /> : null}
    </>
  )
}
