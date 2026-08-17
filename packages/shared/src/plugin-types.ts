// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Plugin manifest wire-format types — single source of truth.
// These describe what a plugin declares in its manifest.json (registry API,
// plugin packages, installed manifests). Runtime types (PluginInstance,
// PluginContext, resolution, access control) live in @pairlens/plugin-system,
// which re-exports these wire types for convenience.

import type { LocalizedText } from './localized-text'

// Capability IDs
export type CapabilityId =
  | 'market-data:discovery'
  | 'market-data:discovery:search'
  | 'market-data:candles'
  | 'market-data:ticker'
  | 'market-data:ticker-snapshot'
  | 'market-data:orderbook'
  | 'market-data:trades'
  | 'market-data:history'
  | 'market-data:events'
  | 'market-data:pool-stats'
  | 'market-data:session'
  | 'market-data:funding'
  | 'ai:inference'
  | 'ai:web-search'
  | 'market-data:symbol-logo'
  | 'trading:orders'
  | 'trading:balances'
  | 'trading:positions'
  | 'workflow:step-types'
  | 'notification:channel'
  | 'theme:override'
  | 'workspace-store:catalog'
  | 'chart:indicator'

// Plugin manifest (declared in plugin's manifest.json)
export type PluginCapabilityDeclaration = {
  id: CapabilityId
  singleton: boolean
  markets: Array<string> // ['okx'] or ['*'] for all
  priority: number // 0-99, lower = higher priority
  streaming: boolean
  requiresAuth?: boolean // default false — capability needs authenticated user
  requiredAccessLevel?: string // e.g. 'pro' — minimum access level (uses manifest's accessLevels ordering)
  sideEffect?: boolean // execution mutates external state (orders, transfers); never re-routed to a fallback plugin on failure
}

// Chat message shape passed to ai:inference plugins (execute and subscribe)
export type InferenceMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Events an ai:inference plugin emits through its subscribe() callback.
// Text-only for now — tool calling over the plugin boundary is a future
// extension of this union.
export type InferenceStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'finish'; model?: string }
  | { type: 'error'; message: string }

// The ai:web-search capability contract. execute() receives a
// WebSearchRequest in params and must resolve to a WebSearchResponse.
// Hosts validate the response shape defensively and drop malformed entries.
export type WebSearchRequest = {
  // Natural-language description of the research goal
  objective: string
  // Optional focused queries supplementing the objective
  search_queries?: Array<string>
  // Soft cap on returned results (providers may return fewer)
  max_results?: number
}

export type WebSearchResult = {
  url: string
  title: string
  // Extracted text excerpt from the page (may be empty)
  excerpt: string
  publishDate?: string | null
}

export type WebSearchResponse = {
  results: Array<WebSearchResult>
}

// ── chart:indicator capability contract ─────────────────────────────────────
// A chart:indicator plugin's execute() resolves to
// Array<CustomIndicatorDescriptor>: script-defined chart indicators (Python)
// that the terminal runs in its local Python runtime and renders as
// first-class chart indicators. Descriptors are plain JSON — safe to cross
// the sandbox worker boundary.

/** How one output series of a custom indicator is drawn. */
export type CustomIndicatorSeriesStyle =
  | 'line'
  | 'histogram'
  | 'area'
  | 'stepline'
  | 'columns'
  | 'circles'
  | 'cross'
  /** Full-height per-bar tint behind the pane (Pine's `bgcolor`) */
  | 'background'

export type CustomIndicatorSeriesSpec = {
  /** Key in the dict returned by the script's compute() */
  key: string
  title?: string
  style: CustomIndicatorSeriesStyle
  /** CSS color; omit to use theme palette by series index */
  color?: string
  /**
   * Colors this series can take per bar. compute() emits a parallel array of
   * palette indices under `<key>:c`, so per-bar coloring stays float64 the
   * whole way from Python to the canvas — no per-bar string marshalling.
   */
  palette?: Array<string>
  /** Line width in px (line/area styles) */
  width?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Histogram only: color positive/negative values as up/down */
  upDown?: boolean
  /** Fill opacity 0..1 for area/columns/background */
  opacity?: number
  /** Compute it, but don't draw it — for fill anchors and alert inputs */
  hidden?: boolean
}

/** Shapes a marker series can stamp on a bar (Pine's `plotshape`/`plotchar`). */
export type CustomIndicatorMarkerShape =
  | 'triangle_up'
  | 'triangle_down'
  | 'arrow_up'
  | 'arrow_down'
  | 'circle'
  | 'square'
  | 'diamond'
  | 'cross'
  | 'x'
  | 'flag'

