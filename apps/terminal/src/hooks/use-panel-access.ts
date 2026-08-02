// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { usePairlens } from '@/lib/pairlens-provider'

export type PanelAccessStatus =
  | 'available' // panel exists in registry, usable
  | 'plugin-disabled' // plugin installed but not active
  | 'plugin-missing' // plugin not installed — pane type has no component
  | 'tier-required' // gated by subscription tier

export type PanelAccessResult = {
  status: PanelAccessStatus
  pluginId: string | null
  requiredAccessLevel?: string
}

/**
 * Check whether a pane type is accessible.
 * Returns the access status, the owning plugin ID, and any required access level.
 */
export function usePanelAccess(paneType: string): PanelAccessResult {
  const registry = usePaneRegistry()
  const { pluginManager } = usePairlens()
  const component = registry.getComponent(paneType)
  const pluginId = registry.getPluginForPane(paneType)
  const def = registry.getDefinition(paneType)

  if (component) {
    // Component exists — check tier gating (structural prep for when entitlements are enforced)
    if (def?.requiredAccessLevel) {
      return {
        status: 'available',
        pluginId,
        requiredAccessLevel: def.requiredAccessLevel,
      }
    }
    return { status: 'available', pluginId }
  }

  // No component registered — check if plugin is installed but disabled
  const inferredPluginId =
    pluginId ?? (paneType.includes(':') ? paneType.split(':')[0] : null)

  if (inferredPluginId) {
    const installed = pluginManager.getInstalledPlugins()
    const plugin = installed.find((p) => p.manifest.id === inferredPluginId)
    if (plugin && plugin.status !== 'active') {
      return { status: 'plugin-disabled', pluginId: inferredPluginId }
    }
  }

  return { status: 'plugin-missing', pluginId: inferredPluginId }
}
