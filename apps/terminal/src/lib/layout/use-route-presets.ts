// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The quick-apply presets a route's workspaces menu offers, live.
 *
 * `WorkspaceConfig.presets` is the built-in base, frozen at module scope so
 * the pair and discovery routes boot deterministically. The rest arrives from
 * whichever plugins are active: an asset-class family ships its own layouts
 * through `contributes.workspaces`, so the perp menu's "Default" is the futures
 * plugin's and goes the moment that plugin is disabled. Subscribing to the
 * registry is what makes it go without a reload.
 *
 * The route still boots on `defaultPreset` either way, so `mergeRoutePresets`
 * synthesizes the Default entry from it when no plugin offers one. Losing a
 * family must not leave the layout the page opened on unreachable.
 *
 * Custom workspaces carry no `presetContext` and get the base untouched, which
 * for them is empty.
 */
import { useMemo, useSyncExternalStore } from 'react'

import { normalizeInstrumentClass } from '@pairlens/shared/market-ref'
import type { RoutePreset } from '@/lib/workspace-store/catalog'
import type { WorkspaceConfig } from './types'
import { mergeRoutePresets } from '@/lib/workspace-store/catalog'
import { workspaceTemplateRegistry } from '@/lib/workspace-store/workspace-template-registry'

export function useRoutePresets(
  workspace: WorkspaceConfig,
): Record<string, RoutePreset> {
  const version = useSyncExternalStore(
    workspaceTemplateRegistry.subscribe,
    workspaceTemplateRegistry.getSnapshot,
    workspaceTemplateRegistry.getSnapshot,
  )

  const { presets, presetContext, pairClass, defaultPreset } = workspace

  return useMemo(() => {
    if (!presetContext) return presets
    // Touch the version so the menu rebuilds when a plugin activates or goes.
    void version
    const cls =
      presetContext === 'pair' ? normalizeInstrumentClass(pairClass) : undefined
    return mergeRoutePresets(
      presets,
      workspaceTemplateRegistry.getTemplates(),
      presetContext,
      cls,
      defaultPreset,
    )
  }, [presets, presetContext, pairClass, defaultPreset, version])
}
