// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  formatBillingErrorMessage,
  isBillingErrorCode,
} from '@pairlens/shared/billing-types'
import { queryInstruments } from '../catalog'
import { loadOpenAiCompatible } from '../lib/ai-sdk-lazy'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type {
  DeepSearchResponse,
  Instrument,
  InstrumentCategory,
  LiquidationClustersResponse,
  LiquidationsUnavailableResponse,
} from '@pairlens/shared/instrument-types'
import type { WebSearchResponse } from '@pairlens/shared/plugin-types'

/** App Server backend for plugin features (logos, instrument discovery, AI) */
const PAIRLENS_APP_SERVER_URL = 'https://plugins.pairlens.finance'

export const pairlensIntelligenceManifest: PluginManifest = {
  id: 'pairlens-intelligence',
  name: 'Pairlens Intelligence',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'AI inference, instrument discovery, news feeds, and market intelligence powered by the Pairlens backend',
  homepage: 'https://pairlens.finance',
  // Served from the terminal bundle, not pairlens.finance: a first-party
  // plugin's mark must render offline, on the desktop app, and inside the
  // desktop CSP without reaching for the marketing site.
  icon: '/logo512.png',
  // Hosted AI is the paid Pairlens Intelligence add-on: signed-in users start
  // at 'free' (no hosted AI); an active subscription grants 'intelligence'
  // via /api/entitlements. BYOK AI provider plugins are never gated.
  accessLevels: ['free', 'intelligence'],
  metadata: { family: 'intelligence' },
  capabilities: [
    {
      id: 'ai:inference',
      singleton: false,
      markets: ['*'],
      priority: 90,
      streaming: false,
      requiresAuth: true,
      requiredAccessLevel: 'intelligence',
    },
    {
      id: 'ai:web-search',
      singleton: false,
      markets: ['*'],
      priority: 90,
      streaming: false,
      requiresAuth: true,
      requiredAccessLevel: 'intelligence',
    },
    {
      id: 'market-data:discovery',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
    {
      id: 'market-data:discovery:search',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
    {
      id: 'market-data:symbol-logo',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
    {
      // Named venues rather than '*': the App Server only holds a collector for
      // the venues listed here, and a wildcard would let the resolver answer for
      // KuCoin or Kraken Futures with a refusal the pane cannot tell apart from
      // an outage. The pane reads this list to know a venue is not tracked
      // without spending a request to find out.
      //
      // This list is what the server COLLECTS, which is independent of what
      // the terminal can trade: Bybit's entry predates its connector, and the
      // other tradeable perp venues (OKX, KuCoin, Kraken) are absent because
      // no collector holds their streams. Bybit is collected because its
      // stream carries every print where Binance's carries at most one per
      // symbol per second.
      id: 'market-data:liquidations',
      singleton: false,
      markets: ['binance-futures', 'bybit-futures'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
  contributes: {
    panels: [
      {
        id: 'news',
        label: 'News Feed',
        labelKey: 'panes.news',
        descriptionKey: 'paneDescriptions.news',
        icon: 'Newspaper',
        category: 'ai-research',
        singleton: true,
      },
      {
        id: 'symbol-news',
        label: 'Symbol News',
        labelKey: 'panes.symbolNews',
        descriptionKey: 'paneDescriptions.symbolNews',
        icon: 'Newspaper',
        category: 'ai-research',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'social',
        label: 'Social',
        labelKey: 'panes.social',
        descriptionKey: 'paneDescriptions.social',
        icon: 'Globe',
        category: 'ai-research',
        minHeight: 100,
      },
      {
        id: 'top-coins',
        label: 'Top Coins',
        labelKey: 'panes.topCoins',
        descriptionKey: 'paneDescriptions.topCoins',
        icon: 'TrendingUp',
        category: 'discovery',
        singleton: true,
      },
      {
        id: 'heatmap',
        label: 'Heatmap',
        labelKey: 'panes.heatmap',
        descriptionKey: 'paneDescriptions.heatmap',
        icon: 'Grid3X3',
        category: 'discovery',
        singleton: true,
      },
      {
        id: 'fear-greed',
        label: 'Fear & Greed',
        labelKey: 'panes.fearGreed',
        descriptionKey: 'paneDescriptions.fearGreed',
        icon: 'Gauge',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'market-pulse',
        label: 'Market Pulse',
        labelKey: 'panes.marketPulse',
        descriptionKey: 'paneDescriptions.marketPulse',
        icon: 'Activity',
        category: 'discovery',
        minHeight: 80,
      },
      {
        id: 'movers',
        label: 'Movers',
        labelKey: 'panes.movers',
        descriptionKey: 'paneDescriptions.movers',
        icon: 'TrendingUp',
        category: 'discovery',
        minHeight: 120,
      },
      {
        id: 'sector-tape',
        label: 'Sector Tape',
        labelKey: 'panes.sectorTape',
        descriptionKey: 'paneDescriptions.sectorTape',
        icon: 'Boxes',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'sector-peers',
        label: 'Sector Peers',
        labelKey: 'panes.sectorPeers',
        descriptionKey: 'paneDescriptions.sectorPeers',
        icon: 'Network',
        category: 'discovery',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
    ],
  },
}

/**
 * Deployed App Servers may predate the Instrument union and serve rows
 * without a `kind` discriminant. Stamp one from the asset class at the wire
 * boundary so everything downstream can rely on the union.
 */
function normalizeServerInstruments(raw: Array<Instrument>): Array<Instrument> {
  return raw.map((inst) => {
    // The union types `kind` as always-present; the wire row may not have it.
    if ((inst as { kind?: string }).kind) return inst
    const kind = inst.assetClass === 'stocks' ? 'equity' : 'cex-pair'
    return { ...inst, kind } as Instrument
  })
}

export function createPairlensIntelligencePlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  function getAppServerUrl(): string {
    return String(config['appServerUrl'] ?? PAIRLENS_APP_SERVER_URL)
  }

  /**
   * The deep-search consent choke point: the host threads a live getter in
   * at activation. When it says no, any discovery request that would carry
   * USER-TYPED text to the server answers from the bundled catalog instead —
   * one gate for every server-bound search path, so the settings toggle is
   * never a false promise. Browse-shaped discovery (no query text) is not
   * gated: it sends nothing the user typed.
   */
  function discoveryTextAllowed(): boolean {
    const gate = config['discoverySearchAllowed']
    if (typeof gate !== 'function') return true
    try {
      return (gate as () => unknown)() !== false
    } catch {
      return true
    }
  }

  /** Resolve relative URLs from App Server responses against the base URL */
  function resolveAppServerUrl(url: string | null): string | null {
    if (!url) return null
    if (url.startsWith('/')) return `${getAppServerUrl()}${url}`
    return url
  }

  async function resolveAuthToken(): Promise<string> {
    const token = config['authToken']
    if (typeof token === 'function') return String(await token())
    return String(token ?? '')
  }

  async function authHeaders(): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await resolveAuthToken()}`,
    }
  }

  /**
   * Surface the App Server's typed billing 402s (subscription required /
   * credits exhausted) with the code encoded in the message, so the copilot
   * and research UIs can show an upgrade prompt instead of a generic failure.
   */
  async function throwIfBillingError(response: Response): Promise<void> {
    if (response.status !== 402) return
    try {
      const body = (await response.clone().json()) as {
        error?: unknown
        message?: unknown
      }
      if (isBillingErrorCode(body.error)) {
        throw new Error(
          formatBillingErrorMessage(
            body.error,
            typeof body.message === 'string'
              ? body.message
              : 'Pairlens Intelligence subscription required',
          ),
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('pairlens-billing')) {
        throw err
      }
      // Unparseable 402 — fall through to the generic error path.
    }
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    // Empty string = standalone mode (explicitly empty VITE_APP_SERVER_URL).
    // Never fetch with an empty base: the URLs would resolve relative to the
    // hosting origin, wasting a request per call and leaking query params
    // into that origin's access logs.
    const appUrl = getAppServerUrl()
    const headers = await authHeaders()

    if (capability === 'ai:inference') {
      if (!appUrl) {
        throw new Error(
          'pairlens-intelligence: ai inference requires an App Server (standalone mode)',
        )
      }
      // Non-streaming completion through the App Server's OpenAI-compatible
      // inference proxy (the server decides the actual model)
      const response = await fetch(`${appUrl}/api/ai/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'pairlens-default',
          messages: p['messages'] ?? [],
          temperature: p['temperature'],
          max_tokens: p['maxTokens'],
        }),
      })
      if (!response.ok) {
        await throwIfBillingError(response)
        throw new Error(
          `pairlens-intelligence: ai inference failed (${response.status})`,
        )
      }
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        model: string
        usage?: { prompt_tokens: number; completion_tokens: number }
      }
      return {
        content: data.choices[0]?.message.content ?? '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
      }
    }

    if (capability === 'ai:web-search') {
      if (!appUrl) {
        throw new Error(
          'pairlens-intelligence: web search requires an App Server (standalone mode)',
        )
      }
      // Web search through the App Server's search proxy (gateway-backed).
      // The terminal owns the research prompts — this just returns raw
      // results for the client-side loop to format.
      const response = await fetch(`${appUrl}/api/ai/v1/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          objective: String(p['objective'] ?? ''),
          search_queries: p['search_queries'] ?? [],
          max_results: p['max_results'],
        }),
      })
      if (!response.ok) {
        await throwIfBillingError(response)
        throw new Error(
          `pairlens-intelligence: web search failed (${response.status})`,
        )
      }
      return (await response.json()) as WebSearchResponse
    }

    if (capability === 'market-data:discovery') {
      const market = p['market'] ? String(p['market']) : undefined
      const q = p['q'] ? String(p['q']) : undefined
      const category = p['category'] ? String(p['category']) : undefined
      const assetClass = p['assetClass'] ? String(p['assetClass']) : undefined
      const symbolsRaw = p['symbols'] ? String(p['symbols']) : undefined
      const offset = typeof p['offset'] === 'number' ? p['offset'] : 0
      const limit = typeof p['limit'] === 'number' ? p['limit'] : 50

      // Browse is fine without consent; a typed filter (`q`) is not.
      if (!appUrl || (q && !discoveryTextAllowed())) {
        return queryInstruments(market ?? '', p)
      }

      try {
        const qs = new URLSearchParams()
        if (market) qs.set('market', market)
        if (q) qs.set('q', q)
        const qsStr = qs.toString()
        const url = `${appUrl}/api/instruments${qsStr ? `?${qsStr}` : ''}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `pairlens-intelligence: instruments fetch failed (${response.status})`,
          )
        }
        const rawItems = normalizeServerInstruments(
          (await response.json()) as Array<Instrument>,
        )

        const seen = new Map<string, Instrument>()
        for (const inst of rawItems) {
          if (!seen.has(inst.symbol)) {
            seen.set(inst.symbol, inst)
          }
        }
        let items = Array.from(seen.values())

        if (assetClass) {
          items = items.filter((inst) => inst.assetClass === assetClass)
        }

        if (symbolsRaw) {
          const symbolSet = new Set(symbolsRaw.split(',').filter(Boolean))
          items = items.filter((inst) => symbolSet.has(inst.symbol))
          return { items, total: items.length, hasMore: false }
        }

        if (category) {
          items = items.filter((inst) =>
            inst.categories.includes(category as InstrumentCategory),
          )
        }

        const total = items.length
        const paged = items.slice(offset, offset + limit)
        return { items: paged, total, hasMore: offset + limit < total }
      } catch {
        // App Server unreachable (offline / standalone desktop) — fall back to
        // the bundled local catalog so Discovery is never blank.
        return queryInstruments(market ?? '', p)
      }
    }

    if (capability === 'market-data:discovery:search') {
      const query = String(p['query'] ?? '')
      const assetClass = p['assetClass'] ? String(p['assetClass']) : undefined

      // The privacy choke point: search text may only leave the device when
      // the deep-search consent flag allows it.
      if (!appUrl || !discoveryTextAllowed()) {
        if (!query) return { items: [], total: 0, hasMore: false }
        return queryInstruments('', { ...p, q: query })
      }

      try {
        const qs = new URLSearchParams({ q: query })
        // The deep endpoint first — fuzzy names plus the full venue-listings
        // long tail. An older server without it answers 404 and we fall back
        // to the legacy catalog route.
        const deepRes = await fetch(`${appUrl}/api/instruments/search?${qs}`)
        let searchRaw: Array<Instrument>
        if (deepRes.ok) {
          const body = (await deepRes.json()) as DeepSearchResponse
          searchRaw = normalizeServerInstruments(
            Array.isArray(body.items) ? body.items : [],
          )
        } else if (deepRes.status === 404) {
          const response = await fetch(`${appUrl}/api/instruments?${qs}`)
          if (!response.ok) {
            throw new Error(
              `pairlens-intelligence: instrument search failed (${response.status})`,
            )
          }
          searchRaw = normalizeServerInstruments(
            (await response.json()) as Array<Instrument>,
          )
        } else {
          throw new Error(
            `pairlens-intelligence: instrument search failed (${deepRes.status})`,
          )
        }
        const searchSeen = new Map<string, Instrument>()
        for (const inst of searchRaw) {
          if (!searchSeen.has(inst.symbol)) {
            searchSeen.set(inst.symbol, inst)
          }
        }
        let searchItems = Array.from(searchSeen.values())
        if (assetClass) {
          searchItems = searchItems.filter(
            (inst) => inst.assetClass === assetClass,
          )
        }
        return { items: searchItems, total: searchItems.length, hasMore: false }
      } catch {
        // App Server unreachable — fall back to the bundled local catalog.
        if (!query) return { items: [], total: 0, hasMore: false }
        return queryInstruments('', { ...p, q: query })
      }
    }

    if (capability === 'market-data:liquidations') {
      if (!appUrl) {
        throw new Error(
          'pairlens-intelligence: liquidation clusters require an App Server (standalone mode)',
        )
      }
      const venue = String(p['venue'] ?? p['market'] ?? '')
      const pair = String(p['pair'] ?? '')
      if (!venue || !pair) {
        throw new Error(
          'pairlens-intelligence: liquidations requires venue and pair params',
        )
      }
      const qs = new URLSearchParams({ venue, pair })
      if (typeof p['hours'] === 'number') qs.set('hours', String(p['hours']))
      // No auth headers: the endpoint is public and reads none. Sending a
      // bearer token to a route that ignores it is how a "public" endpoint
      // quietly becomes one that cannot be called signed out.
      const response = await fetch(`${appUrl}/api/liquidations?${qs}`)
      if (response.ok) {
        return (await response.json()) as LiquidationClustersResponse
      }
      // The typed refusals are the answer, not a failure: 404 means the
      // collector will never watch this venue, 503 that it has not watched it
      // long enough. Both are states the pane renders in place of the strip,
      // so they are RETURNED — a thrown custom error would not survive the
      // sandbox boundary a third-party plugin serving this capability crosses.
      if (response.status === 404 || response.status === 503) {
        const body = (await response
          .json()
          .catch(() => null)) as LiquidationsUnavailableResponse | null
        if (body?.error === 'liquidations_unavailable') return body
      }
      throw new Error(
        `pairlens-intelligence: liquidations failed (${response.status})`,
      )
    }

    if (capability === 'market-data:symbol-logo') {
      const symbol = String(p['symbol'] ?? '').toLowerCase()
      if (!symbol)
        throw new Error(
          'pairlens-intelligence: symbol-logo requires a symbol param',
        )
      if (!appUrl) return { url: null }
      const assetClass = p['assetClass'] ? String(p['assetClass']) : undefined
      const logoQs = assetClass === 'stocks' ? '?type=ticker' : ''
      const url = `${appUrl}/api/symbol-logo/${encodeURIComponent(symbol)}${logoQs}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(
          `pairlens-intelligence: symbol-logo failed (${response.status})`,
        )
      }
      const data = (await response.json()) as { url: string | null }
      return { url: resolveAppServerUrl(data.url) }
    }

    throw new Error(
      `pairlens-intelligence: unsupported capability '${capability}'`,
    )
  }

  // AI SDK model for the host-run agentic loop. Points at the App Server's
  // OpenAI-compatible inference proxy — the server decides the real model,
  // so the id here is a placeholder the server maps per workload. Auth is
  // injected per request since the session token rotates.
  async function getLanguageModel(
    purpose?: 'chat' | 'research',
  ): Promise<unknown> {
    const appUrl = getAppServerUrl()
    if (!appUrl) {
      throw new Error(
        'pairlens-intelligence: hosted AI requires an App Server (standalone mode)',
      )
    }
    const authedFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${await resolveAuthToken()}`)
      const response = await fetch(input, { ...init, headers })
      // Typed billing 402s must survive the AI SDK's error mapping — throw
      // here so the stream fails with our recognizable message.
      await throwIfBillingError(response)
      return response
    }
    const createOpenAICompatible = await loadOpenAiCompatible()
    return createOpenAICompatible({
      name: 'pairlens-intelligence',
      baseURL: `${appUrl}/api/ai/v1`,
      fetch: authedFetch as typeof fetch,
    }).chatModel(
      purpose === 'research' ? 'pairlens-research' : 'pairlens-default',
    )
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    config = cfg
  }

  async function destroy(): Promise<void> {
    // No transport to clean up — pure REST plugin
  }

  return {
    manifest,
    status: 'installed',
    config,
    execute,
    getLanguageModel,
    initialize,
    destroy,
  }
}
