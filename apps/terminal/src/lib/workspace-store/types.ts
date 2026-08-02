// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  TerminalLayout,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'

// ── Filter taxonomies ───────────────────────────────────────────────
//
// A template is tagged along three independent facets so the store can be
// filtered the way a trader actually shops for a layout: by how they trade,
// what they trade, and how much screen real estate they have.

/** How the trader operates — drives which panes a layout emphasises. */
export type TraderType =
  | 'scalper'
  | 'day-trader'
  | 'swing-trader'
  | 'position-investor'
  | 'news-trader'
  | 'dex-degen'
  | 'quant'

/** What the workspace is built to trade. */
export type AssetClass = 'crypto-spot' | 'dex' | 'equities' | 'multi-asset'

/** Roughly how wide the layout wants to be (derived from column count). */
export type ScreenSize = 'compact' | 'standard' | 'wide' | 'multi'

/**
 * Where a template originates and how it's used:
 * - `standalone` — a full workspace only meaningful as its own copy (default).
 * - `pair` — a chart/trading layout that doubles as an in-place preset on the
 *   pair route (its panes fall back to the route's active pair).
 * - `discovery` — a home/discovery layout that doubles as an in-place preset on
 *   the home route.
 */
export type TemplateContext = 'standalone' | 'pair' | 'discovery'

export type WorkspaceTemplateFacets = {
  traderTypes: Array<TraderType>
  assetClasses: Array<AssetClass>
  screenSizes: Array<ScreenSize>
}

/**
 * A plugin dependency declared by the template author, beyond what the
 * layout's panes already imply (e.g. a connector needed for the template's
 * default market). Panel-owning plugins are discovered automatically from the
 * layout — this list is for capability/connector dependencies that panes don't
 * spell out structurally.
 */
export type TemplatePluginRequirement = {
  pluginId: string
  /** Why this workspace needs the plugin (surfaced in the requirements panel). */
  reason?: string
}

/**
 * A pre-made workspace offered in the store. It carries everything needed to
 * materialise a `CustomWorkspaceDefinition` (name, icon, variables, layout)
 * plus the store metadata used for browsing, filtering, and dependency checks.
 */
export type WorkspaceTemplate = {
  id: string
  name: string
  /** One-line hook shown on the card. */
  tagline: string
  /** Longer prose shown in the detail dialog. */
  description: string
  /** lucide icon name — must be a key of WORKSPACE_ICONS so the copy renders. */
  icon: string
  author: string
  featured?: boolean
  facets: WorkspaceTemplateFacets
  tags?: Array<string>
  variables: Array<WorkspaceVariableDefinition>
  /**
   * Raw layout geometry. Pane→variable bindings are applied on copy (see
   * `templateToWorkspaceParams`), so this stays unbound and can also be applied
   * in place as a route preset.
   */
  layout: TerminalLayout
  requiredPlugins?: Array<TemplatePluginRequirement>
  /** Origin/usage of the template (default `standalone`). */
  context?: TemplateContext
  /** Offered as an in-place quick-apply preset in its route's layout menu. */
  routeMenu?: boolean
  /** Short label for the route menu (falls back to `name`). */
  menuLabel?: string
  /** Where the template came from — the built-in catalog or a community share. */
  origin?: TemplateOrigin
  /** Present only when `origin === 'community'` — the store submission metadata. */
  community?: CommunityTemplateMeta
}

/** A single template's provenance: bundled with the app, or user-shared. */
export type TemplateOrigin = 'builtin' | 'community'

/** Store metadata for a community-shared workspace template. */
export type CommunityTemplateMeta = {
  /** The submission id within its store (without the `community:` id prefix). */
  submissionId: string
  /** The store provider this template belongs to — routes install/favorite/delete. */
  providerId: string
  /** How many times it's been copied into a workspace ("downloads"). */
  installs: number
  /** How many users have favourited it. */
  favorites: number
  /** True when the signed-in viewer authored this submission. */
  mine: boolean
  /** True when the signed-in viewer has favourited it. */
  faved: boolean
  /** Submission time (epoch ms). */
  createdAt: number
}

/** Where a template list came from — local catalog today; remote/plugin in M2. */
export type WorkspaceTemplateSource = 'builtin' | 'remote' | 'plugin'
