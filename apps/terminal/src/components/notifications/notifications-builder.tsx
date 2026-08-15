// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Notifications page: a list of alerts, whatever the selected one needs to
 * be edited with, and the assistant rail beside both.
 *
 * Which editor that is depends on the rule, not on a mode the user picks —
 * a rule matching the simple-alert shape opens as a form, everything else
 * opens on the canvas. ReactFlow is only mounted for the second case, so the
 * common path never pays for the graph editor at all.
 *
 * The assistant sits outside that split on purpose: "tell me when BTC hits
 * 100k" is one sentence either way, and it is the assistant's job, not the
 * user's, to know that the sentence needs no canvas.
 */
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'

import { NotificationsSidebar } from './notifications-sidebar'
import { NotificationCanvas } from './notification-canvas'
import { SimpleAlertEditor } from './simple-alert-editor'
import { useSimpleAlertView } from './use-simple-alert-view'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import {
  hasAssistantIntent,
  subscribeAssistantIntents,
} from '@/lib/assistant/assistant-chat-cache'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationsBuilder() {
  const load = useNotificationStore((s) => s.load)
  const activeRuleId = useNotificationStore((s) => s.activeRuleId)
  const simpleView = useSimpleAlertView(activeRuleId)
  const [assistantOpen, setAssistantOpen] = usePersistedState<boolean>(
    'assistant.notifications.open',
    true,
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const open = () => {
      if (hasAssistantIntent('notifications')) setAssistantOpen(true)
    }
    open()
    return subscribeAssistantIntents(open)
  }, [setAssistantOpen])

  return (
    <div className="flex h-full min-h-0">
      <NotificationsSidebar
        assistantOpen={assistantOpen}
        onToggleAssistant={() => setAssistantOpen(!assistantOpen)}
      />
      <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="notifications-main" defaultSize={72} minSize={40}>
          <div className="flex h-full min-w-0 flex-1">
            {simpleView && activeRuleId ? (
              <SimpleAlertEditor key={activeRuleId} ruleId={activeRuleId} />
            ) : (
              <ReactFlowProvider>
                <NotificationCanvas />
              </ReactFlowProvider>
            )}
          </div>
        </ResizablePanel>
        {assistantOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="notifications-assistant"
              defaultSize={28}
              minSize={18}
            >
              <AssistantPanel
                surface="notifications"
                onClose={() => setAssistantOpen(false)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
