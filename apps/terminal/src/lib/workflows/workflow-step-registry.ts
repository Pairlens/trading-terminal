// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Workflow Step Registry ────────────────────────────────────────────
//
// Dynamic registry for plugin-contributed workflow step types.
// Mirrors the DynamicPaneRegistry pattern — plugin lifecycle hooks
// register/unregister entries, and React consumers subscribe via
// useSyncExternalStore.

import { createContext, memo, useContext, useSyncExternalStore } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { WorkflowStepTypeDefinition } from '@pairlens/workflow-engine/step-registry'

// ── Types ────────────────────────────────────────────────────────────

export type WorkflowStepRegistryEntry = {
  definition: WorkflowStepTypeDefinition
  component: LazyExoticComponent<ComponentType> | ComponentType
  iconComponent?: ComponentType<{ className?: string }>
  pluginId: string
}

// ── Registry ─────────────────────────────────────────────────────────

export class WorkflowStepRegistry {
  private entries = new Map<string, WorkflowStepRegistryEntry>()
  private pluginSteps = new Map<string, Set<string>>() // pluginId → step type keys
  private version = 0
  private listeners = new Set<() => void>()
  private stepTypesCache: Record<string, ComponentType> | null = null

  // ── Registration ──────────────────────────────────────────────────

  registerPluginSteps(
    pluginId: string,
    definitions: Array<WorkflowStepTypeDefinition>,
    components: Record<
      string,
      LazyExoticComponent<ComponentType> | ComponentType
    >,
    icons?: Record<string, ComponentType<{ className?: string }>>,
  ): void {
    const keys = new Set<string>()

    for (const def of definitions) {
      const component = components[def.type]
      if (!component) continue

      this.entries.set(def.type, {
        definition: def,
        component,
        iconComponent: icons?.[def.type],
        pluginId,
      })
      keys.add(def.type)
    }

    this.pluginSteps.set(pluginId, keys)
    this.bump()
  }

  unregisterPluginSteps(pluginId: string): void {
    const keys = this.pluginSteps.get(pluginId)
    if (!keys) return

    for (const key of keys) {
      this.entries.delete(key)
    }
    this.pluginSteps.delete(pluginId)
    this.bump()
  }

  // ── Queries ───────────────────────────────────────────────────────

  getEntry(type: string): WorkflowStepRegistryEntry | undefined {
    return this.entries.get(type)
  }

  getDefinition(type: string): WorkflowStepTypeDefinition | undefined {
    return this.entries.get(type)?.definition
  }

  getAllDefinitions(): Array<WorkflowStepTypeDefinition> {
    return [...this.entries.values()].map((e) => e.definition)
  }

  getIconComponent(type: string): ComponentType<{ className?: string }> | null {
    return this.entries.get(type)?.iconComponent ?? null
  }

  /** Returns the set of step type keys for a plugin (for cleanup). */
  getPluginStepTypes(pluginId: string): Set<string> | undefined {
    return this.pluginSteps.get(pluginId)
  }

  /**
   * Returns a stable record of { stepType → memoized React component }
   * suitable for passing to ReactFlow's `nodeTypes` prop.
   * The cache is invalidated only when registrations change.
   */
  getReactFlowStepTypes(): Record<string, ComponentType> {
    if (this.stepTypesCache) return this.stepTypesCache
    const result: Record<string, ComponentType> = {}
    for (const [key, entry] of this.entries) {
      result[key] = memo(entry.component as ComponentType)
    }
    this.stepTypesCache = result
    return result
  }

  // ── useSyncExternalStore ──────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): number => {
    return this.version
  }

  private bump(): void {
    this.version++
    this.stepTypesCache = null
    for (const listener of this.listeners) {
      listener()
    }
  }
}

// ── React context + hook ────────────────────────────────────────────

export const WorkflowStepRegistryContext =
  createContext<WorkflowStepRegistry | null>(null)

export function useWorkflowStepRegistry(): WorkflowStepRegistry {
  const registry = useContext(WorkflowStepRegistryContext)
  if (!registry) {
    throw new Error(
      'useWorkflowStepRegistry must be used within a WorkflowStepRegistryContext.Provider',
    )
  }
  useSyncExternalStore(registry.subscribe, registry.getSnapshot)
  return registry
}
