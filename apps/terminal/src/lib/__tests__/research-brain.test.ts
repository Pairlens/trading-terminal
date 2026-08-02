// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import {
  buildResearchSystemPrompt,
  buildSearchRequest,
  formatSearchContext,
  parseWebSearchResponse,
  runResearch,
} from '../research-brain'
import type { ResearchMarketData, WebSearchResult } from '../research-brain'
import type { PluginInstance, PluginManager } from '@pairlens/plugin-system'

function candle(i: number) {
  return { ts: i * 1000, open: 100, high: 110, low: 90, close: 105, volume: 10 }
}

const marketData: ResearchMarketData = {
  dailyCandles: Array.from({ length: 60 }, (_, i) => candle(60 - i)),
  hourlyCandles: Array.from({ length: 48 }, (_, i) => candle(48 - i)),
  ticker: { last: 105, ts: 1 },
  signals: [{ direction: 'long' }],
}

function reportModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: text },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        ],
      }),
    }),
  })
}

function fakeManager(plugins: {
  inference?: PluginInstance | null
  search?: PluginInstance | null
}): PluginManager {
  return {
    getPluginForCapability: (capability: string) =>
      capability === 'ai:inference'
        ? (plugins.inference ?? null)
        : capability === 'ai:web-search'
          ? (plugins.search ?? null)
          : null,
    getContext: () => ({
      pair: 'BTC-USDT',
      market: 'okx',
      timeframe: '1h',
      mode: 'paper',
      country: '',
    }),
  } as unknown as PluginManager
}

function searchPlugin(results: Array<WebSearchResult>): {
  plugin: PluginInstance
  received: Array<Record<string, unknown>>
} {
  const received: Array<Record<string, unknown>> = []
  const plugin: PluginInstance = {
    manifest: { id: 'pairlens-intelligence' } as PluginInstance['manifest'],
    status: 'active',
    config: {},
    execute: async (params) => {
      received.push(params.params)
      return { results }
    },
  }
  return { plugin, received }
}

describe('buildResearchSystemPrompt', () => {
  test('embeds market data summaries and report structure', () => {
    const prompt = buildResearchSystemPrompt({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
    })
    expect(prompt).toContain('Exchange: OKX | Instrument: BTC-USDT')
    expect(prompt).toContain('"latestPrice":105')
    expect(prompt).toContain('"sma20"')
    expect(prompt).toContain('### Executive Summary')
    expect(prompt).toContain('### Trade Setup')
    // Raw candle rows must not leak into the prompt
    expect(prompt).not.toContain('recentCandles')
  })

  test('embeds optional enrichment sections when provided', () => {
    const prompt = buildResearchSystemPrompt({
      market: 'okx',
      pair: 'SOL-USDT',
      marketData: {
        ...marketData,
        news: [
          {
            title: 'SOL upgrade ships',
            url: 'https://news.example/sol',
            source: 'Example',
            publishedAt: '2026-07-05',
            sentiment: 'Bullish',
            summary: 'Solana shipped an upgrade.',
          },
        ],
        fearGreed: { latest: { value: 61, valueClassification: 'Greed' } },
        assetOverview: { category: 'L1', maxSupply: null },
        benchmark: { pair: 'BTC-USDT', dailyCandles: marketData.dailyCandles },
      },
    })
    expect(prompt).toContain('### Recent news with sentiment')
    expect(prompt).toContain('[SOL upgrade ships](https://news.example/sol)')
    expect(prompt).toContain('[sentiment: Bullish]')
    expect(prompt).toContain('### Crypto Fear & Greed index')
    expect(prompt).toContain('### Asset profile (fundamentals)')
    expect(prompt).toContain('### Benchmark: BTC-USDT daily')
    expect(prompt).toContain('Relative strength')
  })

  test('omits enrichment sections when data is absent', () => {
    const prompt = buildResearchSystemPrompt({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
    })
    expect(prompt).not.toContain('### Recent news')
    expect(prompt).not.toContain('### Crypto Fear & Greed')
    expect(prompt).not.toContain('### Asset profile')
    expect(prompt).not.toContain('### Benchmark:')
  })

  test('switches catalyst framing for stocks (alpaca)', () => {
    const prompt = buildResearchSystemPrompt({
      market: 'alpaca',
      pair: 'AAPL-USD',
      marketData,
    })
    expect(prompt).toContain('equities')
    expect(prompt).toContain('Earnings')
    expect(prompt).not.toContain('on-chain')
  })
})

describe('buildSearchRequest', () => {
  test('builds crypto queries from the base asset', () => {
    const req = buildSearchRequest('okx', 'SOL-USDT')
    expect(req.objective).toContain('SOL')
    expect(req.search_queries.some((q) => q.includes('on-chain'))).toBe(true)
  })

  test('builds equity queries for alpaca', () => {
    const req = buildSearchRequest('alpaca', 'NVDA-USD')
    expect(req.search_queries.some((q) => q.includes('earnings'))).toBe(true)
  })
})

