// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import { api } from '../api'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 3 (context) — the untapped App Server data: market overview, news,
// sentiment, fundamentals, the user's own trade journal, and live web search.
// All read-only, executed in the transport.
// ---------------------------------------------------------------------------

function baseAsset(pair: string): string {
  return (pair.split('-')[0] ?? pair).toUpperCase()
}

function assetClassFor(market?: string): 'crypto' | 'stocks' {
  return market === 'alpaca' ? 'stocks' : 'crypto'
}

/** Defensive parse of an ai:web-search plugin response (untrusted third parties). */
function parseSearchResults(raw: unknown): Array<{
  url: string
  title: string
  excerpt: string
  publishDate: string | null
}> {
  if (typeof raw !== 'object' || raw === null) return []
  const results = (raw as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  const out: Array<{
    url: string
    title: string
    excerpt: string
    publishDate: string | null
  }> = []
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue
    const r = entry as Record<string, unknown>
    const url = typeof r['url'] === 'string' ? r['url'].trim() : ''
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({
      url,
      title: typeof r['title'] === 'string' && r['title'] ? r['title'] : url,
      excerpt:
        typeof r['excerpt'] === 'string' ? r['excerpt'].slice(0, 800) : '',
      publishDate:
        typeof r['publishDate'] === 'string' ? r['publishDate'] : null,
    })
  }
  return out
}

export function buildContextTools(deps: CopilotToolDeps) {
  return {
    get_top_coins: tool({
      description:
        'Get the top coins by market cap with price and 1h/24h/7d change — for market breadth and top movers. Great for "what is moving today".',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().default(25),
      }),
      execute: async ({ limit }) => {
        try {
          const coins = await api.getTopCoins()
          return { count: coins.length, coins: coins.slice(0, limit ?? 25) }
        } catch (err) {
          return {
            coins: [],
            error:
              err instanceof Error
                ? err.message
                : 'Top coins data requires being signed in.',
          }
        }
      },
    }),

    get_news: tool({
      description:
        'Get recent market news with sentiment scores. Pass a ticker/symbol to filter (e.g. "BTC", "SOL"); omit for broad market news.',
      inputSchema: z.object({
        symbol: z
          .string()
          .optional()
          .describe(
            'Base asset to filter by, e.g. BTC. Omit for general news.',
          ),
        limit: z.number().int().min(1).max(50).optional().default(15),
      }),
      execute: async ({ symbol, limit }) => {
        try {
          const sym =
            (symbol ?? baseAsset(deps.getContextInfo().pair ?? '')) || undefined
          const res = await api.getNews({
            tickers: sym,
            limit: limit ?? 15,
          })
          return {
            symbol: sym ?? null,
            articles: (res.articles ?? []).slice(0, limit ?? 15).map((a) => ({
              title: a.title,
              url: a.url,
              source: a.source,
              timePublished: a.timePublished,
              summary: a.summary?.slice(0, 400),
              sentiment: a.overallSentimentLabel,
              sentimentScore: a.overallSentimentScore,
            })),
          }
        } catch (err) {
          return {
            articles: [],
            error:
              err instanceof Error
                ? err.message
                : 'News data requires being signed in.',
          }
        }
      },
    }),

    get_fear_greed: tool({
      description:
        'Get the crypto Fear & Greed index (0–100) — current value, classification, and recent history — for market-emotion context.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const fg = await api.getFearGreed()
          return {
            latest: fg.latest,
            history: (fg.historical ?? []).slice(0, 14),
          }
        } catch (err) {
          return {
            error:
              err instanceof Error
                ? err.message
                : 'Fear & Greed data requires being signed in.',
          }
        }
      },
    }),

    get_asset_overview: tool({
      description:
        'Get fundamentals / profile for an asset — description, supply, category, exchange, links. Defaults to the on-screen asset.',
      inputSchema: z.object({
        symbol: z.string().optional().describe('Ticker/base asset, e.g. BTC'),
      }),
      execute: async ({ symbol }) => {
        const info = deps.getContextInfo()
        const sym = (symbol ?? baseAsset(info.pair ?? '')).toUpperCase()
        try {
          const res = await api.getTickerOverview(
            sym,
            assetClassFor(info.market),
          )
          return { symbol: sym, overview: res.overview }
        } catch (err) {
          return {
            symbol: sym,
            error:
              err instanceof Error
                ? err.message
                : 'Asset overview requires being signed in.',
          }
        }
      },
    }),

    get_trade_journal: tool({
      description:
        "Read the user's own trade journal — logged trades with side, price, size, notes and tags — to analyze their history and performance.",
      inputSchema: z.object({
        pair: z
          .string()
          .optional()
          .describe('Filter to one pair, e.g. BTC-USDT'),
        limit: z.number().int().min(1).max(200).optional().default(50),
      }),
      execute: async ({ pair, limit }) => {
        try {
          const entries = await api.getTradeJournal({
            pairKey: pair,
            limit: limit ?? 50,
          })
          const buys = entries.filter((e) => e.side === 'buy').length
          return {
            count: entries.length,
            summary: { buys, sells: entries.length - buys },
            entries,
          }
        } catch (err) {
          return {
            entries: [],
            error:
              err instanceof Error
                ? err.message
                : 'The trade journal requires being signed in.',
          }
        }
      },
    }),

    web_search: tool({
      description:
        'Search the live web for up-to-date information (news, catalysts, project developments, macro). Use when the answer depends on recent real-world events.',
      inputSchema: z.object({
        query: z.string().min(1).describe('What to search for'),
      }),
      execute: async ({ query }) => {
        const provider =
          deps.pluginManager.getPluginForCapability('ai:web-search')
        if (!provider) {
          return {
            results: [],
            error:
              'No web-search provider is enabled (sign in for Pairlens Intelligence, or enable a search plugin).',
          }
        }
        try {
          const raw = await provider.execute({
            capability: 'ai:web-search',
            params: { objective: query, search_queries: [query] },
            context: deps.pluginManager.getContext(),
          })
          return { query, results: parseSearchResults(raw).slice(0, 8) }
        } catch (err) {
          return {
            query,
            results: [],
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
  }
}
