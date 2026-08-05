// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  TerminalLayout,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import type {
  BillingState,
  CreditPackId,
  IntelligencePlan,
  IntelligencePlanId,
} from '@pairlens/shared/billing-types'
import type { AccountDeletionSummary } from '@pairlens/shared/account-types'
import {
  APP_SERVER_CREDENTIALS,
  authClient,
  clearStoredAuthToken,
  hasAppServer,
} from '@/lib/auth-client'
import { isDomainSyncEnabled } from '@/lib/sync/sync-preferences'
import { getInstallableEntries } from '@/lib/plugins/plugin-ledger'

// ---------------------------------------------------------------------------
// Base URLs
//
// All REST calls go to the App Server (default port 4046): auth, persistence,
// AI, cloud data endpoints. Market data never flows through here — it streams
// directly from exchanges via the market connector plugins.
// ---------------------------------------------------------------------------

const getAppServerUrl = () =>
  (import.meta.env.VITE_APP_SERVER_URL ?? 'http://localhost:4046').replace(
    /\/+$/,
    '',
  )

/** App Server base URL — auth, persistence, cloud data endpoints */
export const appServerUrl = getAppServerUrl()

// ---------------------------------------------------------------------------
// Session token cache — deduplicates concurrent getSession() calls and caches
// the token for 60 seconds, eliminating redundant /api/auth/get-session
// roundtrips during startup and normal operation.
// ---------------------------------------------------------------------------

let cachedToken: string | null = null
let cacheExpiry = 0
let inflightPromise: Promise<string | null> | null = null

export async function getSessionToken(): Promise<string | null> {
  if (!hasAppServer) return null
  if (cachedToken && Date.now() < cacheExpiry) return cachedToken
  if (inflightPromise) return inflightPromise
  inflightPromise = authClient
    .getSession()
    .then((result) => {
      cachedToken = result.data?.session?.token ?? null
      cacheExpiry = Date.now() + 60_000
      inflightPromise = null
      return cachedToken
    })
    .catch(() => {
      inflightPromise = null
      return null
    })
  return inflightPromise
}

export function clearSessionCache(): void {
  cachedToken = null
  cacheExpiry = 0
  inflightPromise = null
}

// ---------------------------------------------------------------------------
// Unauthorized handling
//
// When the App Server rejects our credentials (401) — expired/invalid session,
// rotated secret, revoked token — we sign the user out so the UI returns to a
// signed-out state and they can re-authenticate, instead of every subsequent
// request silently failing forever. Debounced so a burst of concurrent 401s
// triggers a single sign-out.
// ---------------------------------------------------------------------------

let lastUnauthorizedAt = 0

export function handleUnauthorized(): void {
  if (!hasAppServer) return
  const now = Date.now()
  if (now - lastUnauthorizedAt < 10_000) return
  lastUnauthorizedAt = now

  clearSessionCache()
  clearStoredAuthToken()
  // signOut clears the better-auth session; `useSession` reactively flips the
  // UI to signed-out. Fire-and-forget — it uses its own transport, not fetchApi,
  // so this cannot recurse.
  void authClient.signOut().catch(() => {})
  // Let the UI surface a "session expired — sign in again" notice.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pairlens:session-expired'))
  }
}

/**
 * Resolve a URL that may be a relative path (e.g. /api/storage/...) to an
 * absolute URL using the App Server base URL.  Data URIs and absolute URLs are
 * returned as-is.
 */
export const resolveUrl = (
  url: string | undefined | null,
): string | undefined => {
  if (!url) return undefined
  if (url.startsWith('data:') || url.startsWith('http')) return url
  return `${appServerUrl}${url}`
}

// ---------------------------------------------------------------------------
// authFetch — the single authenticated transport to the App Server.
//
// Attaches the cached session token, performs the fetch, and routes 401s
// through handleUnauthorized so a dead session flips the UI to signed-out.
// Returns the raw Response so streaming/SSE consumers (AI chat, research)
// can read the body incrementally. All App Server calls — JSON, FormData,
// streams — must go through this instead of raw fetch.
//
// The bearer token is the credential; see APP_SERVER_CREDENTIALS for why
// asking for cookies cross-origin is what breaks the browser build.
// ---------------------------------------------------------------------------

