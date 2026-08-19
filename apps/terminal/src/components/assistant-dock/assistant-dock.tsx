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
// The window carries the thread rail down its left: every conversation
// the user has had on this device, none of them anywhere else. Deleting
// one is the only destructive control in the header, and it confirms.
//
// Mobile renders none of this. The phone has no room for a floating
// window and already has an Assistant tab, which mounts the same
// conversation and reaches the same rail through its own control.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Trash2 } from 'lucide-react'

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
import {
  AssistantConversationList,
  AssistantDeleteConversationDialog,
  useDeleteConversationPrompt,
} from './assistant-conversation-list'
import type { Persona } from '@/components/copilot/persona-menu'
import type { AssistantRunStatus } from '@/lib/assistant-core/run-status'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { PersonaMenu } from '@/components/copilot/persona-menu'
import {
  ASSISTANT_WINDOW_ANCHOR,
  useAssistantPlacement,
} from '@/lib/assistant-core/placement'
import { useAssistantOrbLabel } from '@/lib/assistant-core/use-orb-label'
import { useWindowDrag } from '@/lib/assistant-core/use-window-drag'
import { useAssistantWindowOrigin } from '@/lib/assistant-core/use-window-origin'
import {
  toggleAssistantFrom,
  useAssistantStore,
} from '@/stores/assistant-store'
import { useAssistantConversationsStore } from '@/stores/assistant-conversations-store'

export function AssistantDock() {
  const { t } = useTranslation()
  const isOpen = useAssistantStore((state) => state.isOpen)
  const close = useAssistantStore((state) => state.close)
  const setRunStatus = useAssistantStore((state) => state.setRunStatus)
  const [placement] = useAssistantPlacement()

  const deletePrompt = useDeleteConversationPrompt()
  // Read here rather than through the chat: the rail and this button are
  // both above the capability gates, and a signed-out user still has
  // threads on this device to manage.
  const activeConversationId = useAssistantConversationsStore(
    (state) => state.activeId,
  )
  const { label, busy } = useAssistantOrbLabel()
  const shortcut = useKeybindingLabel('general.toggleAssistant')
  // Owned here rather than in the conversation: the control that changes
  // it sits in this window's header. The key is the copilot's old one,
  // so a user's existing choice carries over.
  const [persona, setPersona] = usePersistedState<Persona>(
    'copilot.persona',
    'balanced',
  )

  const drag = useWindowDrag()
  // Read off the wrapper below rather than the window itself, which
  // carries the transform this is computing.
  const { frameRef, origin } = useAssistantWindowOrigin(placement, isOpen)

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
    shortcut,
    onClick: () => toggleAssistantFrom('orb'),
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
          unmounted, so its 616x660 box stays in the layout while
          collapsed: enabling hits on this wrapper parks an invisible
          target over the workspace and eats wheel events aimed at the
          pane underneath (the news column on the Discovery board). The
          window sets its own pointer-events from `open`, so the
          collapsed box stays inert and the open one does not.
        */}
        <div ref={frameRef}>
          <AssistantChatWindow
            windowRef={drag.windowRef}
            origin={origin}
            open={isOpen}
            onClose={close}
            title={t('assistantDock.title')}
            // The orb's own line, busy or idle. Idle it is the suggestion the
            // collapsed orb was showing, so opening the window never loses the
            // context that made the user open it.
            subtitle={label}
            busy={busy}
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
                          className="text-muted-foreground hover:text-foreground size-[26px] rounded-[10px]"
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
                {/* Was a one-click eraser that emptied the only thread there
                    was. Now there are many and they are kept, so it deletes
                    the one on screen and asks first. */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive size-[26px] rounded-[10px]"
                        aria-label={t('assistantDock.conversations.delete')}
                        disabled={!activeConversationId}
                        onClick={() => {
                          if (activeConversationId) {
                            deletePrompt.requestDelete(activeConversationId)
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {t('assistantDock.conversations.delete')}
                  </TooltipContent>
                </Tooltip>
              </>
            }
            sidebar={
              <AssistantConversationList
                onRequestDelete={deletePrompt.requestDelete}
              />
            }
          >
            <AssistantConversation
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

      {/* One dialog for every way of deleting a thread: the header button
          and any row in the rail. */}
      <AssistantDeleteConversationDialog
        open={deletePrompt.pendingId !== null}
        target={deletePrompt.target}
        onCancel={deletePrompt.cancel}
        onConfirm={deletePrompt.confirm}
      />
    </>
  )
}
