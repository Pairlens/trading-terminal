// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { PRESET_DEFAULT } from '../presets'
import type { WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

export const PAIR_WORKSPACE: WorkspaceConfig = {
  storageKey: 'pairlens:terminal.layout',

  defaultPreset: PRESET_DEFAULT,
  // Quick-apply layouts derived from the Workspace Store (single source).
  // Screen-tuned layouts now live in the store, browsable via the Screen filter.
  presets: routePresets('pair'),
}
