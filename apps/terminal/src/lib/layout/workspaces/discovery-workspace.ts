// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { DISCOVERY_HOME } from './discovery-presets'
import type { WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

export const DISCOVERY_WORKSPACE: WorkspaceConfig = {
  storageKey: 'pairlens:discovery.layout',

  // Every pane on the default board works without an account — signing in
  // is a lean-in, never a prerequisite for a useful home.
  defaultPreset: DISCOVERY_HOME,
  // Quick-apply layouts derived from the Workspace Store (single source).
  presets: routePresets('discovery'),
}