export type CustomIndicatorMarkerSpec = {
  /** Key of a truthy/0 array in compute()'s output — nonzero bars get a mark */
  key: string
  shape: CustomIndicatorMarkerShape
  /**
   * Where the mark sits: outside the bar's high/low, pinned to a pane edge,
   * or riding another series' value.
   */
  position: 'above' | 'below' | 'top' | 'bottom' | 'series'
  /** Series key to ride when `position` is 'series' */
  at?: string
  color?: string
  size?: 'tiny' | 'small' | 'normal' | 'large'
  /** Short static label drawn beside the shape */
  text?: string
  title?: string
}

/** Shaded region between two series, or between a series and a constant. */
export type CustomIndicatorFillSpec = {
  from: string
  /** Second series key; omit and set `level` to fill against a constant */
  to?: string
  level?: number
  color?: string
  /** Two-tone fill: [from above to, from below to] */
  palette?: Array<string>
  opacity?: number
  title?: string
}

/** A condition the script exposes to the alert + workflow engines. */
export type CustomIndicatorAlertSpec = {
  /** Key of a truthy/0 array in compute()'s output */
  key: string
  title: string
  /**
   * Notification body. `{{pair}}`, `{{timeframe}}`, `{{title}}`, `{{value}}`
   * and `{{price}}` expand at fire time.
   */
  message?: string
}

/** Extra candle series the host fetches and hands to compute() (Pine's `request.security`). */
export type CustomIndicatorRequestSpec = {
  /** Name the script reads back via `ctx.data('<key>')` */
  key: string
  /** Timeframe to fetch; omit for the chart's own timeframe */
  timeframe?: string
  /** 'BASE-QUOTE'; omit for the chart's own pair */
  pair?: string
  /** Venue id; omit for the chart's own venue */
  market?: string
}

/**
 * Protective exits evaluated per bar against the held position, independent of
 * what `compute()` returns.
 *
 * These are declarative on purpose. Letting `compute()` see the live position
 * would make a strategy unbacktestable — the replay could never reproduce a
 * decision that depended on runtime state. Keeping the rules here instead means
 * the Strategy Tester and a live bot apply them through the same code, so a
 * backtest stays a claim about what the bot will actually do.
 */
export type CustomIndicatorRiskSpec = {
  /** Stop out this far against the entry, as a fraction (0.02 = 2%) */
  stopLoss?: number
  /** Take profit this far in favour of the entry, as a fraction */
  takeProfit?: number
  /** Trail a stop this far below the best price seen since entry, as a fraction */
  trailingStop?: number
  /** Force an exit after this many bars in the position */
  maxBars?: number
}

/** Backtest settings, present only when a script declares `strategy(...)`. */
export type CustomIndicatorStrategySpec = {
  /** Starting equity, in quote currency */
  initialCapital: number
  /** Fraction of equity committed per position (0..1) */
  positionSize: number
  /** Per-side fee as a fraction of notional, e.g. 0.001 = 0.1% */
  fee: number
  /** Per-side slippage as a fraction of fill price */
  slippage: number
  /** Allow short entries; long-only when false */
  allowShort: boolean
  /** Protective exits; absent when the script declares none */
  risk?: CustomIndicatorRiskSpec
}

export type CustomIndicatorInputSpec =
  | {
      kind: 'int' | 'float'
      key: string
      label?: string
      default: number
      min?: number
      max?: number
      step?: number
    }
  | { kind: 'bool'; key: string; label?: string; default: boolean }
  | {
      kind: 'choice'
      key: string
      label?: string
      default: string
      options: Array<string>
    }
  | {
      /** Candle price source: open/high/low/close/hl2/hlc3/ohlc4 */
      kind: 'source'
      key: string
      label?: string
      default: string
    }

export type CustomIndicatorHLine = {
  value: number
  color?: string
  label?: string
}

/** Declarative metadata a script exports via pairlens.indicator(...) */
export type CustomIndicatorMeta = {
  /** Stable identifier, unique within its provider (slug) */
  id: string
  title: string
  /** 'overlay' = price pane, 'separate' = own sub-pane */
  pane: 'overlay' | 'separate'
  inputs: Array<CustomIndicatorInputSpec>
  series: Array<CustomIndicatorSeriesSpec>
  hlines?: Array<CustomIndicatorHLine>
  markers?: Array<CustomIndicatorMarkerSpec>
  fills?: Array<CustomIndicatorFillSpec>
  alerts?: Array<CustomIndicatorAlertSpec>
  requests?: Array<CustomIndicatorRequestSpec>
  /** Set when the script declared `strategy(...)` instead of `indicator(...)` */
  strategy?: CustomIndicatorStrategySpec
  /** micropip requirements installed before compute (e.g. ['numpy']) */
  packages?: Array<string>
  /** Minimum candles needed before output is meaningful */
  minBars?: number
  /** Decimal places for value read-outs */
  precision?: number
  /** How value read-outs are formatted */
  format?: 'price' | 'percent' | 'volume'
}

