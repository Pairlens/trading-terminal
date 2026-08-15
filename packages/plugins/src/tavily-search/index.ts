// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { fanOutWebSearch, readSearchRequest } from '../lib/web-search'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { WebSearchResult } from '@pairlens/shared/plugin-types'

// Tavily Search — BYOK ai:web-search provider. api.tavily.com sends CORS
// headers, so it works from the browser and the Tauri webview alike.

export const tavilySearchManifest: PluginManifest = {
  id: 'tavily-search',
  name: 'Tavily Search',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Web search grounding for AI research via the Tavily Search API (bring your own key)',
  homepage: 'https://tavily.com',
  icon: 'https://tavily.com/favicon.ico',
  metadata: { family: 'ai-byok' },
  capabilities: [
    {
      id: 'ai:web-search',
      singleton: false,
      markets: ['*'],
      priority: 10,
      streaming: false,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'Tavily API Key',
      required: true,
    },
  },
}

type TavilyResult = {
  url?: string
  title?: string
  content?: string
  published_date?: string
}

/** Map a raw Tavily /search response to the WebSearchResult wire contract. */
export function mapTavilyResults(data: unknown): Array<WebSearchResult> {
  const results = (data as { results?: Array<TavilyResult> } | null)?.results
  if (!Array.isArray(results)) return []
  return results
    .filter((r) => typeof r.url === 'string' && r.url.length > 0)
    .map((r) => ({
      url: r.url!,
      title: r.title || r.url!,
      excerpt: r.content ?? '',
      publishDate: r.published_date ?? null,
    }))
}

export function createTavilySearchPlugin(
  manifest: PluginManifest,
): PluginInstance {
  let config: Record<string, unknown> = {}

  async function searchOne(
    query: string,
    perQueryLimit: number,
  ): Promise<Array<WebSearchResult>> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(config['apiKey'] ?? '')}`,
      },
      body: JSON.stringify({
        query,
        max_results: perQueryLimit,
        search_depth: 'basic',
      }),
    })
    if (!response.ok) {
      throw new Error(`Tavily API error ${response.status}`)
    }
    return mapTavilyResults(await response.json())
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    if (params.capability !== 'ai:web-search') {
      throw new Error(
        `tavily-search: unsupported capability '${params.capability}'`,
      )
    }
    const { queries, maxResults } = readSearchRequest(params.params)
    return fanOutWebSearch(queries, maxResults, searchOne)
  }

  async function initialize(cfg: Record<string, unknown>): Promise<void> {
    // Without a key every request fails — refuse to activate so a keyless
    // install never wins ai:web-search resolution
    if (String(cfg['apiKey'] ?? '').trim() === '') {
      throw new Error('Tavily API key required — add it in the plugin settings')
    }
    config = cfg
  }

  return {
    manifest,
    status: 'installed',
    config,
    execute,
    initialize,
  }
}
