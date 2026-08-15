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
 * bootstrap contribution is taken verbatim — it is TypeScript-typed at build
 * time, ships in this bundle, and keeps its bare template id. Anything else is
 * sanitized with the same ceilings the untrusted community-store path uses
 * (unknown facets dropped, list lengths and layout geometry capped) and gets
 * its id namespaced by plugin, so a third-party entry can never shadow a
 * built-in board and inherit its translations, menu slot or store card.
 */
import {
  WORKSPACE_LAYOUT_CAPS,
  isUsableWorkspaceLayout,
} from '@pairlens/shared/workspace-layout-caps'

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

// Ceilings are the shared ones (`@pairlens/shared/workspace-layout-caps`), the
// same set the manifest schema and the community-store mapper enforce: an
// untrusted plugin must not be able to crash the store with a malformed layout
// or bloat localStorage on copy.
const MAX_TAGS = WORKSPACE_LAYOUT_CAPS.maxTags
const MAX_REQUIRED_PLUGINS = WORKSPACE_LAYOUT_CAPS.maxRequiredPlugins
const MAX_WORKSPACES_PER_PLUGIN = WORKSPACE_LAYOUT_CAPS.maxWorkspaces
const MAX_TEXT = WORKSPACE_LAYOUT_CAPS.maxTextLength

/**
 * The id an untrusted contribution is filed under.
 *
 * Mirrors `paneTypeKey`'s rule (bare for first-party, prefixed for everyone
 * else) with one extra guard: the prefix is a fixed `plugin:` segment rather
 * than the bare plugin id, so a plugin that names itself `template` still
 * cannot mint `template:classic-terminal` and shadow a built-in.
 */
export function contributedTemplateId(
  pluginId: string,
  templateId: string,
): string {
  return `plugin:${pluginId}:${templateId}`
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

function contextOf(entry: ContributedWorkspace): TemplateContext {
  const context = entry.context ?? 'standalone'
  return CONTEXTS.has(context) ? (context as TemplateContext) : 'standalone'
}

/**
 * Map one contribution onto the `WorkspaceTemplate` the store, the dependency
 * analyzer and the route menus all already speak. Returns null when the
 * contribution could never render.
 *
 * A trusted contribution takes the fast path: it is a compiled-in object
 * literal the `ContributedWorkspace` type already constrains, so re-deriving
 * what the caps would allow only means a new first-party facet value gets
 * silently dropped, and a family bulk toggle re-runs `JSON.stringify` over
 * layouts that have been known-good since build time.
 */
export function contributedToTemplate(
  entry: ContributedWorkspace,
  source: ContributionSource,
): WorkspaceTemplate | null {
  if (typeof entry?.id !== 'string' || entry.id.length === 0) return null

  if (source.trusted) {
    const layout = toTerminalLayout(entry.layout)
    return {
      id: entry.id,
      name: entry.name,
      tagline: entry.tagline,
      description: entry.description,
      icon: entry.icon,
      author: source.author,
      featured: Boolean(entry.featured),
      // The facet vocabularies are plain strings on the wire; a first-party
      // contribution is written against the terminal's own union.
      facets: entry.facets as WorkspaceTemplate['facets'],
      tags: entry.tags ?? [],
      // One rule for what `$pair` and `$wallet` mean, shared with the built-in
      // catalog: derived from the panes, seeded by the declared default market.
      variables: variablesForLayout(layout, entry.pairDefault),
      layout,
      requiredPlugins: entry.requiredPlugins ?? [],
      context: contextOf(entry),
      routeMenu: Boolean(entry.routeMenu),
      ...(entry.menuLabel ? { menuLabel: entry.menuLabel } : {}),
      origin: 'builtin' as const,
    }
  }

  if (!isUsableWorkspaceLayout(entry.layout)) return null

  const layout = toTerminalLayout(entry.layout)
  const facets = entry.facets ?? {
    traderTypes: [],
    assetClasses: [],
    screenSizes: [],
  }

  return {
    // Namespaced, so an untrusted plugin cannot claim `template:...` and
    // shadow a built-in board in the store list or a route menu.
    id: contributedTemplateId(source.pluginId, entry.id),
    name: text(entry.name, entry.id),
    tagline: text(entry.tagline, text(entry.name, entry.id)),
    description: text(entry.description, text(entry.tagline, entry.id)),
    icon: text(entry.icon, 'Layers'),
    author: source.author,
    featured: false,
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
    variables: variablesForLayout(layout, entry.pairDefault),
    layout,
    requiredPlugins: (entry.requiredPlugins ?? []).slice(
      0,
      MAX_REQUIRED_PLUGINS,
    ),
    context: contextOf(entry),
    routeMenu: Boolean(entry.routeMenu),
    ...(entry.menuLabel ? { menuLabel: text(entry.menuLabel, entry.id) } : {}),
    // A third-party entry stays unmarked: only a bundled contribution is part
    // of the built-in catalog, and it is not a community submission either, so
    // `origin: 'community'` would switch the store card into a submission it
    // has no metadata for.
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
    const entries = source.trusted
      ? workspaces
      : workspaces.slice(0, MAX_WORKSPACES_PER_PLUGIN)
    const templates: Array<WorkspaceTemplate> = []
    for (const entry of entries) {
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
