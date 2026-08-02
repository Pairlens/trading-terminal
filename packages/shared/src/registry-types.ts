// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PluginManifest } from './plugin-types'

// --- Subscription tiers ---

export type SubscriptionTier = 'free' | 'pro' | 'max'

// --- Plugin install source ---

export type PluginInstallSource =
  | { type: 'registry'; registryUrl: string; pluginId: string; version: string }
  | { type: 'manual'; url: string }
  | { type: 'manual'; localPath: string }
  | { type: 'bootstrap' }

// --- Registry data types ---

export type VersionEntry = {
  version: string
  publishedAt: string
  changelog?: string
}

export type RegistryPluginEntry = {
  manifest: PluginManifest
  category: string
  tagline: string
  longDescription?: string
  screenshots?: Array<string>
  featured?: boolean
  featuredImage?: string
  featuredTitle?: string
  featuredText?: string
  /**
   * High-resolution brand mark (≥128px, square-ish) used as store poster art —
   * both the blurred ambient backdrop and the crisp foreground logo. Falls
   * back to `manifest.icon` (usually a small favicon) when absent. Bundled
   * plugins ship theirs in the terminal bundle (`/posters/<id>.png`); Registry
   * publishers should provide an absolute URL.
   */
  posterImage?: string
  popularity?: number
  updatedAt?: string
  bundled?: boolean
  // Phase 3: module distribution
  moduleUrl?: string // ES module bundle URL
  moduleHash?: string // SHA-256 integrity
  styleUrl?: string // CSS bundle URL (null if no UI panels)
  styleHash?: string // SHA-256 of CSS
  /**
   * Detached Ed25519 signature (base64) over the canonical signing payload
   * (see plugin-signing.ts) binding pluginId + version + module/style hashes.
   * REQUIRED for the terminal to install a module from the registry.
   */
  signature?: string
  /** Pinned publisher key id that verifies `signature` */
  publisherKeyId?: string
  /**
   * Distribution tier. 'community' marks repo-submitted plugins that are
   * built + signed by the registry's community key and run sandbox-only.
   * DISPLAY metadata — security enforcement derives from the tier of the
   * publisher key that actually verifies the signature, never this field.
   */
  tier?: 'official' | 'community'
  /** Community submissions: GitHub user/org that owns the plugin's namespace */
  githubUser?: string
  /** Community submissions: URL of the source folder or upstream repo */
  sourceUrl?: string
  latestVersion?: string
  versions?: Array<VersionEntry>
  entitlementTier?: SubscriptionTier
  permissions?: Array<string>
  size?: number // bytes (JS + CSS combined)
  installCount?: number
}

export type RegistryCategory = {
  id: string
  label: string
  description: string
  iconName?: string
}

// --- API response shapes ---

export type RegistryListResponse = {
  plugins: Array<RegistryPluginEntry>
  categories: Array<RegistryCategory>
}

export type RegistryPluginDetailResponse = {
  plugin: RegistryPluginEntry
}

export type RegistryFeaturedResponse = {
  plugins: Array<RegistryPluginEntry>
}

export type RegistryHealthResponse = {
  status: 'ok'
  version: string
}

export type RegistryVersionsResponse = {
  pluginId: string
  versions: Array<VersionEntry>
}

export type RegistryCategoriesResponse = {
  categories: Array<RegistryCategory>
}

export type EntitlementTierDefinition = {
  id: string
  label: string
  order: number
}

export type RegistryEntitlementTiersResponse = {
  tiers: Array<EntitlementTierDefinition>
}
