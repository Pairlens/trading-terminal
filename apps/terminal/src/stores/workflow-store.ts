// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type {
  WorkflowDSL,
  WorkflowEdgeDSL,
  WorkflowStepDSL,
} from '@pairlens/workflow-engine/types'
import { track } from '@/lib/analytics-events'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Storage Keys ─────────────────────────────────────────────────────

const WORKFLOWS_KEY = 'pairlens:workflows'
const DRAFT_KEY = 'pairlens:workflow-draft'

// ── Change Tracking ──────────────────────────────────────────────────

type ChangeType =
  | 'step-added'
  | 'step-removed'
  | 'step-moved'
  | 'step-data-changed'
  | 'edge-added'
  | 'edge-removed'

type ChangeRecord = {
  id: string
  type: ChangeType
  timestamp: number
  payload: Record<string, unknown>
}

// ── Draft State ──────────────────────────────────────────────────────

type WorkflowDraft = {
  workflowId: string
  baseSnapshot: WorkflowDSL
  currentSteps: Array<WorkflowStepDSL>
  currentEdges: Array<WorkflowEdgeDSL>
  pendingChanges: Array<ChangeRecord>
}

// ── Diff Types ───────────────────────────────────────────────────────

export type WorkflowDiff = {
  addedSteps: Array<WorkflowStepDSL>
  removedSteps: Array<WorkflowStepDSL>
  modifiedSteps: Array<{ before: WorkflowStepDSL; after: WorkflowStepDSL }>
  addedEdges: Array<WorkflowEdgeDSL>
  removedEdges: Array<WorkflowEdgeDSL>
}

// ── Storage Helpers ──────────────────────────────────────────────────

function migrateWorkflow(w: Record<string, unknown>): WorkflowDSL {
  // Migrate old "nodes" field to "steps"
  if ('nodes' in w && !('steps' in w)) {
    w.steps = w.nodes
    delete w.nodes
  }
  return w as unknown as WorkflowDSL
}

function loadWorkflows(): Array<WorkflowDSL> {
  try {
    const raw = localStorage.getItem(WORKFLOWS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(migrateWorkflow)
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveWorkflows(workflows: Array<WorkflowDSL>) {
  try {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows))
  } catch {
    // Ignore quota errors
  }
  emitWrite('workflows', workflows)
}

function loadDraft(): WorkflowDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const draft = JSON.parse(raw) as Record<string, unknown>
      // Migrate old "currentNodes" → "currentSteps"
      if ('currentNodes' in draft && !('currentSteps' in draft)) {
        draft.currentSteps = draft.currentNodes
        delete draft.currentNodes
      }
      // Migrate baseSnapshot.nodes → baseSnapshot.steps
      const snap = draft.baseSnapshot as Record<string, unknown> | undefined
      if (snap && 'nodes' in snap && !('steps' in snap)) {
        snap.steps = snap.nodes
        delete snap.nodes
      }
      return draft as unknown as WorkflowDraft
    }
  } catch {
    // Ignore corrupted data
  }
  return null
}

function saveDraft(draft: WorkflowDraft | null) {
  try {
    if (draft) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } else {
      localStorage.removeItem(DRAFT_KEY)
    }
  } catch {
    // Ignore quota errors
  }
}

function recordChange(
  type: ChangeType,
  payload: Record<string, unknown>,
): ChangeRecord {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  }
}

// ── Store ────────────────────────────────────────────────────────────

