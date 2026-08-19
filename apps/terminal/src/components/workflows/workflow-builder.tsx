// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Workflows page: the list of order plans, and the canvas.
 *
 * Same shell as the script workbench and the Bots page. What the assistant
 * writes here lands as uncommitted changes on the canvas, so the commit bar
 * stays the one thing that makes a workflow real.
 *
 * Which workflow is open lives in the URL (`?workflow=<id>`), not only in the
 * store: it makes a selection linkable, walkable with the back button, and
 * legible to the assistant.
 */
import { useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'

import { WorkflowSidebar } from './workflow-sidebar'
import { WorkflowCanvas } from './workflow-canvas'
import { WorkflowsAssistantSurface } from './workflows-assistant-surface'
import { PAGE_GROUND } from '@/components/chrome/page-chrome'
import { useSearchSelection } from '@/hooks/use-search-selection'
import { useWorkflowStore } from '@/stores/workflow-store'

export function WorkflowBuilder({
  workflowId = null,
}: {
  /** The workflow the URL is naming, already validated by the route. */
  workflowId?: string | null
} = {}) {
  const load = useWorkflowStore((s) => s.load)
  const loaded = useWorkflowStore((s) => s.loaded)
  const workflows = useWorkflowStore((s) => s.workflows)
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [load])

  // Opening from a link has to do what clicking the list does: select it
  // AND put it on the canvas. Selecting alone left the sidebar highlighting
  // a workflow the canvas was not showing.
  //
  // `startEditing` is skipped when the draft is already this workflow,
  // because it rebuilds the draft from the saved copy: a link to the
  // workflow you were mid-edit on must not throw those edits away. A
  // workflow that has since been deleted selects nothing, and the hook
  // then strips the dead id from the address.
  const select = useCallback((id: string) => {
    const store = useWorkflowStore.getState()
    if (!store.workflows.some((w) => w.id === id)) return false
    store.selectWorkflow(id)
    if (store.draft?.workflowId !== id) store.startEditing(id)
    return true
  }, [])

  const write = useCallback(
    (id: string | null, { replace }: { replace: boolean }) => {
      void navigate({
        to: '/workflows',
        search: id ? { workflow: id } : {},
        replace,
      })
    },
    [navigate],
  )

  useSearchSelection({
    param: workflowId,
    selected: activeWorkflowId,
    select,
    write,
    // Before the store has loaded, every id looks deleted.
    ready: loaded,
  })

  const active = workflows.find((w) => w.id === activeWorkflowId) ?? null

  return (
    // The canvas emits its own columns (the board plus the palette rail), so
    // it sits directly on the ground rather than inside a wrapper of its own.
    <div className={PAGE_GROUND}>
      <WorkflowsAssistantSurface workflow={active} count={workflows.length} />
      <WorkflowSidebar />
      <ReactFlowProvider>
        <WorkflowCanvas />
      </ReactFlowProvider>
    </div>
  )
}
