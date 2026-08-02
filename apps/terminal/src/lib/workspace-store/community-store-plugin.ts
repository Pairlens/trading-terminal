// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system'

import type { CommunityWorkspaceSubmitInput } from '@/lib/api'
import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Pairlens Community — the first-party workspace store, expressed as a plugin.
//
// It provides the `workspace-store:catalog` capability and answers the store's
// operations (list / submit / delete / install / favorite) by forwarding to the
// App Server via the terminal's authenticated API client. Being a real plugin
// puts the first-party store on the exact same footing as any third-party store
// plugin, so the store UI resolves them all through one capability. It is a
// bootstrap (trusted, main-realm) plugin, so it can hold mutating capabilities;
// `storeRequiresAppServer` lets the adapter hide it when no App Server is
// configured (matching the old direct provider's availability).
// ---------------------------------------------------------------------------

export const COMMUNITY_STORE_PLUGIN_ID = 'pairlens-community'

export const communityStoreManifest: PluginManifest = {
  id: COMMUNITY_STORE_PLUGIN_ID,
  name: 'Pairlens Community',
  version: '1.0.0',
  author: 'Pairlens',
  description: 'Community workspace templates shared by Pairlens users.',
  icon: 'Users',
  capabilities: [
    {
      id: 'workspace-store:catalog',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
  metadata: {
    // Consumed by the store-provider adapter (createPluginStoreProvider).
    storeCapabilities: {
      submit: true,
      delete: true,
      install: true,
      favorite: true,
    },
    storeRequiresAppServer: true,
  },
}

type Op = {
  op?: string
  scope?: string
  sort?: string
  id?: string
  favorited?: boolean
  input?: CommunityWorkspaceSubmitInput
}

export function createCommunityStorePlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute({
    capability,
    params,
  }: PluginExecuteParams): Promise<unknown> {
    if (capability !== 'workspace-store:catalog') {
      throw new Error(
        `pairlens-community: unsupported capability '${capability}'`,
      )
    }
    const p = params as Op
    switch (p.op) {
      case 'list': {
        const scope = p.scope === 'mine' ? 'mine' : undefined
        const sort = p.sort === 'popular' ? 'popular' : undefined
        return { templates: await api.getCommunityWorkspaces({ scope, sort }) }
      }
      case 'submit':
        if (!p.input)
          throw new Error('pairlens-community: missing submit input')
        return api.submitCommunityWorkspace(p.input)
      case 'delete':
        await api.deleteCommunityWorkspace(String(p.id))
        return { ok: true }
      case 'install':
        return api.installCommunityWorkspace(String(p.id))
      case 'favorite':
        return api.favoriteCommunityWorkspace(
          String(p.id),
          Boolean(p.favorited),
        )
      default:
        return { templates: [] }
    }
  }

  return { manifest, status: 'installed', config: {}, execute }
}