type WorkflowStore = {
  workflows: Array<WorkflowDSL>
  loaded: boolean
  activeWorkflowId: string | null
  draft: WorkflowDraft | null

  // Lifecycle
  load: () => void

  // Workflow CRUD
  createWorkflow: (name: string) => string
  deleteWorkflow: (id: string) => void
  renameWorkflow: (id: string, name: string) => void
  selectWorkflow: (id: string | null) => void

  // Draft management
  startEditing: (workflowId: string) => void
  hasPendingDraft: () => boolean
  resumeDraft: () => void
  addStep: (step: WorkflowStepDSL) => void
  removeStep: (stepId: string) => void
  updateStepPosition: (
    stepId: string,
    position: { x: number; y: number },
  ) => void
  updateStepData: (stepId: string, data: Record<string, unknown>) => void
  addEdge: (edge: WorkflowEdgeDSL) => void
  removeEdge: (edgeId: string) => void
  setSteps: (steps: Array<WorkflowStepDSL>) => void
  setEdges: (edges: Array<WorkflowEdgeDSL>) => void

  // Railway-style commit/discard
  commitDraft: () => void
  discardDraft: () => void
  hasPendingChanges: () => boolean
  getPendingDiff: () => WorkflowDiff
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  loaded: false,
  activeWorkflowId: null,
  draft: null,

  load() {
    if (get().loaded) return
    const workflows = loadWorkflows()
    const draft = loadDraft()
    set({
      workflows,
      loaded: true,
      draft,
      activeWorkflowId: draft?.workflowId ?? null,
    })
  },

  createWorkflow(name: string) {
    const id = crypto.randomUUID()
    const now = Date.now()
    const workflow: WorkflowDSL = {
      version: 1,
      id,
      name,
      steps: [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {},
        },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }
    const next = [...get().workflows, workflow]
    set({ workflows: next })
    saveWorkflows(next)
    track('workflow_saved', { step_count: workflow.steps.length })
    return id
  },

  deleteWorkflow(id: string) {
    const state = get()
    const next = state.workflows.filter((w) => w.id !== id)
    const updates: Partial<WorkflowStore> = { workflows: next }

    // Clear draft if it belongs to the deleted workflow
    if (state.draft?.workflowId === id) {
      updates.draft = null
      saveDraft(null)
    }
    if (state.activeWorkflowId === id) {
      updates.activeWorkflowId = null
    }

    set(updates)
    saveWorkflows(next)
  },

  renameWorkflow(id: string, name: string) {
    const { workflows, draft } = get()
    const next = workflows.map((w) =>
      w.id === id ? { ...w, name, updatedAt: Date.now() } : w,
    )
    set({ workflows: next })
    saveWorkflows(next)
    // Also update the draft's base snapshot if editing this workflow
    if (draft?.workflowId === id) {
      const updated = {
        ...draft,
        baseSnapshot: { ...draft.baseSnapshot, name },
      }
      set({ draft: updated })
      saveDraft(updated)
    }
  },

  selectWorkflow(id: string | null) {
    set({ activeWorkflowId: id })
  },

  startEditing(workflowId: string) {
    const workflow = get().workflows.find((w) => w.id === workflowId)
    if (!workflow) return

    const draft: WorkflowDraft = {
      workflowId,
      baseSnapshot: structuredClone(workflow),
      currentSteps: structuredClone(workflow.steps),
      currentEdges: structuredClone(workflow.edges),
      pendingChanges: [],
    }
    set({ draft, activeWorkflowId: workflowId })
    saveDraft(draft)
  },

  hasPendingDraft() {
    return loadDraft() !== null
  },

  resumeDraft() {
    const draft = loadDraft()
    if (draft) {
      set({ draft, activeWorkflowId: draft.workflowId })
    }
  },

  addStep(step: WorkflowStepDSL) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentSteps: [...draft.currentSteps, step],
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-added', { stepId: step.id, type: step.type }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  removeStep(stepId: string) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentSteps: draft.currentSteps.filter((n) => n.id !== stepId),
      // Also remove connected edges
      currentEdges: draft.currentEdges.filter(
        (e) => e.source !== stepId && e.target !== stepId,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-removed', { stepId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  updateStepPosition(stepId: string, position: { x: number; y: number }) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentSteps: draft.currentSteps.map((n) =>
        n.id === stepId ? { ...n, position } : n,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-moved', { stepId, position }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  updateStepData(stepId: string, data: Record<string, unknown>) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentSteps: draft.currentSteps.map((n) =>
        n.id === stepId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('step-data-changed', { stepId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  addEdge(edge: WorkflowEdgeDSL) {
    const { draft } = get()
    if (!draft) return

    // Prevent duplicate edges (by ID or by same source+target pair)
    if (draft.currentEdges.some((e) => e.id === edge.id)) return
    if (
      draft.currentEdges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          (e.sourceHandle ?? null) === (edge.sourceHandle ?? null),
      )
    )
      return

    const updated: WorkflowDraft = {
      ...draft,
      currentEdges: [...draft.currentEdges, edge],
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('edge-added', { edgeId: edge.id }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  removeEdge(edgeId: string) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentEdges: draft.currentEdges.filter((e) => e.id !== edgeId),
      pendingChanges: [
        ...draft.pendingChanges,
        recordChange('edge-removed', { edgeId }),
      ],
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  setSteps(steps: Array<WorkflowStepDSL>) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentSteps: steps,
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  setEdges(edges: Array<WorkflowEdgeDSL>) {
    const { draft } = get()
    if (!draft) return

    const updated: WorkflowDraft = {
      ...draft,
      currentEdges: edges,
    }
    set({ draft: updated })
    saveDraft(updated)
  },

  commitDraft() {
    const { draft, workflows } = get()
    if (!draft) return

    const now = Date.now()
    const committed: WorkflowDSL = {
      ...draft.baseSnapshot,
      steps: draft.currentSteps,
      edges: draft.currentEdges,
      updatedAt: now,
    }

    const next = workflows.map((w) => (w.id === committed.id ? committed : w))
    track('workflow_saved', { step_count: committed.steps.length })

    // Re-enter editing with the committed state as the new base snapshot
    // so the user stays on the same workflow instead of being kicked out
    const freshDraft: WorkflowDraft = {
      workflowId: committed.id,
      baseSnapshot: structuredClone(committed),
      currentSteps: structuredClone(committed.steps),
      currentEdges: structuredClone(committed.edges),
      pendingChanges: [],
    }

    set({ workflows: next, draft: freshDraft })
    saveWorkflows(next)
    saveDraft(freshDraft)
  },

  discardDraft() {
    set({ draft: null })
    saveDraft(null)
  },

  hasPendingChanges() {
    const { draft } = get()
    if (!draft) return false
    return draft.pendingChanges.length > 0
  },

  getPendingDiff(): WorkflowDiff {
    const { draft } = get()
    if (!draft) {
      return {
        addedSteps: [],
        removedSteps: [],
        modifiedSteps: [],
        addedEdges: [],
        removedEdges: [],
      }
    }

    const baseStepMap = new Map(draft.baseSnapshot.steps.map((n) => [n.id, n]))
    const currentStepMap = new Map(draft.currentSteps.map((n) => [n.id, n]))
    const baseEdgeMap = new Map(draft.baseSnapshot.edges.map((e) => [e.id, e]))
    const currentEdgeMap = new Map(draft.currentEdges.map((e) => [e.id, e]))

    const addedSteps = draft.currentSteps.filter((n) => !baseStepMap.has(n.id))
    const removedSteps = draft.baseSnapshot.steps.filter(
      (n) => !currentStepMap.has(n.id),
    )
    const modifiedSteps: WorkflowDiff['modifiedSteps'] = []
    for (const [id, before] of baseStepMap) {
      const after = currentStepMap.get(id)
      if (after && JSON.stringify(before.data) !== JSON.stringify(after.data)) {
        modifiedSteps.push({ before, after })
      }
    }

    const addedEdges = draft.currentEdges.filter((e) => !baseEdgeMap.has(e.id))
    const removedEdges = draft.baseSnapshot.edges.filter(
      (e) => !currentEdgeMap.has(e.id),
    )

    return { addedSteps, removedSteps, modifiedSteps, addedEdges, removedEdges }
  },
}))

// Cross-window hydration: workflow edits committed in a sibling window
// replace this window's committed list. Drafts stay window-local.
onHydrate((key, value) => {
  if (key !== 'workflows' || !Array.isArray(value)) return
  useWorkflowStore.setState({ workflows: value as Array<WorkflowDSL> })
})
