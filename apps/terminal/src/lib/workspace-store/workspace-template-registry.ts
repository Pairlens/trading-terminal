// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets contributed by plugins, keyed by the plugin that ships
 * them — the workspace twin of `DynamicPaneRegistry`.
 *
 * An asset-class plugin owns its class's layouts: the perps desk belongs to
 * `pairlens-cex-futures`, the prediction desk and the event-market home board
 * to `pairlens-predictions`, the on-chain and stock boards to `pairlens-dex`
 * and `pairlens-equities`. Registration happens on activation and removal on
 * BOTH deactivation and uninstall, so disabling a family drops its entries
 * from the Workspace Store, the workspaces menu and Discovery in the same
 * beat — no reload, no stale card that copies a layout whose panes are gone.
 *
 * Third-party plugins use the identical path. What differs is trust: a
 * bootstrap contribution is taken verbatim (it is TypeScript-typed at build
 * time and ships in this bundle), while anything else is sanitized with the
 * same ceilings the untrusted community-store path uses — unknown facets
 * dropped, list lengths and layout geometry capped.
 */
import {
  ASSET_CLASSES,
  SCREEN_SIZES,
  TRADER_TYPES,
  variablesForLayout,
} from './catalog'
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

import type {
  AssetClass,
  ScreenSize,
  TemplateContext,
  TraderType,
  WorkspaceTemplate,
} from './types'
import type { TerminalLayout } from '@/lib/layout/types'

const TRADER_SET = new Set<string>(TRADER_TYPES)
const ASSET_SET = new Set<string>(ASSET_CLASSES)
const SCREEN_SET = new Set<string>(SCREEN_SIZES)

const CONTEXTS = new Set<string>(['standalone', 'pair', 'discovery'])

// Ceilings mirror `community-mapping.ts`: an untrusted plugin must not be able
// to crash the store with a malformed layout or bloat localStorage on copy.
const MAX_COLUMNS = 16
const MAX_CELLS_PER_COLUMN = 24
const MAX_PANES_PER_CELL = 16
const MAX_TOTAL_PANES = 200
const MAX_LAYOUT_BYTES = 256 * 1024
const MAX_TAGS = 12
const MAX_REQUIRED_PLUGINS = 24
const MAX_WORKSPACES_PER_PLUGIN = 24
const MAX_TEXT = 500

/** The full column→cell→pane structure every consumer iterates unguarded. */
function isUsableLayout(
  layout: ContributedWorkspaceLayout | undefined,
): boolean {
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

  try {
    if (JSON.stringify(layout).length > MAX_LAYOUT_BYTES) return false
  } catch {
    return false
  }
  return true
}

/**
 * Normalize contributed geometry into a `TerminalLayout`. The shared type
 * leaves `activeTabIndex` optional (a plugin describing a single-pane cell has
 * nothing to say about tabs); the reducer wants it present.
 */
function toTerminalLayout(layout: ContributedWorkspaceLayout): TerminalLayout {
  return {
    version: 1,
    columns: layout.columns.map((col) => ({
      id: col.id,
      widthPercent: col.widthPercent,
      cells: col.cells.map((cell) => ({
        id: cell.id,
        heightPercent: cell.heightPercent,
        activeTabIndex: cell.activeTabIndex ?? 0,
        panes: cell.panes.map((pane) => ({
          id: pane.id,
          type: pane.type,
          ...(pane.bindings ? { bindings: pane.bindings } : {}),
          ...(pane.overrides ? { overrides: pane.overrides } : {}),
        })),
      })),
    })),
  }
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, MAX_TEXT)
    : fallback
}

export type ContributionSource = {
  pluginId: string
  /** Shown as the template author in the store. */
  author: string
  /** Bootstrap plugins ship in this bundle — taken verbatim, marked builtin. */
  trusted: boolean
}

/**
 * Map one contribution onto the `WorkspaceTemplate` the store, the dependency
 * analyzer and the route menus all already speak. Returns null when the
 * contribution could never render.
 */