/** One importable helper module shipped alongside an indicator's entry file. */
export type CustomIndicatorModule = {
  /** Path relative to the indicator root, e.g. 'helpers.py' or 'math/ema.py' */
  path: string
  source: string
}

export type CustomIndicatorDescriptor = {
  meta: CustomIndicatorMeta
  language: 'python'
  /** Entry module source (defines meta + compute(ctx)) */
  source: string
  /**
   * Helper modules the entry can import by name (`import helpers`). They are
   * written next to the entry in the Python runtime, so a multi-file indicator
   * imports exactly as it would from a folder on disk.
   */
  modules?: Array<CustomIndicatorModule>
}

export type PluginConfigFieldType =
  | 'string'
  | 'secret'
  | 'number'
  | 'boolean'
  | 'select'

export type PluginConfigField = {
  type: PluginConfigFieldType
  label: LocalizedText
  required?: boolean
  default?: unknown
  options?: Array<string> // for 'select' type
}

// UI panel contribution declared in plugin manifest
export type ContributedPanel = {
  id: string // panel ID, unique within plugin
  /**
   * Bundled plugins name a catalog key (`labelKey`) so their translations sit
   * with the rest of ours — one file per language, covered by the parity
   * test. Third-party plugins cannot add catalog entries, so they carry
   * translations inline here instead. Resolution order: labelKey, then this.
   */
  label: LocalizedText
  labelKey?: string // i18n key (takes precedence over label)
  description?: LocalizedText
  descriptionKey?: string // i18n key (takes precedence over description)
  icon: string // lucide icon name
  category: string // PaneCategoryId
  singleton?: boolean
  minHeight?: number
  compact?: boolean
  fitContent?: boolean
  requires?: Array<string> // 'workspace:active-pair', CapabilityId
  requiredAccessLevel?: string
  /**
   * The panel only works inside the desktop app — same declaration a connector
   * makes, at panel granularity. The Web panel is the first: embedding an
   * arbitrary site needs a native child webview, and a browser tab has only an
   * iframe, which most sites refuse. The picker badges and disables it in a
   * browser; a panel that arrives anyway (a synced layout, a template) says so
   * in place of pretending to work.
   */
  requiresDesktop?: boolean
}

// ── Workspace contributions ─────────────────────────────────────────
//
// A plugin ships the workspace presets of the surface it owns: the perps desk
// belongs to the futures plugin, the prediction desk to the predictions
// plugin. Uninstall the plugin and its layouts leave the Workspace Store, the
// workspaces menu and Discovery with it.
//
// The layout shape below is a structural mirror of the terminal's own
// `TerminalLayout`, restated here so `packages/shared` stays the client/server
// contract without pulling terminal internals in. It is deliberately minimal:
// a plugin describes geometry (columns → cells → panes) and nothing about how
// the terminal renders it.

export type ContributedWorkspacePane = {
  id: string
  /** Pane type key, exactly as a saved layout names it (e.g. 'chart'). */
  type: string
  /** slot → workspace variable name, e.g. 'active-pair' → '$pair'. */
  bindings?: Record<string, string>
  /** slot → literal value, overriding any binding. */
  overrides?: Record<string, unknown>
}

export type ContributedWorkspaceCell = {
  id: string
  /** One pane renders bare; more than one renders as a tab strip. */
  panes: Array<ContributedWorkspacePane>
  activeTabIndex?: number
  heightPercent: number
}

export type ContributedWorkspaceColumn = {
  id: string
  cells: Array<ContributedWorkspaceCell>
  widthPercent: number
}

export type ContributedWorkspaceLayout = {
  version: 1
  columns: Array<ContributedWorkspaceColumn>
}

/** Where a contributed workspace is offered (default `standalone`). */
export type ContributedWorkspaceContext = 'standalone' | 'pair' | 'discovery'

/**
 * The three browse facets of the Workspace Store. Kept as plain strings: the
 * terminal owns the vocabularies and filters unknown values out, so a plugin
 * built against an older terminal never breaks the filter bar.
 */
export type ContributedWorkspaceFacets = {
  traderTypes: Array<string>
  assetClasses: Array<string>
  screenSizes: Array<string>
}

