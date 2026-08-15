// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The workflow on the canvas, published to the assistant ───────────
//
// "What am I looking at" used to answer "the workflows page", which is
// true and useless. The page knows exactly which order plan is open, how
// many steps it has and whether the canvas is holding uncommitted edits,
// so it says all of that — and names the tool that reads the rest, so
// the model reaches for `get_workflow` instead of asking the user.

import type { WorkflowDSL } from '@pairlens/workflow-engine/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'
import { useWorkflowStore } from '@/stores/workflow-store'

export function WorkflowsAssistantSurface({
  workflow,
  count,
}: {
  /** The workflow open on the canvas, or null when none is selected. */
  workflow: WorkflowDSL | null
  /** How many the user has saved, so an empty canvas is explicable. */
  count: number
}) {
  useAssistantSurface({
    id: 'page:workflows',
    // Above the bare route surface, below a chart: on this page the
    // workflow IS what "this" means.
    getPriority: () => 60,
    revision: workflow?.id ?? 'none',
    getContext: () => {
      if (!workflow) {
        return {
          summary:
            count > 0
              ? `The user is on the Workflows page with no workflow selected. They have ${count} saved; list_workflows names them.`
              : 'The user is on the Workflows page and has no workflows yet. create_workflow starts one.',
        }
      }

      // Read the draft live: the canvas may be holding edits that the
      // saved workflow does not have yet, and answering from the saved
      // copy alone would describe a screen the user is not seeing.
      const state = useWorkflowStore.getState()
      const draft = state.draft?.workflowId === workflow.id ? state.draft : null
      const steps = draft?.currentSteps ?? workflow.steps
      const edges = draft?.currentEdges ?? workflow.edges

      return {
        summary: `The user is editing the workflow "${workflow.name}" (id ${workflow.id}) on the Workflows canvas. Read its full definition with get_workflow, and edit it with update_workflow.`,
        detail: {
          workflowId: workflow.id,
          name: workflow.name,
          steps: steps.length,
          stepTypes: [...new Set(steps.map((step) => step.type))],
          connections: edges.length,
          uncommittedChanges: (draft?.pendingChanges.length ?? 0) > 0,
          savedWorkflows: count,
        },
      }
    },
    getSuggestion: () =>
      workflow
        ? {
            key: 'assistantDock.suggest.workflowSelected',
            values: { name: workflow.name },
          }
        : { key: 'assistantDock.suggest.workflows' },
  })

  return null
}
