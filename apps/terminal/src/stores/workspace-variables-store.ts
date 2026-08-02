// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createStore } from 'zustand'
import type { StoreApi } from 'zustand'

import type { WorkspaceVariableDefinition } from '@/lib/layout/types'
import { reconcileValues } from '@/lib/layout/variable-utils'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

export type WorkspaceVariablesState = {
  values: Record<string, unknown>
  setVariableValue: (name: string, value: unknown) => void
  /**
   * Align stored values with the current variable definitions: drop values
   * for removed variables, drop values whose shape no longer matches the
   * variable type (e.g. after a pair → timeframe type change), and fill
   * missing values from defaults.
   */
  reconcile: (variables: Array<WorkspaceVariableDefinition>) => void
  /** Replace values from a cross-window/cloud hydrate — never re-persists. */
  hydrateValues: (values: Record<string, unknown>) => void
}

// ── Store Registry (explicit lifecycle, no leaks) ──────────────────────

const storeRegistry = new Map<string, StoreApi<WorkspaceVariablesState>>()

const STORAGE_PREFIX = 'pairlens:workspace-vars:'
// Sync-channel key (localStorage key minus the 'pairlens:' prefix) — the
// SyncCoordinator already routes 'workspace-vars:<id>' writes to the cloud,
// and the channel bridges them to sibling windows.
const SYNC_PREFIX = 'workspace-vars:'
const PERSIST_DEBOUNCE_MS = 300

function loadPersistedValues(workspaceId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + workspaceId)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>
      }
    }
  } catch {
    // Corrupted data — return empty, workspace will use defaults
  }
  return {}
}

function persistNow(workspaceId: string, values: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(values))
  } catch {
    // Ignore quota errors
  }
  emitWrite(SYNC_PREFIX + workspaceId, values)
}

// One pending persist per workspace — a write in one workspace must never
// cancel another's. The flush closure reads the latest values from the store
// that scheduled it, NOT from the registry: the React tree can outlive a
// registry entry (StrictMode effect cycles destroy and re-register), and a
// registry lookup at fire time would silently drop those writes.
const pendingPersists = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; flush: () => void }
>()

function persistDebounced(
  workspaceId: string,
  getValues: () => Record<string, unknown>,
) {
  const existing = pendingPersists.get(workspaceId)
  if (existing) clearTimeout(existing.timer)
  const flush = () => {
    pendingPersists.delete(workspaceId)
    persistNow(workspaceId, getValues())
  }
  pendingPersists.set(workspaceId, {
    timer: setTimeout(flush, PERSIST_DEBOUNCE_MS),
    flush,
  })
}

/** Write any pending debounced values immediately. */
export function flushVarStorePersist(workspaceId: string): void {
  const pending = pendingPersists.get(workspaceId)
  if (!pending) return
  clearTimeout(pending.timer)
  pending.flush()
}

export function getOrCreateVarStore(
  workspaceId: string,
): StoreApi<WorkspaceVariablesState> {
  const existing = storeRegistry.get(workspaceId)
  if (existing) return existing

  const persisted = loadPersistedValues(workspaceId)

  const store = createStore<WorkspaceVariablesState>((set, get) => ({
    values: persisted,

    setVariableValue(name, value) {
      set({ values: { ...get().values, [name]: value } })
      persistDebounced(workspaceId, () => get().values)
    },

    reconcile(variables) {
      const result = reconcileValues(variables, get().values)
      if (result.changed) {
        set({ values: result.values })
        persistDebounced(workspaceId, () => get().values)
      }
    },

    hydrateValues(values) {
      set({ values })
    },
  }))

  storeRegistry.set(workspaceId, store)
  return store
}

export function destroyVarStore(workspaceId: string): void {
  flushVarStorePersist(workspaceId)
  storeRegistry.delete(workspaceId)
}

/**
 * Re-insert a store the React tree still holds. StrictMode runs the
 * provider's cleanup (destroyVarStore) and then re-runs the effect without
 * re-running useMemo — without re-registration, cross-window hydrates would
 * stop reaching the live store.
 */
export function ensureVarStoreRegistered(
  workspaceId: string,
  store: StoreApi<WorkspaceVariablesState>,
): void {
  if (!storeRegistry.has(workspaceId)) {
    storeRegistry.set(workspaceId, store)
  }
}

// Cross-window / cloud hydration: a sibling window (or the SyncCoordinator)
// already persisted the values — only refresh in-memory state here, never
// re-persist (would loop back through the sync channel).
onHydrate((key, value) => {
  if (!key.startsWith(SYNC_PREFIX)) return
  const workspaceId = key.slice(SYNC_PREFIX.length)
  const store = storeRegistry.get(workspaceId)
  if (!store) return
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    store.getState().hydrateValues(value as Record<string, unknown>)
  }
})