describe('runResearch', () => {
  test('searches, then streams the report with sources + search context', async () => {
    const model = reportModel('### Executive Summary\nBullish.')
    const { plugin: search, received } = searchPlugin([
      {
        url: 'https://example.com/a',
        title: 'BTC rally',
        excerpt: 'Bitcoin rallied…',
      },
    ])
    const inference: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: (purpose) => {
        expect(purpose).toBe('research')
        return model
      },
    }

    const deltas: Array<string> = []
    let seenSources: Array<{ url: string; title: string }> = []
    const { report, sources } = await runResearch({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
      pluginManager: fakeManager({ inference, search }),
      onSources: (s) => {
        seenSources = s
      },
      onDelta: (d) => deltas.push(d),
    })

    expect(report).toContain('Bullish')
    expect(deltas.join('')).toBe(report)
    expect(sources).toEqual([
      { url: 'https://example.com/a', title: 'BTC rally' },
    ])
    expect(seenSources).toEqual(sources)
    // The search plugin received the client-built request
    expect(String(received[0]['objective'])).toContain('BTC')
    // The model prompt carried the formatted search context + market data
    const call = model.doStreamCalls[0]
    const promptText = JSON.stringify(call.prompt)
    expect(promptText).toContain('BTC rally')
    expect(promptText).toContain('senior research analyst')
  })

  test('merges news URLs into sources, deduped against web results', async () => {
    const model = reportModel('### Executive Summary\nOk.')
    const { plugin: search } = searchPlugin([
      { url: 'https://example.com/a', title: 'BTC rally', excerpt: '…' },
    ])
    const inference: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }

    const { sources } = await runResearch({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData: {
        ...marketData,
        news: [
          { title: 'Dupe of web result', url: 'https://example.com/a' },
          { title: 'Fresh news', url: 'https://news.example/btc' },
          { title: 'Bad url', url: 'not-a-url' },
        ],
      },
      pluginManager: fakeManager({ inference, search }),
    })

    expect(sources).toEqual([
      { url: 'https://example.com/a', title: 'BTC rally' },
      { url: 'https://news.example/btc', title: 'Fresh news' },
    ])
  })

  test('degrades to data-only report when no search provider resolves', async () => {
    const model = reportModel('Report without web data.')
    const inference: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }

    const { report, sources } = await runResearch({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
      pluginManager: fakeManager({ inference }),
    })

    expect(report).toContain('Report without web data')
    expect(sources).toEqual([])
    const promptText = JSON.stringify(model.doStreamCalls[0].prompt)
    expect(promptText).toContain('No search results available')
  })

  test('continues without sources when the search provider throws', async () => {
    const model = reportModel('Still produced a report.')
    const search: PluginInstance = {
      manifest: { id: 'pairlens-intelligence' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => {
        throw new Error('search proxy 503')
      },
    }
    const inference: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }

    const { report, sources } = await runResearch({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
      pluginManager: fakeManager({ inference, search }),
    })
    expect(report).toContain('Still produced')
    expect(sources).toEqual([])
  })

  test('falls back to non-streaming execute for plugins without a model', async () => {
    const inference: PluginInstance = {
      manifest: { id: 'third-party' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => ({ content: 'full report' }),
    }

    const deltas: Array<string> = []
    const { report } = await runResearch({
      market: 'okx',
      pair: 'BTC-USDT',
      marketData,
      pluginManager: fakeManager({ inference }),
      onDelta: (d) => deltas.push(d),
    })
    expect(report).toBe('full report')
    expect(deltas).toEqual(['full report'])
  })

  test('throws when no inference provider is active', async () => {
    expect(
      runResearch({
        market: 'okx',
        pair: 'BTC-USDT',
        marketData,
        pluginManager: fakeManager({}),
      }),
    ).rejects.toThrow('No AI provider')
  })

  test('surfaces an empty report as an error', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
            },
          ],
        }),
      }),
    })
    const inference: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }

    expect(
      runResearch({
        market: 'okx',
        pair: 'BTC-USDT',
        marketData,
        pluginManager: fakeManager({ inference }),
      }),
    ).rejects.toThrow('empty report')
  })
})

describe('parseWebSearchResponse', () => {
  test('accepts a contract-conforming response', () => {
    const parsed = parseWebSearchResponse({
      results: [
        {
          url: 'https://a.com',
          title: 'A',
          excerpt: 'text',
          publishDate: '2026-07-01',
        },
      ],
    })
    expect(parsed).toEqual([
      {
        url: 'https://a.com',
        title: 'A',
        excerpt: 'text',
        publishDate: '2026-07-01',
      },
    ])
  })

  test('drops malformed entries, non-http urls, and duplicates; coerces fields', () => {
    const parsed = parseWebSearchResponse({
      results: [
        { url: 'https://a.com' }, // missing fields → coerced
        { url: 'https://a.com', title: 'dupe' }, // duplicate url → dropped
        { url: 'javascript:alert(1)', title: 'evil' }, // non-http → dropped
        { title: 'no url' }, // no url → dropped
        'not an object', // → dropped
        { url: 'https://b.com', title: 42, excerpt: { x: 1 } }, // bad types → coerced
      ],
    })
    expect(parsed).toEqual([
      {
        url: 'https://a.com',
        title: 'https://a.com',
        excerpt: '',
        publishDate: null,
      },
      {
        url: 'https://b.com',
        title: 'https://b.com',
        excerpt: '',
        publishDate: null,
      },
    ])
  })

  test('returns empty for non-conforming payloads', () => {
    expect(parseWebSearchResponse(null)).toEqual([])
    expect(parseWebSearchResponse('report')).toEqual([])
    expect(parseWebSearchResponse({ results: 'nope' })).toEqual([])
  })
})

describe('formatSearchContext', () => {
  test('caps excerpt length and result count', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Result ${i}`,
      excerpt: 'x'.repeat(5000),
    }))
    const ctx = formatSearchContext(results)
    const lines = ctx.split('\n')
    expect(lines.length).toBe(12)
    expect(lines[0].length).toBeLessThan(1100)
  })
})
