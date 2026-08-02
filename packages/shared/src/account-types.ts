// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

// ---------------------------------------------------------------------------
// Account self-service: data export (GDPR Art. 20) and erasure (Art. 17).
//
// Both are App Server REST payloads:
//   GET    /api/account/export  → AccountExportBundle
//   DELETE /api/account         → AccountDeletionSummary
//
// The export covers every row the App Server holds keyed to the account.
// It deliberately does NOT cover local-only data (exchange API keys, wallet
// secrets, unsynced workspaces): those never reach the server, so the server
// cannot export them and erasing the account cannot remove them either.
// ---------------------------------------------------------------------------

/** Bumped when the bundle's shape changes in a way importers must notice. */
export const ACCOUNT_EXPORT_FORMAT_VERSION = 1

export type AccountExportProfile = {
  userId: string
  email: string
  emailVerified: boolean
  name: string | null
  /** Server-relative avatar path (`/api/storage/...`), or null. */
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export type AccountExportWorkspace = {
  id: string
  name: string
  panels: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AccountExportChartState = {
  pairKey: string
  indicators: Array<unknown>
  drawings: Array<unknown>
  settings: Record<string, unknown>
  updatedAt: string
}

export type AccountExportAiMessage = {
  id: string
  market: string
  pairKey: string
  role: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type AccountExportTradeJournalEntry = {
  id: string
  market: string
  pairKey: string
  side: string
  price: number
  quantity: number
  notes: string
  tags: Array<string>
  createdAt: string
}

export type AccountExportWorkflow = {
  id: string
  name: string
  description: string
  dsl: unknown
  createdAt: string
  updatedAt: string
}

export type AccountExportNotificationRule = {
  id: string
  name: string
  dsl: unknown
  createdAt: string
  updatedAt: string
}

export type AccountExportNotificationBinding = {
  id: string
  ruleId: string
  pair: string
  market: string
  wallet: string | null
  enabled: boolean
  createdAt: string
}

export type AccountExportPluginPin = {
  capability: string
  market: string
  pluginId: string
  createdAt: string
}

/**
 * Plugin config as the server holds it, decrypted. Keys the server strips on
 * write (`apiSecret`, `passphrase`, `privateKey`, seed phrases, ...) were
 * never stored, so they cannot appear here.
 */
export type AccountExportPluginConfig = {
  pluginId: string
  enabled: boolean
  config: Record<string, unknown>
}

export type AccountExportSignal = {
  id: string
  market: string
  pairKey: string
  timeframe: string
  strategy: string
  direction: string
  confidence: number
  regime: string
  aiStatus: string
  payload: Record<string, unknown>
  createdAt: string
}

export type AccountExportCommunityWorkspace = {
  id: string
  name: string
  tagline: string
  description: string
  icon: string
  facets: Record<string, unknown>
  tags: Array<string>
  variables: Array<unknown>
  layout: unknown
  requiredPlugins: Array<unknown>
  status: string
  installs: number
  favorites: number
  createdAt: string
  updatedAt: string
}

export type AccountExportBilling = {
  /** Polar customer id, when the account ever reached checkout. */
  polarCustomerId: string | null
  subscriptions: Array<{
    id: string
    polarProductId: string
    polarPriceId: string
    status: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    createdAt: string
    updatedAt: string
  }>
  /** Credit packs whose unused remainder expired. */
  creditPackForfeits: Array<{
    grantId: string
    units: number
    forfeitedAt: string
  }>
}

export type AccountExportAffiliate = {
  code: string
  displayName: string
  tier: string
  status: string
  createdAt: string
  updatedAt: string
  links: Array<{
    venue: string
    params: Record<string, string>
    createdAt: string
    updatedAt: string
  }>
}

export type AccountExportBundle = {
  formatVersion: number
  exportedAt: string
  profile: AccountExportProfile
  userConfig: {
    aiPersona: string
    tradingMode: string
    preferences: Record<string, unknown>
    updatedAt: string
  } | null
  riskState: {
    dailyPnl: number
    dailyTradeCount: number
    maxDailyLoss: number
    maxPositionSize: number
    maxDailyTrades: number
    lastUpdated: string
  } | null
  workspaces: Array<AccountExportWorkspace>
  chartStates: Array<AccountExportChartState>
  aiMessages: Array<AccountExportAiMessage>
  tradeJournal: Array<AccountExportTradeJournalEntry>
  workflows: Array<AccountExportWorkflow>
  notificationRules: Array<AccountExportNotificationRule>
  notificationBindings: Array<AccountExportNotificationBinding>
  pluginPins: Array<AccountExportPluginPin>
  pluginConfigs: Array<AccountExportPluginConfig>
  signals: Array<AccountExportSignal>
  communityWorkspaces: Array<AccountExportCommunityWorkspace>
  /** Community workspaces this account favourited (ids, not full copies). */
  communityWorkspaceFavorites: Array<{
    communityWorkspaceId: string
    createdAt: string
  }>
  billing: AccountExportBilling
  affiliate: AccountExportAffiliate | null
}

/**
 * Outcome of erasing the account's product-analytics profile.
 *
 * `not_configured` is the self-hosted default (no PostHog personal API key),
 * and is not a failure. `failed` means the account is gone but its analytics
 * profile outlived it — the only case worth telling the user about, since
 * nothing retries it.
 */
export type AnalyticsErasureOutcome = 'deleted' | 'not_configured' | 'failed'

/** What `DELETE /api/account` actually erased. */
export type AccountDeletionSummary = {
  ok: true
  /** Active Polar subscriptions cancelled as part of the deletion. */
  subscriptionsCancelled: number
  /** True when the stored avatar object was removed from object storage. */
  avatarDeleted: boolean
  /** Whether the PostHog person and their events were erased too. */
  analytics: AnalyticsErasureOutcome
}
