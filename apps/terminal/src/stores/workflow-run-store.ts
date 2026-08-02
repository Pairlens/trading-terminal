// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { WorkflowExecutionResult } from '@pairlens/workflow-engine/types'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Types ────────────────────────────────────────────────────────────

export type WorkflowRunRecord = {
  id: string
  timestamp: number
  pair: string
  market: string
  mode: 'paper' | 'live'
  result: WorkflowExecutionResult
}

// ── Storage ──────────────────────────────────────────────────────────

const RUNS_KEY = 'pairlens:workflow-runs'

/** Newest-first cap — enough to debug recent behavior without growing
 * localStorage unboundedly. */
const MAX_RUNS = 50

function loadRuns(): Array<WorkflowRunRecord> {
  try {
    const raw = localStorage.getItem(RUNS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<WorkflowRunRecord>
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveRuns(runs: Array<WorkflowRunRecord>) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs))
    emitWrite('workflow-runs', runs)
  } catch {
    // Ignore quota errors — don't emit write if persist failed
  }
}

// ── Store ────────────────────────────────────────────────────────────
// The execution toast is ephemeral (6s); this record is what lets a user
// answer "what did my workflow actually do?" after the fact.

type WorkflowRunStore = {
  runs: Array<WorkflowRunRecord>
  loaded: boolean

  load: () => void
  record: (run: Omit<WorkflowRunRecord, 'id'>) => void
  clear: () => void
}

export const useWorkflowRunStore = create<WorkflowRunStore>((set, get) => ({
  runs: [],
  loaded: false,

  load() {
    if (get().loaded) return
    set({ runs: loadRuns(), loaded: true })
  },

  record(run) {
    const next = [{ ...run, id: crypto.randomUUID() }, ...get().runs].slice(
      0,
      MAX_RUNS,
    )
    set({ runs: next })
    saveRuns(next)
  },

  clear() {
    set({ runs: [] })
    saveRuns([])
  },
}))

// Cross-window hydration: runs recorded in the executing window are
// mirrored to siblings.
onHydrate((key, value) => {
  if (key !== 'workflow-runs' || !Array.isArray(value)) return
  useWorkflowRunStore.setState({ runs: value as Array<WorkflowRunRecord> })
})
