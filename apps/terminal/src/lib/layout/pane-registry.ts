// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { ContributedPanel } from '@pairlens/plugin-system'

import type { PaneDefinition } from './types'
import { lazyChunk } from '@/lib/lazy-chunk'

// ── Types ───────────────────────────────────────────────────────────

export type PaneRegistryEntry = {
  definition: PaneDefinition
  component: LazyExoticComponent<ComponentType>
  pluginId: string | null // null = builtin ('empty'), string = owning plugin
}

/**
 * First-party plugin IDs whose panel IDs are used directly as pane type keys
 * (no namespace prefix), preserving saved layouts.
 *
 * Exported, with `paneTypeKey` below, because the workspace-store dependency
 * analyzer has to key pane types EXACTLY the way this registry does or a
 * template's panes resolve to no owner. It kept its own copy of both until the
 * set grew a third member and only one copy learned about it — silently, since
 * the mismatch shows up as a missing icon rather than an error.
 *
 * `pairlens-dex` and `pairlens-equities` joined the set when they stopped
 * being presets-only: their layouts name panes like `pool-stats` and `level-1`
 * bare, exactly as a saved layout does.
 */
export const FIRST_PARTY_PLUGIN_IDS: ReadonlySet<string> = new Set([
  'pairlens-core',
  'pairlens-intelligence',
  'pairlens-predictions',
  'pairlens-cex-futures',
  'pairlens-dex',
  'pairlens-equities',
  'pairlens-nfts',
])

/** The one rule that turns (plugin, panel) into a saved-layout pane type. */
export function paneTypeKey(pluginId: string, panelId: string): string {
  return FIRST_PARTY_PLUGIN_IDS.has(pluginId)
    ? panelId
    : `${pluginId}:${panelId}`
}

// ── DynamicPaneRegistry ─────────────────────────────────────────────

export class DynamicPaneRegistry {
  private entries = new Map<string, PaneRegistryEntry>()
  private pluginPanes = new Map<string, Set<string>>() // pluginId → pane type keys
  private version = 0
  private listeners = new Set<() => void>()
  private definitionsCache: Record<string, PaneDefinition> | null = null

  // ── Registration ──────────────────────────────────────────────────

  registerBuiltin(
    type: string,
    entry: Omit<PaneRegistryEntry, 'pluginId'>,
  ): void {
    this.entries.set(type, { ...entry, pluginId: null })
    this.bump()
  }

  registerPluginPanes(
    pluginId: string,
    panels: Array<ContributedPanel>,
    components: Record<string, unknown>,
  ): void {
    const keys = new Set<string>()

    for (const panel of panels) {
      const typeKey = paneTypeKey(pluginId, panel.id)

      const component = components[panel.id] as
        | LazyExoticComponent<ComponentType>
        | undefined
      if (!component) continue

      const definition: PaneDefinition = {
        type: typeKey,
        labelKey: panel.labelKey ?? `plugin.${pluginId}.${panel.id}`,
        icon: panel.icon,
        descriptionKey: panel.descriptionKey,
        category: panel.category,
        singleton: panel.singleton,
        minHeight: panel.minHeight,
        compact: panel.compact,
        fitContent: panel.fitContent,
        requires: panel.requires,
        requiredAccessLevel: panel.requiredAccessLevel,
        requiresDesktop: panel.requiresDesktop,
      }

      this.entries.set(typeKey, { definition, component, pluginId })
      keys.add(typeKey)
    }

    this.pluginPanes.set(pluginId, keys)
    this.bump()
  }

  unregisterPluginPanes(pluginId: string): void {
    const keys = this.pluginPanes.get(pluginId)
    if (!keys) return

    for (const key of keys) {
      this.entries.delete(key)
    }
    this.pluginPanes.delete(pluginId)
    this.bump()
  }

  // ── Queries ───────────────────────────────────────────────────────

  getDefinition(type: string): PaneDefinition | null {
    return this.entries.get(type)?.definition ?? null
  }

  getDefinitions(): Record<string, PaneDefinition> {
    if (this.definitionsCache) return this.definitionsCache
    const result: Record<string, PaneDefinition> = {}
    for (const [key, entry] of this.entries) {
      result[key] = entry.definition
    }
    this.definitionsCache = result
    return result
  }

  getComponent(type: string): LazyExoticComponent<ComponentType> | null {
    return this.entries.get(type)?.component ?? null
  }

  getPluginForPane(type: string): string | null {
    return this.entries.get(type)?.pluginId ?? null
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
    this.definitionsCache = null
    for (const listener of this.listeners) {
      listener()
    }
  }
}

// ── Builtin pane ────────────────────────────────────────────────────

const EmptyPlaceholderPane = lazyChunk(() =>
  import('@/components/layout/empty-placeholder-pane').then((m) => ({
    default: m.EmptyPlaceholderPane,
  })),
)

export function registerBuiltins(registry: DynamicPaneRegistry): void {
  registry.registerBuiltin('empty', {
    definition: {
      type: 'empty',
      labelKey: 'panes.empty',
      icon: 'Plus',
      compact: true,
    },
    component: EmptyPlaceholderPane,
  })
}

// ── React context + hook ────────────────────────────────────────────

export const PaneRegistryContext = createContext<DynamicPaneRegistry | null>(
  null,
)

export function usePaneRegistry() {
  const registry = useContext(PaneRegistryContext)
  if (!registry) {
    throw new Error(
      'usePaneRegistry must be used within a PaneRegistryContext.Provider',
    )
  }
  useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  )
  return registry
}