export async function authFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const token = await getSessionToken()

  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    credentials: APP_SERVER_CREDENTIALS,
    headers,
  })

  // Auth rejected while we believed we were signed in → sign out so the user
  // can re-authenticate rather than hammering a dead session.
  if (response.status === 401 && token) {
    handleUnauthorized()
  }

  return response
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await authFetch(`${appServerUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const queryKeys = {
  currentUser: () => ['currentUser'] as const,
  userSettings: () => ['userSettings'] as const,
  signals: (scope: { userId: string; market?: string; pairKey?: string }) =>
    ['signals', scope] as const,
  pluginStates: () => ['pluginStates'] as const,
  pluginPins: () => ['pluginPins'] as const,
  aiMessages: (market: string, pairKey: string) =>
    ['ai-messages', market, pairKey] as const,
  entitlements: () => ['entitlements'] as const,
  billingState: () => ['billing-state'] as const,
  workflows: () => ['workflows'] as const,
  workflow: (id: string) => ['workflow', id] as const,
  /** Prefix for all workspace-store reads across every provider. */
  workspaceStore: () => ['workspace-store'] as const,
}

// ---------------------------------------------------------------------------
// Shape definitions used by terminal routes
// ---------------------------------------------------------------------------

export type CurrentUser = {
  userId: string
  email: string
  name?: string
  image?: string
}

export type UserSettings = {
  avatarUrl?: string | null
}

export type PluginStateResponse = {
  pluginId: string
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * The plugin states this device holds, in the shape the server returns them.
 * The install ledger is the device source of truth for what is installed and
 * how it is configured, so it is the honest answer whenever the account is not
 * being consulted.
 */
function localPluginStates(): Array<PluginStateResponse> {
  return getInstallableEntries().map((entry) => ({
    pluginId: entry.pluginId,
    enabled: entry.enabled,
    config: entry.config,
  }))
}

export type PluginPinResponse = {
  capability: string
  market: string
  pluginId: string
}

export type EntitlementResponse = {
  entitlements: Array<{ pluginId: string; accessLevel: string }>
}

// Community workspaces (user-shared store templates)
export type CommunityWorkspaceFacets = {
  traderTypes: Array<string>
  assetClasses: Array<string>
  screenSizes: Array<string>
}

export type CommunityWorkspaceDto = {
  id: string
  name: string
  tagline: string
  description: string
  icon: string
  author: string
  facets: CommunityWorkspaceFacets
  tags: Array<string>
  variables: Array<WorkspaceVariableDefinition>
  layout: TerminalLayout
  requiredPlugins: Array<{ pluginId: string; reason?: string }>
  installs: number
  favorites: number
  mine: boolean
  faved: boolean
  createdAt: number
  updatedAt: number
}

export type CommunityWorkspaceSubmitInput = {
  name: string
  tagline?: string
  description?: string
  icon?: string
  facets?: Partial<CommunityWorkspaceFacets>
  tags?: Array<string>
  variables?: Array<WorkspaceVariableDefinition>
  layout: TerminalLayout
  requiredPlugins?: Array<{ pluginId: string; reason?: string }>
}

// ---------------------------------------------------------------------------
// Cloud data shapes — read-only market/context data the copilot can pull
// ---------------------------------------------------------------------------

export type TopCoin = {
  symbol: string
  name: string
  price: number
  marketCap: number
  volume24h: number
  percentChange1h: number
  percentChange24h: number
  percentChange7d: number
  logoUrl?: string | null
}

export type NewsArticle = {
  title: string
  url: string
  timePublished?: string
  source?: string
  summary?: string
  topics?: Array<string>
  overallSentimentScore?: number
  overallSentimentLabel?: string
  tickerSentiment?: Array<{
    ticker: string
    tickerSentimentScore?: string
    tickerSentimentLabel?: string
    relevanceScore?: string
  }>
}

export type FearGreed = {
  latest: { value: number; valueClassification: string; timestamp?: number }
  historical?: Array<{
    value: number
    valueClassification: string
    timestamp?: number
  }>
}

export type TickerOverview = {
  overview: Record<string, unknown>
  fetchedAt?: number
}

export type TradeJournalEntry = {
  id: string
  market: string
  pairKey: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  notes?: string | null
  tags?: Array<string> | null
  createdAt: number
}

export type UserConfig = {
  aiPersona?: 'mentor' | 'balanced' | 'technical'
  tradingMode?: 'paper' | 'live'
  preferences?: Record<string, unknown>
}

export type RemoteRiskConfig = {
  dailyPnl?: number
  dailyTradeCount?: number
  maxDailyLoss?: number
  maxPositionSize?: number
  maxDailyTrades?: number
}

// ---------------------------------------------------------------------------
// Cloud-sync gating
//
// Two domains reach the App Server without going through the SyncCoordinator:
// plugin state/pins, and the cloud-only records (AI chat history, trade
// journal). Their switches are enforced here rather than at the ~13 call
// sites, so callers stay unaware.
//
// Reads degrade to the empty shape, which every caller already treats as
// "nothing on the server, the local ledger is authoritative". Writes resolve
// as typed no-ops so TanStack mutations keep working. Deletes are skipped
// outright: turning sync off must never erase the copy already in the account.
// ---------------------------------------------------------------------------

/** Thrown when a call would have recorded something that now goes nowhere. */
export class SyncDisabledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncDisabledError'
  }
}

// ---------------------------------------------------------------------------
// API functions — routed to App Server
// ---------------------------------------------------------------------------

export const api = {
  getCurrentUser: async (): Promise<CurrentUser> => {
    const result = await authClient.getSession()
    const user = result.data?.user
    if (!user) throw new Error('Not authenticated')
    return {
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      image: user.image ?? undefined,
    }
  },

  getUserSettings: () => fetchApi<UserSettings>('/api/user/config'),

  uploadAvatar: async (file: File): Promise<{ avatarUrl: string }> => {
    const formData = new FormData()
    formData.append('avatar', file)

    // No manual Content-Type — the browser sets the multipart boundary.
    const response = await authFetch(`${appServerUrl}/api/user/avatar`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Upload failed')
    }

    const result = (await response.json()) as { avatarUrl: string }
    return { avatarUrl: resolveUrl(result.avatarUrl) ?? result.avatarUrl }
  },

  // With the domain off, the answer is the device ledger — never `[]`. The
  // Plugins UI reads a plugin's saved *config* out of this response (the
  // enable toggle, the Configure dialog's form, the market-connector list),
  // so an empty array would activate a configured plugin with `{}`, render
  // blank fields over a real config, and write that blank back on submit.
  getPluginStates: () =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<Array<PluginStateResponse>>('/api/plugins')
      : Promise.resolve<Array<PluginStateResponse>>(localPluginStates()),

  setPluginState: (data: {
    pluginId: string
    enabled: boolean
    config: Record<string, unknown>
  }) =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<PluginStateResponse>(
          `/api/plugins/${encodeURIComponent(data.pluginId)}`,
          {
            method: 'PUT',
            body: JSON.stringify(data),
          },
        )
      : Promise.resolve<PluginStateResponse>({
          pluginId: data.pluginId,
          enabled: data.enabled,
          config: data.config,
        }),

  removePluginState: (pluginId: string) =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<{ ok: boolean }>(
          `/api/plugins/${encodeURIComponent(pluginId)}`,
          { method: 'DELETE' },
        )
      : Promise.resolve({ ok: true }),

  getPluginPins: () =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<Array<PluginPinResponse>>('/api/plugins/pins')
      : Promise.resolve<Array<PluginPinResponse>>([]),

  setPluginPin: (data: {
    capability: string
    market: string
    pluginId: string
  }) =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<PluginPinResponse>('/api/plugins/pins', {
          method: 'POST',
          body: JSON.stringify(data),
        })
      : Promise.resolve<PluginPinResponse>({ ...data }),

  removePluginPin: (capability: string, market: string) =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<{ ok: boolean }>(
          `/api/plugins/pins?capability=${encodeURIComponent(capability)}&market=${encodeURIComponent(market)}`,
          { method: 'DELETE' },
        )
      : Promise.resolve({ ok: true }),

  removeAllPluginPins: () =>
    isDomainSyncEnabled('plugins')
      ? fetchApi<{ ok: boolean }>('/api/plugins/pins', {
          method: 'DELETE',
        })
      : Promise.resolve({ ok: true }),

  getAiMessages: async (market: string, pairKey: string) => {
    if (!isDomainSyncEnabled('copilot')) return []
    try {
      const rows = await fetchApi<
        Array<{ id: string; role: string; content: string }>
      >(
        `/api/ai-messages?market=${encodeURIComponent(market)}&pairKey=${encodeURIComponent(pairKey)}`,
      )
      // Convert App Server format → UIMessage format for useChat
      return rows.map((r) => ({
        id: r.id,
        role: r.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: r.content }],
      }))
    } catch {
      return []
    }
  },

  saveAiMessage: (
    market: string,
    pairKey: string,
    message: { role: string; parts?: Array<{ type: string; text?: string }> },
  ) =>
    isDomainSyncEnabled('copilot')
      ? fetchApi<{ ok: boolean }>('/api/ai-messages', {
          method: 'POST',
          body: JSON.stringify({
            market,
            pairKey,
            role: message.role,
            content:
              message.parts
                ?.filter((p) => p.type === 'text' && p.text)
                .map((p) => p.text)
                .join('\n') ?? '',
          }),
        })
      : Promise.resolve({ ok: true }),

  // The panel clears itself locally either way; with the domain off, the copy
  // already in the account is deliberately left alone.
  clearAiMessages: (market: string, pairKey: string) =>
    isDomainSyncEnabled('copilot')
      ? fetchApi<{ ok: boolean }>(
          `/api/ai-messages?market=${encodeURIComponent(market)}&pairKey=${encodeURIComponent(pairKey)}`,
          { method: 'DELETE' },
        )
      : Promise.resolve({ ok: true }),

  getEntitlements: () => fetchApi<EntitlementResponse>('/api/entitlements'),

  // ---- Account self-service (GDPR portability + erasure) ----

  /**
   * The full account export as raw JSON text. Kept as text rather than a
   * parsed object: this goes straight to a file, and the server already
   * pretty-prints it for whoever opens it.
   */
  exportAccountData: async (): Promise<string> => {
    const response = await authFetch(`${appServerUrl}/api/account/export`)
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`)
    }
    return response.text()
  },

  /** Erase the account and everything the App Server holds for it. */
  deleteAccount: () =>
    fetchApi<AccountDeletionSummary>('/api/account', { method: 'DELETE' }),

  // ---- Pairlens Intelligence billing (Polar via the App Server) ----

  getBillingState: () => fetchApi<BillingState>('/api/billing/state'),

  /** Returns the hosted Polar checkout URL — open it in the system browser. */
  createBillingCheckout: (plan: IntelligencePlanId) =>
    fetchApi<{ url: string; plan: IntelligencePlan }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  /** Hosted checkout URL for a one-time credit pack (Max plan only). */
  createBillingPackCheckout: (pack: CreditPackId) =>
    fetchApi<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ pack }),
    }),

  /** Returns the pre-authenticated Polar customer-portal URL. */
  createBillingPortal: () =>
    fetchApi<{ url: string }>('/api/billing/portal', { method: 'POST' }),

  // ---- Cloud data (read-only) — surfaced to the copilot as tools ----

  getTopCoins: () => fetchApi<Array<TopCoin>>('/api/top-coins'),

  getHeatmap: () =>
    fetchApi<{ items: Array<TopCoin>; updatedAt?: number }>('/api/heatmap'),

  getNews: (params?: { tickers?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.tickers) qs.set('tickers', params.tickers)
    if (params?.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return fetchApi<{ articles: Array<NewsArticle>; fetchedAt?: number }>(
      `/api/news${suffix}`,
    )
  },

  getFearGreed: () => fetchApi<FearGreed>('/api/fear-greed'),

  getTickerOverview: (ticker: string, assetClass?: 'crypto' | 'stocks') => {
    const qs = new URLSearchParams({ ticker })
    if (assetClass) qs.set('assetClass', assetClass)
    return fetchApi<TickerOverview>(`/api/ticker-overview?${qs.toString()}`)
  },

  getTradeJournal: (params?: {
    market?: string
    pairKey?: string
    limit?: number
  }) => {
    if (!isDomainSyncEnabled('trades')) {
      return Promise.resolve<Array<TradeJournalEntry>>([])
    }
    const qs = new URLSearchParams()
    if (params?.market) qs.set('market', params.market)
    if (params?.pairKey) qs.set('pairKey', params.pairKey)
    if (params?.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return fetchApi<Array<TradeJournalEntry>>(`/api/trade-journal${suffix}`)
  },

  // The one gated write that throws instead of pretending. The journal has no
  // local sink, so a synthesized entry would let the copilot report "logged to
  // your journal" for something that exists nowhere; the copilot's tool catches
  // this and tells the truth instead.
  addTradeJournalEntry: (entry: {
    market: string
    pairKey: string
    side: 'buy' | 'sell'
    price: number
    quantity: number
    notes?: string
    tags?: Array<string>
  }) => {
    if (!isDomainSyncEnabled('trades')) {
      return Promise.reject(
        new SyncDisabledError(
          'Trade journal sync is switched off in Settings → Cloud Sync, so this entry was not recorded.',
        ),
      )
    }
    return fetchApi<TradeJournalEntry>('/api/trade-journal', {
      method: 'POST',
      body: JSON.stringify(entry),
    })
  },

  getUserConfig: () => fetchApi<UserConfig>('/api/user/config'),

  getRiskConfig: () => fetchApi<RemoteRiskConfig>('/api/user/risk'),

  // Workflows
  getWorkflows: () =>
    fetchApi<
      Array<{
        id: string
        name: string
        description: string
        dsl: unknown
        createdAt: number
        updatedAt: number
      }>
    >('/api/workflows'),

  createWorkflow: (data: {
    name: string
    description?: string
    dsl: unknown
  }) =>
    fetchApi<{ id: string }>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWorkflow: (
    id: string,
    data: { name?: string; description?: string; dsl?: unknown },
  ) =>
    fetchApi<{ id: string }>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteWorkflow: (id: string) =>
    fetchApi<{ ok: boolean }>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  removeAvatar: async (): Promise<{ ok: boolean }> => {
    const response = await authFetch(`${appServerUrl}/api/user/avatar`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to remove avatar')
    }

    return response.json() as Promise<{ ok: boolean }>
  },

  // Community workspaces — browse is public; sharing/deleting need a session.
  getCommunityWorkspaces: (opts?: {
    scope?: 'mine'
    sort?: 'recent' | 'popular'
  }) => {
    const params = new URLSearchParams()
    if (opts?.scope) params.set('scope', opts.scope)
    if (opts?.sort) params.set('sort', opts.sort)
    const qs = params.toString()
    return fetchApi<Array<CommunityWorkspaceDto>>(
      `/api/community-workspaces${qs ? `?${qs}` : ''}`,
    )
  },

  submitCommunityWorkspace: (input: CommunityWorkspaceSubmitInput) =>
    fetchApi<CommunityWorkspaceDto>('/api/community-workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteCommunityWorkspace: (id: string) =>
    fetchApi<{ ok: boolean }>(
      `/api/community-workspaces/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  installCommunityWorkspace: (id: string) =>
    fetchApi<{ installs: number }>(
      `/api/community-workspaces/${encodeURIComponent(id)}/install`,
      { method: 'POST' },
    ),

  favoriteCommunityWorkspace: (id: string, favorited: boolean) =>
    fetchApi<{ faved: boolean; favorites: number }>(
      `/api/community-workspaces/${encodeURIComponent(id)}/favorite`,
      { method: favorited ? 'POST' : 'DELETE' },
    ),
}
