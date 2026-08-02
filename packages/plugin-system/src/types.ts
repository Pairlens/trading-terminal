// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Manifest wire-format types (CapabilityId, PluginManifest, declarations,
// contributions) are owned by @pairlens/shared/plugin-types — the wire format
// shared with the registry, app-server, and manifest validation. They are
// re-exported here so plugin-system consumers keep a single import surface.
import type {
  CapabilityId,
  PluginManifest,
} from '@pairlens/shared/plugin-types'

export type {
  CapabilityId,
  PluginCapabilityDeclaration,
  PluginConfigFieldType,
  PluginConfigField,
  ContributedPanel,
  ContributedCommand,
  ContributedStatusBarItem,
  ContributedSettingsPage,
  PluginManifest,
  PluginPermission,
  InferenceMessage,
  InferenceStreamEvent,
  WebSearchRequest,
  WebSearchResult,
  WebSearchResponse,
} from '@pairlens/shared/plugin-types'

// Runtime types
export type PluginStatus = 'installed' | 'active' | 'error' | 'disabled'

export type PluginContext = {
  pair: string
  market: string
  timeframe: string
  mode: 'paper' | 'live'
  country: string // ISO 3166-1 alpha-2 code, e.g. 'US', 'DE', 'JP'
}

export type CapabilityQuery = {
  capability: CapabilityId
  market?: string
}

export type ResolvedPlugin = {
  plugin: PluginInstance
  fallbacks: Array<PluginInstance>
}

// The interface a plugin must implement
export type PluginExecuteParams = {
  capability: CapabilityId
  params: Record<string, unknown>
  context: PluginContext
}

export type PluginInstance = {
  manifest: PluginManifest
  status: PluginStatus
  config: Record<string, unknown>
  execute: (params: PluginExecuteParams) => Promise<unknown>
  subscribe?: (
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ) => () => void
  /**
   * ai:inference plugins may expose a Vercel AI SDK LanguageModel (v3 spec).
   * When present, the host runs the full agentic loop (tools, multi-step)
   * client-side against this model — the plugin only supplies the model.
   * `purpose` lets a plugin serve different models per workload ('chat'
   * copilot vs 'research' report writing); plugins with a single model
   * ignore it. Returns unknown to keep this package free of an `ai`
   * dependency; the host casts to the AI SDK LanguageModel type.
   */
  getLanguageModel?: (purpose?: 'chat' | 'research') => unknown
  initialize?: (config: Record<string, unknown>) => Promise<void>
  destroy?: () => Promise<void>
  // UI panel components — values are framework-specific (e.g. React lazy components)
  getContributedComponents?: () => Record<string, unknown>
  // Command execution — called when user triggers a contributed command
  executeCommand?: (commandId: string, context: PluginContext) => void
  /**
   * Return a React component for a status bar item.
   * Must be a valid React component type (function or class component).
   * @returns A React ComponentType, or null/undefined if no custom rendering needed.
   */
  getStatusBarComponent?: (itemId: string) => unknown
  // Settings component — return a framework-specific component for a settings page
  getSettingsComponent?: (pageId: string) => unknown
}

// Lifecycle listener — enables DynamicPaneRegistry to react to plugin state changes
export type PluginLifecycleListener = {
  onActivated?: (plugin: PluginInstance) => void
  onDeactivated?: (pluginId: string) => void
  onUninstalled?: (pluginId: string) => void
}

// User pin — explicit override of resolution
export type UserPluginPin = {
  capability: CapabilityId
  market: string
  pluginId: string
}

// Access control types

export type CapabilityAccessStatus =
  | 'granted'
  | 'auth-required'
  | 'upgrade-required'
  | 'unavailable'

export type CapabilityAccessResult = {
  status: CapabilityAccessStatus
  pluginId: string | null
  requiredAccessLevel?: string
  currentAccessLevel?: string | null
}

export type AccessProvider = {
  isAuthenticated: () => boolean
  getAccessLevel: (pluginId: string) => string | null
}

// Priority ranges
export const PRIORITY_RESERVED_FIRST_PARTY_MIN = 0
export const PRIORITY_RESERVED_FIRST_PARTY_MAX = 9
export const PRIORITY_COMMUNITY_MIN = 10
export const PRIORITY_COMMUNITY_MAX = 89
export const PRIORITY_RESERVED_FALLBACK_MIN = 90
export const PRIORITY_RESERVED_FALLBACK_MAX = 99
