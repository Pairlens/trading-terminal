// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Workflows page: the list of order plans, the canvas, and the assistant
 * rail beside it.
 *
 * Same shell as the script workbench and the Bots page, for the same reason:
 * describing an order plan in a sentence is faster than dragging six steps
 * into place, and a rail nobody opens teaches nobody that. What the assistant
 * writes lands as uncommitted changes on the canvas, so the commit bar stays
 * the one thing that makes a workflow real.
 */
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'

import { WorkflowSidebar } from './workflow-sidebar'
import { WorkflowCanvas } from './workflow-canvas'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import {
  hasAssistantIntent,
  subscribeAssistantIntents,
} from '@/lib/assistant/assistant-chat-cache'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useWorkflowStore } from '@/stores/workflow-store'

export function WorkflowBuilder() {
  const load = useWorkflowStore((s) => s.load)
  const [assistantOpen, setAssistantOpen] = usePersistedState<boolean>(
    'assistant.workflows.open',
    true,
  )

  useEffect(() => {
    load()
  }, [load])

  // The empty state's composer, the sidebar's Build with AI, or a handoff
  // arriving from another builder. The panel consumes the request; this only
  // has to make sure it is mounted to do so.
  useEffect(() => {
    const open = () => {
      if (hasAssistantIntent('workflows')) setAssistantOpen(true)
    }
    open()
    return subscribeAssistantIntents(open)
  }, [setAssistantOpen])

  return (
    <div className="flex h-full min-h-0">
      <WorkflowSidebar
        assistantOpen={assistantOpen}
        onToggleAssistant={() => setAssistantOpen(!assistantOpen)}
      />
      <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="workflows-main" defaultSize={72} minSize={40}>
          <div className="flex h-full min-w-0 flex-1">
            <ReactFlowProvider>
              <WorkflowCanvas />
            </ReactFlowProvider>
          </div>
        </ResizablePanel>
        {assistantOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="workflows-assistant"
              defaultSize={28}
              minSize={18}
            >
              <AssistantPanel
                surface="workflows"
                onClose={() => setAssistantOpen(false)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
