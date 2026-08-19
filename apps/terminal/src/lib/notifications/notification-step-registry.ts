// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Notification Step Registry ────────────────────────────────────────
//
// Dynamic registry for plugin-contributed notification step types.
// Mirrors the WorkflowStepRegistry pattern — plugin lifecycle hooks
// register/unregister entries, and React consumers subscribe via
// useSyncExternalStore.

import { createContext, memo, useContext, useSyncExternalStore } from 'react'
import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { NotificationStepTypeDefinition } from '@pairlens/notification-engine/step-registry'

// ── Types ────────────────────────────────────────────────────────────

export type NotificationStepRegistryEntry = {
  definition: NotificationStepTypeDefinition
  component: LazyExoticComponent<ComponentType> | ComponentType
  iconComponent?: ComponentType<{ className?: string }>
  pluginId: string
}

// ── Registry ─────────────────────────────────────────────────────────

export class NotificationStepRegistry {
  private entries = new Map<string, NotificationStepRegistryEntry>()
  private pluginSteps = new Map<string, Set<string>>() // pluginId → step type keys
  private version = 0
  private listeners = new Set<() => void>()
  private stepTypesCache: Record<string, ComponentType> | null = null

  // ── Registration ──────────────────────────────────────────────────

  registerCoreSteps(
    components: Record<
      string,
      LazyExoticComponent<ComponentType> | ComponentType
    >,
    icons?: Record<string, ComponentType<{ className?: string }>>,
  ): void {
    this.registerPluginSteps('core', CORE_NOTIFICATION_STEPS, components, icons)
  }

  registerPluginSteps(
    pluginId: string,
    definitions: Array<NotificationStepTypeDefinition>,
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
        component: memo(component as ComponentType),
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

  getEntry(type: string): NotificationStepRegistryEntry | undefined {
    return this.entries.get(type)
  }

  getDefinition(type: string): NotificationStepTypeDefinition | undefined {
    return this.entries.get(type)?.definition
  }

  getAllDefinitions(): Array<NotificationStepTypeDefinition> {
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
   * Returns a stable record of { stepType -> memoized React component }
   * suitable for passing to ReactFlow's `nodeTypes` prop.
   * The cache is invalidated only when registrations change.
   */
  getReactFlowStepTypes(): Record<string, ComponentType> {
    if (this.stepTypesCache) return this.stepTypesCache
    const result: Record<string, ComponentType> = {}
    for (const [key, entry] of this.entries) {
      // Components are already memoized at registration time
      result[key] = entry.component as ComponentType
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

export const NotificationStepRegistryContext =
  createContext<NotificationStepRegistry | null>(null)

export function useNotificationStepRegistry(): NotificationStepRegistry {
  const registry = useContext(NotificationStepRegistryContext)
  if (!registry) {
    throw new Error(
      'useNotificationStepRegistry must be used within a NotificationStepRegistryContext.Provider',
    )
  }
  useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  )
  return registry
}
