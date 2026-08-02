// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ASSET_CLASSES, SCREEN_SIZES, TRADER_TYPES } from './catalog'
import type {
  AssetClass,
  ScreenSize,
  TraderType,
  WorkspaceTemplate,
} from './types'
import type { TerminalLayout } from '@/lib/layout/types'
import type { CommunityWorkspaceDto } from '@/lib/api'

// Pure mapping from an App Server community submission to a WorkspaceTemplate —
// kept free of React/api/env imports so it can be unit-tested in isolation.

const TRADER_SET = new Set<string>(TRADER_TYPES)
const ASSET_SET = new Set<string>(ASSET_CLASSES)
const SCREEN_SET = new Set<string>(SCREEN_SIZES)

// Structural + size ceilings mirror the App Server's sanitizeSubmission caps
// so an untrusted third-party store plugin can't crash the store with a
// malformed layout or bloat localStorage with a huge one.
const MAX_COLUMNS = 16
const MAX_CELLS_PER_COLUMN = 24
const MAX_PANES_PER_CELL = 16
const MAX_TOTAL_PANES = 200
const MAX_LAYOUT_BYTES = 256 * 1024
const MAX_TAGS = 12
const MAX_VARIABLES = 24
const MAX_REQUIRED_PLUGINS = 24

/**
 * A store layout is only usable if it has the full column→cell→pane structure
 * every consumer (preview, dependency analysis, copy) iterates unguarded. The
 * trusted App Server path is already zod-validated; this guards the untrusted
 * plugin path — and, applied uniformly, hardens both against malformed data.
 */
export function hasUsableLayout(dto: CommunityWorkspaceDto): boolean {
  const layout: TerminalLayout | undefined = dto.layout
  const columns = layout?.columns
  if (!Array.isArray(columns) || columns.length === 0) return false
  if (columns.length > MAX_COLUMNS) return false

  let totalPanes = 0
  for (const col of columns) {
    const cells = col?.cells
    if (!Array.isArray(cells) || cells.length === 0) return false
    if (cells.length > MAX_CELLS_PER_COLUMN) return false
    for (const cell of cells) {
      const panes = cell?.panes
      if (!Array.isArray(panes) || panes.length === 0) return false
      if (panes.length > MAX_PANES_PER_CELL) return false
      totalPanes += panes.length
      if (totalPanes > MAX_TOTAL_PANES) return false
      for (const pane of panes) {
        if (!pane || typeof pane.type !== 'string') return false
      }
    }
  }

  // Bound the serialized size so a plugin can't bloat local storage on copy.
  try {
    if (JSON.stringify(layout).length > MAX_LAYOUT_BYTES) return false
  } catch {
    return false
  }
  return true
}

/**
 * Map a store submission DTO into a `WorkspaceTemplate` so the store renders,
 * filters, and copies it with the exact same code paths as a built-in. Facets
 * are filtered to known values (a submission can't invent new facets) and the id
 * is namespaced so it never collides with a `template:` built-in id. `providerId`
 * stamps which store provider owns it, so item actions route back to it.
 */
export function communityDtoToTemplate(
  dto: CommunityWorkspaceDto,
  providerId = 'pairlens-community',
): WorkspaceTemplate {
  const facets = dto.facets ?? {
    traderTypes: [],
    assetClasses: [],
    screenSizes: [],
  }
  return {
    id: `community:${providerId}:${dto.id}`,
    name: dto.name,
    tagline: dto.tagline || dto.name,
    description: dto.description || dto.tagline || dto.name,
    icon: dto.icon,
    author: dto.author || 'Community',
    facets: {
      traderTypes: (facets.traderTypes ?? []).filter((t) =>
        TRADER_SET.has(t),
      ) as Array<TraderType>,
      assetClasses: (facets.assetClasses ?? []).filter((a) =>
        ASSET_SET.has(a),
      ) as Array<AssetClass>,
      screenSizes: (facets.screenSizes ?? []).filter((s) =>
        SCREEN_SET.has(s),
      ) as Array<ScreenSize>,
    },
    // Bound list sizes so an untrusted store can't bloat what gets copied into
    // localStorage (the community path is already server-capped; this is a no-op
    // there and a guard on the plugin path).
    tags: (dto.tags ?? []).slice(0, MAX_TAGS),
    variables: (dto.variables ?? []).slice(0, MAX_VARIABLES),
    layout: dto.layout,
    requiredPlugins: (dto.requiredPlugins ?? []).slice(0, MAX_REQUIRED_PLUGINS),
    context: 'standalone',
    origin: 'community',
    community: {
      submissionId: dto.id,
      providerId,
      installs: dto.installs ?? 0,
      favorites: dto.favorites ?? 0,
      mine: Boolean(dto.mine),
      faved: Boolean(dto.faved),
      createdAt: dto.createdAt,
    },
  }
}