export function contributedToTemplate(
  entry: ContributedWorkspace,
  source: ContributionSource,
): WorkspaceTemplate | null {
  if (typeof entry?.id !== 'string' || entry.id.length === 0) return null
  if (!isUsableLayout(entry.layout)) return null

  const layout = toTerminalLayout(entry.layout)
  const facets = entry.facets ?? {
    traderTypes: [],
    assetClasses: [],
    screenSizes: [],
  }
  const context = CONTEXTS.has(entry.context ?? 'standalone')
    ? ((entry.context ?? 'standalone') as TemplateContext)
    : 'standalone'

  return {
    id: entry.id,
    name: text(entry.name, entry.id),
    tagline: text(entry.tagline, text(entry.name, entry.id)),
    description: text(entry.description, text(entry.tagline, entry.id)),
    icon: text(entry.icon, 'Layers'),
    author: source.author,
    featured: source.trusted ? Boolean(entry.featured) : false,
    facets: {
      traderTypes: (facets.traderTypes ?? []).filter((v) =>
        TRADER_SET.has(v),
      ) as Array<TraderType>,
      assetClasses: (facets.assetClasses ?? []).filter((v) =>
        ASSET_SET.has(v),
      ) as Array<AssetClass>,
      screenSizes: (facets.screenSizes ?? []).filter((v) =>
        SCREEN_SET.has(v),
      ) as Array<ScreenSize>,
    },
    tags: (entry.tags ?? []).slice(0, MAX_TAGS),
    // One rule for what `$pair` and `$wallet` mean, shared with the built-in
    // catalog: derived from the panes, seeded by the declared default market.
    variables: variablesForLayout(layout, entry.pairDefault),
    layout,
    requiredPlugins: (entry.requiredPlugins ?? []).slice(
      0,
      MAX_REQUIRED_PLUGINS,
    ),
    context,
    routeMenu: Boolean(entry.routeMenu),
    ...(entry.menuLabel ? { menuLabel: text(entry.menuLabel, entry.id) } : {}),
    // Only a bundled contribution may claim to be part of the built-in
    // catalog. Third-party entries stay unmarked: they are not community
    // submissions either, and `origin: 'community'` would switch the store
    // card into a submission it has no metadata for.
    ...(source.trusted ? { origin: 'builtin' as const } : {}),
  }
}

export class WorkspaceTemplateRegistry {
  private byPlugin = new Map<string, Array<WorkspaceTemplate>>()
  private version = 0
  private listeners = new Set<() => void>()
  private flatCache: Array<WorkspaceTemplate> | null = null

  register(
    workspaces: ReadonlyArray<ContributedWorkspace>,
    source: ContributionSource,
  ): void {
    const templates: Array<WorkspaceTemplate> = []
    for (const entry of workspaces.slice(0, MAX_WORKSPACES_PER_PLUGIN)) {
      const template = contributedToTemplate(entry, source)
      if (template) templates.push(template)
    }
    if (templates.length === 0 && !this.byPlugin.has(source.pluginId)) return
    this.byPlugin.set(source.pluginId, templates)
    this.bump()
  }

  unregister(pluginId: string): void {
    if (!this.byPlugin.delete(pluginId)) return
    this.bump()
  }

  /** Every contributed template, in plugin registration order. */
  getTemplates(): Array<WorkspaceTemplate> {
    if (this.flatCache) return this.flatCache
    const out: Array<WorkspaceTemplate> = []
    for (const templates of this.byPlugin.values()) out.push(...templates)
    this.flatCache = out
    return out
  }

  getTemplatesFor(pluginId: string): Array<WorkspaceTemplate> {
    return this.byPlugin.get(pluginId) ?? []
  }

  // ── useSyncExternalStore ──────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): number => this.version

  private bump(): void {
    this.version++
    this.flatCache = null
    for (const listener of this.listeners) listener()
  }
}

/**
 * The process-wide registry. A module singleton like `customIndicatorRegistry`,
 * so a hook can read it without threading a context through every consumer —
 * the plugin lifecycle that writes to it is itself process-wide.
 */
export const workspaceTemplateRegistry = new WorkspaceTemplateRegistry()