/**
 * A workspace preset shipped by a plugin. The terminal derives the workspace
 * variables from the layout's panes, so a contribution declares only the
 * market a copy should open on (`pairDefault`) rather than restating them.
 */
export type ContributedWorkspace = {
  /**
   * Stable id. First-party contributions keep their historical `template:`
   * ids so translations, deep links and popularity survive the move out of
   * the terminal's catalog.
   */
  id: string
  name: string
  /** One-line hook shown on the store card. */
  tagline: string
  /** Longer prose shown in the store detail page. */
  description: string
  /** lucide icon name. */
  icon: string
  facets: ContributedWorkspaceFacets
  tags?: Array<string>
  context?: ContributedWorkspaceContext
  /** Offered as an in-place quick-apply preset in its route's layout menu. */
  routeMenu?: boolean
  /** Short label for that menu (falls back to `name`). */
  menuLabel?: string
  /**
   * Market a copy of this workspace opens on. `null` means "derive the pair
   * variable with no default" — the right answer for contracts that expire.
   */
  pairDefault?: { pairKey: string; market: string } | null
  /** Plugins this workspace needs beyond the ones its panes already imply. */
  requiredPlugins?: Array<{ pluginId: string; reason?: string }>
  featured?: boolean
  layout: ContributedWorkspaceLayout
}

// Command contribution declared in plugin manifest
export type ContributedCommand = {
  id: string // unique within plugin
  label: LocalizedText
  labelKey?: string // i18n (takes precedence)
  icon?: string // lucide icon name
  shortcut?: string // keyboard shortcut display (e.g. "Ctrl+Shift+R")
  when?: string // optional context condition (e.g. "workspace:active-pair")
}

// Status bar item contribution declared in plugin manifest
export type ContributedStatusBarItem = {
  id: string
  label: LocalizedText
  labelKey?: string
  icon?: string
  alignment: 'left' | 'right'
  priority?: number // lower = closer to edge
  tooltip?: LocalizedText
  tooltipKey?: string
}

/**
 * Settings page contribution declared in plugin manifest.
 * @experimental This contribution type is reserved for future use.
 * Settings pages are not yet rendered in the terminal UI.
 */
export type ContributedSettingsPage = {
  id: string
  label: LocalizedText
  labelKey?: string
  icon?: string
}

/**
 * Network access declaration. For sandboxed (non-bundled) plugins this is
 * ENFORCED: the sandbox worker only permits fetch/WebSocket/XHR/EventSource
 * connections to these hosts. Entries are exact hostnames ('api.okx.com') or
 * single-level wildcards ('*.okx.com'). Only http(s)/ws(s) schemes pass.
 * The enforced list is read from the module's own exported manifest (signed
 * content), never from registry metadata.
 */
export type PluginNetworkDeclaration = {
  hosts: Array<string>
}

export type PluginManifest = {
  id: string
  /**
   * Canonical name — an identity, not display text. Logs, sort keys, search
   * indexes and React keys read this, and every one of them wants the same
   * stable value in every language. `title` is what a user sees.
   */
  name: string
  /**
   * Display name, translated by the author.
   *
   * Bundled plugins leave this unset: the terminal derives a catalog key from
   * the plugin id, so our translations stay in `locales/*` with the rest of
   * ours, one file per language. Third-party plugins cannot add catalog
   * entries and carry their translations here instead.
   */
  title?: LocalizedText
  version: string
  author: string
  description: LocalizedText
  homepage?: string
  icon?: string
  minTerminalVersion?: string
  capabilities: Array<PluginCapabilityDeclaration>
  config: Record<string, PluginConfigField>
  /** Declared permissions (informational; network access uses `network`) */
  permissions?: Array<PluginPermission>
  /** Enforced network allowlist for sandboxed plugins */
  network?: PluginNetworkDeclaration
  accessLevels?: Array<string> // ordered lowest → highest, e.g. ['free', 'basic', 'pro', 'max']
  theme?: {
    entry: string
    previewColors?: { light: Array<string>; dark: Array<string> }
  }
  metadata?: Record<string, unknown>
  contributes?: {
    panels?: Array<ContributedPanel>
    /** Workspace presets this plugin ships (store templates + route menus). */
    workspaces?: Array<ContributedWorkspace>
    commands?: Array<ContributedCommand>
    statusBarItems?: Array<ContributedStatusBarItem>
    /** @experimental Reserved for future use — settings pages are not yet rendered in the terminal UI. */
    settings?: Array<ContributedSettingsPage>
  }
}

// Permission declarations (informational — not enforced at runtime)
export type PluginPermission =
  | 'network'
  | 'market-data'
  | 'credentials'
  | 'storage'
