// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { lazy } from 'react'

import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-sdk'

export const manifest: PluginManifest = {
  id: 'dev-sync',
  name: 'Dev Sync',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Demonstrates cross-panel communication via the Service Registry — one panel controls another',
  homepage: 'https://pairlens.finance',
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'controller',
        label: 'Sync Controller',
        icon: 'Radio',
        category: 'discovery',
        description:
          'Sends commands to the Sync Display panel via the Service Registry',
      },
      {
        id: 'display',
        label: 'Sync Display',
        icon: 'Monitor',
        category: 'discovery',
        description:
          'Receives and renders commands from the Sync Controller panel',
      },
    ],
  },
}

export function createPlugin(m: PluginManifest): PluginInstance {
  return {
    manifest: m,
    status: 'installed',
    config: {},
    execute: async (_params: PluginExecuteParams) => null,
    getContributedComponents: () => ({
      controller: lazy(() =>
        import('./panels/controller').then((mod) => ({
          default: mod.ControllerPanel,
        })),
      ),
      display: lazy(() =>
        import('./panels/display').then((mod) => ({
          default: mod.DisplayPanel,
        })),
      ),
    }),
  }
}
