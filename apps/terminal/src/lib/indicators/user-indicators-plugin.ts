// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system'
import type { CustomIndicatorDescriptor } from '@pairlens/shared/plugin-types'

import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

// ---------------------------------------------------------------------------
// User Indicators — the user's own Python indicator scripts, expressed as a
// plugin. It provides `chart:indicator` backed by the indicator-scripts store
// (the /indicators editor page), which puts user-created indicators on the
// exact same footing as indicators shipped by any installed plugin: the
// terminal collects descriptors from every chart:indicator provider through
// one capability, and exporting a script as a standalone plugin is just a
// different provider for the same contract.
// ---------------------------------------------------------------------------

export const USER_INDICATORS_PLUGIN_ID = 'user-indicators'

export const userIndicatorsManifest: PluginManifest = {
  id: USER_INDICATORS_PLUGIN_ID,
  name: 'My Indicators',
  version: '1.0.0',
  author: 'Pairlens',
  description:
    'Your custom Python indicators, created in the Indicators editor.',
  icon: 'SquareFunction',
  capabilities: [
    {
      id: 'chart:indicator',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
}

/**
 * Scripts become descriptors once their metadata has been extracted by a
 * successful run in the editor; drafts that never ran stay editor-only.
 *
 * Anything without usable metadata is skipped rather than trusted: a record
 * that predates a field, or was hand-edited outside the app, must not throw
 * here — this runs during plugin activation, and one bad script would take
 * every custom indicator down with it.
 */
function scriptDescriptors(): Array<CustomIndicatorDescriptor> {
  const { scripts, loaded } = useIndicatorScriptsStore.getState()
  if (!loaded) useIndicatorScriptsStore.getState().load()
  const list = loaded ? scripts : useIndicatorScriptsStore.getState().scripts
  const descriptors: Array<CustomIndicatorDescriptor> = []
  for (const script of list) {
    const meta = script.meta
    if (!meta || typeof script.source !== 'string') continue
    descriptors.push({
      meta: { ...meta, id: script.id, title: meta.title || script.name },
      language: 'python',
      source: script.source,
      ...(script.modules?.length ? { modules: script.modules } : {}),
    })
  }
  return descriptors
}

export function createUserIndicatorsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute({
    capability,
  }: PluginExecuteParams): Promise<unknown> {
    if (capability !== 'chart:indicator') {
      throw new Error(`user-indicators: unsupported capability '${capability}'`)
    }
    return scriptDescriptors()
  }

  return { manifest, status: 'installed', config: {}, execute }
}
