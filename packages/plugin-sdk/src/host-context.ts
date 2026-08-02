// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext } from 'react'

import type { CapabilityId, PluginManager } from '@pairlens/plugin-system'

// ── Pair state ──────────────────────────────────────────────────────

export type PanePairState = {
  pairKey: string
  market: string
}

// ── Wallet state ───────────────────────────────────────────────────

export type PaneWalletState = {
  walletId: string
  market: string
}

// ── Notify options ──────────────────────────────────────────────────

export type NotifyOptions = {
  type?: 'info' | 'error' | 'success'
  description?: string
}

// ── Plugin host services ────────────────────────────────────────────

export type PluginHostServices = {
  // Plugin identity
  pluginId: string

  // Resolved pair for this pane (override > variable > global)
  pair: PanePairState | null
  pairSource: 'override' | 'variable' | 'global' | null

  // Resolved wallet for this pane (override > variable > global)
  wallet: PaneWalletState | null
  walletSource: 'override' | 'variable' | 'global' | null

  // Plugin system
  pluginManager: PluginManager
  executeCapability: (
    capability: CapabilityId,
    params: Record<string, unknown>,
  ) => Promise<unknown>
  subscribeCapability: (
    capability: CapabilityId,
    params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ) => () => void

  // Auth & access
  isAuthenticated: boolean
  userTier: string | null
  getAccessLevel: (pluginId: string) => string | null

  // Terminal services
  navigate: (path: string) => void
  notify: (message: string, opts?: NotifyOptions) => void

  // Plugin config (this plugin's active config)
  config: Record<string, unknown>

  // Plugin-scoped persistence (localStorage, namespaced by pluginId)
  getStorage: <T>(key: string, defaultValue: T) => T
  setStorage: <T>(key: string, value: T) => void

  // Service registry (cross-plugin communication)
  registerService: (name: string, service: unknown) => () => void
  getService: <T = unknown>(name: string) => T | null
  onServiceChange: (name: string, callback: () => void) => () => void
}

// ── React context ───────────────────────────────────────────────────

export const PluginHostContext = createContext<PluginHostServices | null>(null)
