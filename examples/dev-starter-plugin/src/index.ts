// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { lazy } from 'react'

import manifestJson from '../manifest.json'
import { HelloWorldPanel } from './panels/hello-world'
import type {
  PluginContext,
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-sdk'
// The manifest is the single source of truth — `manifest.json` is bundled into
// this module (so the module self-describes) and packaged alongside it in the
// plugin `.zip` (see the `package` script).

export const manifest = manifestJson as PluginManifest

export function createPlugin(m: PluginManifest): PluginInstance {
  return {
    manifest: m,
    status: 'installed',
    config: {},
    execute: async (_params: PluginExecuteParams) => null,
    executeCommand: (commandId: string, context: PluginContext) => {
      if (commandId === 'greet') {
        console.log('[dev-starter] Hello from the Dev Starter plugin!', context)
      }
    },
    getContributedComponents: () => ({
      hello: lazy(() => Promise.resolve({ default: HelloWorldPanel })),
    }),
  }
}
