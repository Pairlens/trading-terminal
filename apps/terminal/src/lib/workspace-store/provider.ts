// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { WorkspaceTemplate } from './types'
import type { CommunityWorkspaceSubmitInput } from '@/lib/api'

// ---------------------------------------------------------------------------
// Workspace store providers
//
// The store is "resolvable via a plugin": rather than the UI calling a fixed
// backend, it consumes a set of WorkspaceStoreProviders. Each provider exposes a
// catalog of templates plus optional mutating actions (submit/delete/install/
// favorite), advertised via `capabilities` so the UI hides what a provider can't
// do. First-party providers (the bundled catalog, the Pairlens community store)
// are registered directly; any plugin declaring the `workspace-store:catalog`
// capability is adapted into a provider too — so third parties can offer stores.
// ---------------------------------------------------------------------------

export type WorkspaceStoreListQuery = {
  scope?: 'all' | 'mine'
  sort?: 'recent' | 'popular'
}

export type WorkspaceStoreCapabilities = {
  /** Users can publish their own workspaces to this provider. */
  submit: boolean
  /** Authors can remove their own submissions. */
  delete: boolean
  /** Copies bump a popularity counter. */
  install: boolean
  /** Users can favourite templates. */
  favorite: boolean
}

export type FavoriteResult = { favorites: number; faved: boolean }

export interface WorkspaceStoreProvider {
  /** Stable id stamped onto each template's `community.providerId` for routing. */
  readonly id: string
  /** Human-facing name (e.g. "Pairlens", "Pairlens Community"). */
  readonly label: string
  readonly capabilities: WorkspaceStoreCapabilities
  /** Whether the provider can currently serve requests (e.g. App Server present). */
  isAvailable: () => boolean
  list: (query: WorkspaceStoreListQuery) => Promise<Array<WorkspaceTemplate>>
  submit?: (input: CommunityWorkspaceSubmitInput) => Promise<WorkspaceTemplate>
  delete?: (submissionId: string) => Promise<void>
  install?: (submissionId: string) => Promise<{ installs: number }>
  favorite?: (
    submissionId: string,
    favorited: boolean,
  ) => Promise<FavoriteResult>
}

/**
 * Aggregates every available provider. The store UI and `useWorkspaceTemplates`
 * consume this instead of any single backend, and item actions route back to the
 * owning provider by the template's `community.providerId`.
 */
export type WorkspaceStoreRegistry = {
  /** Available providers only. */
  providers: Array<WorkspaceStoreProvider>
  /** Providers that accept submissions (for the share dialog's target picker). */
  submitProviders: Array<WorkspaceStoreProvider>
  providerFor: (template: WorkspaceTemplate) => WorkspaceStoreProvider | null
  list: (query: WorkspaceStoreListQuery) => Promise<Array<WorkspaceTemplate>>
}
