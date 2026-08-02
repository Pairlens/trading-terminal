// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { BUILTIN_WORKSPACE_TEMPLATES } from './catalog'
import { communityDtoToTemplate, hasUsableLayout } from './community-mapping'
import type {
  FavoriteResult,
  WorkspaceStoreListQuery,
  WorkspaceStoreProvider,
} from './provider'
import type { WorkspaceTemplate } from './types'
import type {
  CommunityWorkspaceDto,
  CommunityWorkspaceSubmitInput,
} from '@/lib/api'
import type { PluginInstance } from '@pairlens/plugin-system'
import { hasAppServer } from '@/lib/auth-client'
import { BOOTSTRAP_PLUGIN_IDS } from '@/lib/plugins/bootstrap-bundle'
import { getPluginTrust } from '@/lib/plugins/plugin-ledger'

export const BUILTIN_PROVIDER_ID = 'builtin'
export const COMMUNITY_PROVIDER_ID = 'pairlens-community'

// ── Built-in provider ───────────────────────────────────────────────
//
// The bundled catalog. Read-only (you copy, you don't publish), always present.

export const builtinProvider: WorkspaceStoreProvider = {
  id: BUILTIN_PROVIDER_ID,
  label: 'Pairlens',
  capabilities: {
    submit: false,
    delete: false,
    install: false,
    favorite: false,
  },
  isAvailable: () => true,
  list: async (query) =>
    // Built-ins are nobody's "mine" — hide them under the Yours filter.
    query.scope === 'mine' ? [] : BUILTIN_WORKSPACE_TEMPLATES,
}

// ── Plugin-contributed store providers ──────────────────────────────
//
// Any active plugin declaring the `workspace-store:catalog` capability is
// adapted into a provider — including the first-party Pairlens Community store,
// which is itself a bootstrap plugin. The plugin answers `execute({op})` with
// structured-cloneable JSON; anything unexpected is treated as empty so a
// misbehaving plugin never blanks the store.
//
// Mutating actions (submit/delete/install/favorite) are advertised via
// `manifest.metadata.storeCapabilities`, but only HONOURED when the provider is
// trusted (a bootstrap plugin, or one the user granted full trust) — browsing is
// always allowed; publishing/favouriting to an untrusted third-party backend is
// not, until the user trusts it.

const NEUTRAL_CONTEXT = {
  pair: '',
  market: '',
  timeframe: '',
  mode: 'paper' as const,
  country: '',
}

type StoreCaps = {
  submit?: boolean
  delete?: boolean
  install?: boolean
  favorite?: boolean
}

function extractDtos(result: unknown): Array<CommunityWorkspaceDto> {
  const list = Array.isArray(result)
    ? result
    : result && typeof result === 'object' && 'templates' in result
      ? (result as { templates: unknown }).templates
      : null
  if (!Array.isArray(list)) return []
  return list.filter(
    (d): d is CommunityWorkspaceDto =>
      !!d &&
      typeof d === 'object' &&
      typeof (d as { id?: unknown }).id === 'string',
  )
}

export function createPluginStoreProvider(
  plugin: PluginInstance,
): WorkspaceStoreProvider {
  const { manifest } = plugin
  const meta = (manifest.metadata ?? {}) as {
    storeCapabilities?: StoreCaps
    storeRequiresAppServer?: boolean
  }
  const declared = meta.storeCapabilities ?? {}
  // Mutating store actions require a trusted provider; browsing never does.
  const trusted =
    BOOTSTRAP_PLUGIN_IDS.has(manifest.id) ||
    getPluginTrust(manifest.id) === 'full'
  const gated = (flag?: boolean) => Boolean(flag) && trusted

  const run = (op: string, extra: Record<string, unknown> = {}) =>
    plugin.execute({
      capability: 'workspace-store:catalog',
      params: { op, ...extra },
      context: NEUTRAL_CONTEXT,
    })

  return {
    id: manifest.id,
    label: manifest.name,
    capabilities: {
      submit: gated(declared.submit),
      delete: gated(declared.delete),
      install: gated(declared.install),
      favorite: gated(declared.favorite),
    },
    isAvailable: () =>
      plugin.status === 'active' &&
      (!meta.storeRequiresAppServer || hasAppServer),
    list: async (query: WorkspaceStoreListQuery) => {
      let result: unknown
      try {
        result = await run('list', { scope: query.scope, sort: query.sort })
      } catch {
        return []
      }
      return extractDtos(result)
        .filter(hasUsableLayout)
        .map((d): WorkspaceTemplate => communityDtoToTemplate(d, manifest.id))
    },
    submit: async (input: CommunityWorkspaceSubmitInput) => {
      const dto = await run('submit', { input })
      return communityDtoToTemplate(dto as CommunityWorkspaceDto, manifest.id)
    },
    delete: async (id: string) => {
      await run('delete', { id })
    },
    install: (id: string) =>
      run('install', { id }) as Promise<{ installs: number }>,
    favorite: (id: string, favorited: boolean) =>
      run('favorite', { id, favorited }) as Promise<FavoriteResult>,
  }
}
