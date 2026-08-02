// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { streamText } from 'ai'
import { summarizeCandles } from './copilot-brain'
import type { LanguageModel } from 'ai'
import type { CopilotCandle } from './copilot-brain'
import type { PluginInstance, PluginManager } from '@pairlens/plugin-system'
import type {
  InferenceMessage,
  InferenceStreamEvent,
  WebSearchRequest,
  WebSearchResult,
} from '@pairlens/shared/plugin-types'

// The research brain: prompts + two-phase loop for AI research reports.
//
// Like the copilot (copilot-brain.ts), ALL research logic lives here in the
// terminal. The resolved plugins only supply access:
//   - ai:web-search  → raw web results (Pairlens Intelligence proxies the
//     gateway's parallel search; absent for signed-out BYOK users, in which
//     case the report is generated from market data alone)
//   - ai:inference   → the model that writes the report (server-decided for
//     Pairlens Intelligence via the 'pairlens-research' placeholder id, or
//     the BYOK provider's configured model)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResearchSource = { url: string; title: string }

// Wire contract for ai:web-search plugins — re-exported for convenience
export type { WebSearchRequest, WebSearchResult }

export type ResearchNewsItem = {
  title: string
  url: string
  source?: string
  publishedAt?: string
  sentiment?: string
  summary?: string
}

export type ResearchMarketData = {
  dailyCandles: Array<CopilotCandle>
  hourlyCandles: Array<CopilotCandle>
  ticker: unknown
  signals: Array<unknown>
  // Optional enrichment, fetched best-effort by the panel. Absent for
  // signed-out users (App Server data) or when a fetch fails — the report
  // degrades gracefully, section by section.
  news?: Array<ResearchNewsItem>
  fearGreed?: unknown
  assetOverview?: unknown
  benchmark?: { pair: string; dailyCandles: Array<CopilotCandle> }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function assetClassForMarket(market: string): 'crypto' | 'stocks' {
  return market === 'alpaca' ? 'stocks' : 'crypto'
}

function summarizeForPrompt(candles: Array<CopilotCandle>) {
  // recentCandles would dump raw OHLCV rows into the prompt — the research
  // report works from the aggregate summary only
  const { recentCandles: _omit, ...summary } = summarizeCandles(candles)
  return summary
}

export function buildResearchSystemPrompt(ctx: {
  market: string
  pair: string
  marketData: ResearchMarketData
}): string {
  const { market, pair, marketData } = ctx
  const baseAsset = pair.split('-')[0] ?? pair
  const assetClass = assetClassForMarket(market)
  const isCrypto = assetClass === 'crypto'

  const dailySummary = summarizeForPrompt(marketData.dailyCandles)
  const hourlySummary = summarizeForPrompt(marketData.hourlyCandles)
  const signals = marketData.signals.slice(0, 5)

  // Optional enrichment sections — each renders only when its data arrived
  const enrichment: Array<string> = []
  if (marketData.benchmark && marketData.benchmark.dailyCandles.length > 0) {
    enrichment.push(
      `### Benchmark: ${marketData.benchmark.pair} daily (summarized) — use for relative strength`,
      JSON.stringify(summarizeForPrompt(marketData.benchmark.dailyCandles)),
    )
  }
  if (marketData.assetOverview) {
    enrichment.push(
      '### Asset profile (fundamentals)',
      JSON.stringify(marketData.assetOverview).slice(0, 2500),
    )
  }
  if (marketData.fearGreed) {
    enrichment.push(
      '### Crypto Fear & Greed index',
      JSON.stringify(marketData.fearGreed),
    )
  }
  if (marketData.news && marketData.news.length > 0) {
    enrichment.push(
      '### Recent news with sentiment (citable — these URLs are in the source list)',
      ...marketData.news
        .slice(0, 8)
        .map(
          (n) =>
            `- [${n.title}](${n.url})${n.source ? ` — ${n.source}` : ''}${n.publishedAt ? ` (${n.publishedAt})` : ''}${n.sentiment ? ` [sentiment: ${n.sentiment}]` : ''}${n.summary ? `: ${n.summary.slice(0, 300)}` : ''}`,
        ),
    )
  }

  const catalystExamples = isCrypto
    ? [
        '- Token events: unlocks, upgrades, hard forks, airdrops, listings/delistings.',
        '- Protocol metrics: TVL changes, revenue, active addresses, developer activity.',
        '- Partnerships, integrations, or ecosystem developments.',
        '- Regulatory developments specific to this asset or its ecosystem.',
      ]
    : [
        '- Earnings: recent or upcoming reports, revenue/EPS surprises, guidance changes.',
        '- Corporate actions: buybacks, dividends, splits, M&A, insider transactions.',
        '- Sector developments: competitor moves, regulatory changes, industry trends.',
        '- Analyst coverage: upgrades/downgrades, price target changes.',
      ]

  const marketContextItems = isCrypto
    ? [
        '- **Macro**: Fed/ECB policy, DXY direction, risk-on/risk-off sentiment, equity correlation.',
        '- **Crypto-wide flows**: BTC dominance trend, total market cap direction, stablecoin flows.',
        '- **On-chain** (if found): exchange reserve changes, whale wallet movements, funding rates, open interest.',
      ]
    : [
        '- **Macro**: Fed/ECB policy, treasury yields, DXY, inflation data, employment reports.',
        '- **Sector rotation**: money flow into/out of this sector, relative strength vs. S&P 500.',
        '- **Institutional activity** (if found): 13F filings, dark pool prints, options flow, short interest.',
      ]

  const riskExamples = isCrypto
    ? [
        '- Macro tail risks (rate surprises, geopolitical, regulatory crackdowns).',
        '- Protocol-specific risks (smart contract exploits, team token dumps, governance attacks).',
        '- Market structure risks (liquidity gaps, exchange-specific issues, correlated liquidation cascades).',
      ]
    : [
        '- Macro tail risks (rate surprises, recession signals, geopolitical disruptions).',
        '- Company-specific risks (earnings misses, management changes, litigation, debt concerns).',
        '- Market structure risks (liquidity gaps, sector contagion, crowded positioning).',
      ]

  if (marketData.benchmark) {
    marketContextItems.push(
      `- **Relative strength**: compare ${pair} against the ${marketData.benchmark.pair} benchmark summary provided in the data — is it leading or lagging?`,
    )
  }

  return [
    `You are a senior research analyst specializing in ${isCrypto ? 'crypto' : 'equities'}, writing actionable spot-market research.`,
    'Your audience is experienced traders who want data-driven analysis — not generic commentary.',
    `Report date: ${new Date().toISOString().slice(0, 10)} (UTC). Weigh every source's recency against this date.`,
    '',
    '## Live Market Data',
    `Exchange: ${market.toUpperCase()} | Instrument: ${pair} | Base asset: ${baseAsset}`,
    '',
    '### Daily candles (summarized)',
    JSON.stringify(dailySummary),
    '### Hourly candles (summarized)',
    JSON.stringify(hourlySummary),
    '### Ticker snapshot',
    JSON.stringify(marketData.ticker),
    '### Recent signals',
    JSON.stringify(signals),
    ...enrichment,
    '',
    '## Report structure (use these H3 headings exactly)',
    '### Executive Summary',
    'Open with the directional verdict in bold — **Bullish**, **Bearish**, or **Neutral** — then the rationale.',
    '### Price Action & Structure',
    'Trend, key levels, volume, MAs, volatility. Include these two lines so levels render on the chart:',
    '**Support**: $level, $level',
    '**Resistance**: $level, $level',
    '### Catalysts & Developments',
    ...catalystExamples,
    'Cite with inline links.',
    '### Market Context',
    ...marketContextItems,
    '### Trade Setup',
    'Start with these exact bold-key lines (one per line — they render as a card), then any commentary:',
    '**Bias**: Long | Short | Flat',
    '**Entry**: $zone or price',
    '**Invalidation**: $price (stop)',
    '**Targets**: T1 $price, T2 $price',
    '**R:R**: ratio',
    '### Risk Factors',
    ...riskExamples,
    '### Sources',
    'Numbered list of URLs.',
    '',
    '## Rules',
    '- 1000-1800 words. Dense, not padded — depth comes from specifics (numbers, dates, named events), not length.',
    '- The Live Market Data above is authoritative for the current price and levels; web sources may be stale. When a source conflicts with the live data, trust the live data and note the discrepancy.',
    '- Cite web-sourced claims inline as [Source Title](url), using ONLY URLs from the provided search results or the news list above — never invent or alter a URL. Observations from the live market data need no citation.',
    '- If the evidence is mixed or thin, say so — a Neutral verdict with honest reasoning beats a forced call. In Trade Setup, if no setup is attractive, state the conditions that would create one instead of inventing levels.',
    '- Dollar amounts ($67,432.50) and signed percentages (+2.34%).',
    '- No report title (UI renders it). Start with Executive Summary.',
    '- End with: *This report is for informational purposes only and does not constitute financial advice.*',
  ].join('\n')
}

export function buildSearchRequest(
  market: string,
  pair: string,
): WebSearchRequest {
  const baseAsset = pair.split('-')[0] ?? pair
  const isCrypto = assetClassForMarket(market) === 'crypto'
  const search_queries = isCrypto
    ? [
        `${baseAsset} price analysis this week`,
        `${baseAsset} news catalyst`,
        `${baseAsset} on-chain whale exchange flows`,
        `${baseAsset} protocol development upgrade`,
        'crypto market macro outlook',
      ]
    : [
        `${baseAsset} stock price analysis this week`,
        `${baseAsset} earnings news`,
        `${baseAsset} institutional activity`,
        `${baseAsset} analyst rating price target`,
        'stock market outlook this week',
      ]
  return {
    objective: `Gather trading-relevant intelligence about ${baseAsset} (trading as ${pair} on ${market.toUpperCase()}): recent price analysis, news catalysts, ${isCrypto ? 'on-chain flows' : 'institutional activity'}, and broader market outlook.`,
    search_queries,
    // Matches MAX_CONTEXT_RESULTS so the prompt uses everything we fetch
    max_results: 12,
  }
}

const MAX_EXCERPT_CHARS = 1000
const MAX_CONTEXT_RESULTS = 12

/**
 * Defensively validate an ai:web-search plugin response against the wire
 * contract (WebSearchResponse). Third-party providers are untrusted —
 * malformed entries are dropped, fields are coerced to strings, and http(s)
 * URLs are required so a bad plugin can't corrupt the prompt or the
 * clickable source list.
 */
export function parseWebSearchResponse(raw: unknown): Array<WebSearchResult> {
  if (typeof raw !== 'object' || raw === null) return []
  const results = (raw as { results?: unknown }).results
  if (!Array.isArray(results)) return []

  const seen = new Set<string>()
  const parsed: Array<WebSearchResult> = []
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue
    const r = entry as Record<string, unknown>
    const url = typeof r['url'] === 'string' ? r['url'].trim() : ''
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    parsed.push({
      url,
      title: typeof r['title'] === 'string' && r['title'] ? r['title'] : url,
      excerpt: typeof r['excerpt'] === 'string' ? r['excerpt'] : '',
      publishDate:
        typeof r['publishDate'] === 'string' ? r['publishDate'] : null,
    })
  }
  return parsed
}

export function formatSearchContext(results: Array<WebSearchResult>): string {
  return results
    .slice(0, MAX_CONTEXT_RESULTS)
    .map((r) => {
      // Surface the publish date so the model can weigh source freshness
      const published = r.publishDate ? ` (published ${r.publishDate})` : ''
      return `- [${r.title || 'Untitled'}](${r.url})${published}: ${(r.excerpt ?? '').slice(0, MAX_EXCERPT_CHARS)}`
    })
    .join('\n')
}

export function buildResearchUserPrompt(
  market: string,
  pair: string,
  searchContext: string,
): string {
  return [
    `Write the research report for ${pair} on ${market.toUpperCase()}.`,
    'Synthesize the live market data with the web search results below.',
    'Weigh sources by recency and specificity; ignore results that do not bear on this asset or its market context.',
    '',
    '## Web Search Results',
    searchContext ||
      '(No search results available — rely on the provided market data only, and skip web-dependent claims rather than inventing them.)',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Two-phase research loop
// ---------------------------------------------------------------------------

export type RunResearchOptions = {
  market: string
  pair: string
  marketData: ResearchMarketData
  pluginManager: PluginManager
  abortSignal?: AbortSignal
  // Fires when the web-search phase resolves (possibly with zero sources)
  onSources?: (sources: Array<ResearchSource>) => void
  onDelta?: (text: string) => void
}

export async function runResearch(
  opts: RunResearchOptions,
): Promise<{ report: string; sources: Array<ResearchSource> }> {
  const { market, pair, marketData, pluginManager, abortSignal } = opts

  const inferenceProvider = pluginManager.getPluginForCapability('ai:inference')
  if (!inferenceProvider) {
    throw new Error(
      'No AI provider is enabled. Enable one on the Plugins page.',
    )
  }

  // Phase 1: web search — optional. Signed-out BYOK users have no
  // ai:web-search provider; the report degrades to market-data-only.
  let results: Array<WebSearchResult> = []
  const searchProvider = pluginManager.getPluginForCapability('ai:web-search')
  if (searchProvider) {
    try {
      const searchResponse = await searchProvider.execute({
        capability: 'ai:web-search',
        params: buildSearchRequest(market, pair),
        context: pluginManager.getContext(),
      })
      results = parseWebSearchResponse(searchResponse)
    } catch (err) {
      console.warn('[research] web search failed, continuing without:', err)
    }
  }
  if (abortSignal?.aborted) throw new Error('Aborted')

  // News articles are citable too — merge them into the source list (deduped
  // by URL) so inline citations to news resolve to numbered source cards.
  const sources = results.map((r) => ({ url: r.url, title: r.title || r.url }))
  const seenUrls = new Set(sources.map((s) => s.url))
  for (const n of (marketData.news ?? []).slice(0, 8)) {
    if (!/^https?:\/\//.test(n.url) || seenUrls.has(n.url)) continue
    seenUrls.add(n.url)
    sources.push({ url: n.url, title: n.title || n.url })
  }
  opts.onSources?.(sources)

  // Phase 2: stream the report from the resolved inference provider
  const system = buildResearchSystemPrompt({ market, pair, marketData })
  const prompt = buildResearchUserPrompt(
    market,
    pair,
    formatSearchContext(results),
  )

  const model = inferenceProvider.getLanguageModel?.('research')
  const report = model
    ? await streamReport(model as LanguageModel, system, prompt, opts)
    : await streamReportViaPlugin(inferenceProvider, system, prompt, opts)

  if (report.length === 0) {
    throw new Error('The AI provider returned an empty report')
  }
  return { report, sources }
}

async function streamReport(
  model: LanguageModel,
  system: string,
  prompt: string,
  opts: RunResearchOptions,
): Promise<string> {
  // streamText does NOT throw provider errors into the textStream loop — it
  // ends the stream empty and routes the error to onError. Capture it so a
  // failed report surfaces instead of vanishing.
  let streamErr: unknown = null
  const result = streamText({
    model,
    system,
    prompt,
    abortSignal: opts.abortSignal,
    onError: ({ error }) => {
      streamErr = error
    },
  })

  let report = ''
  for await (const delta of result.textStream) {
    report += delta
    opts.onDelta?.(delta)
  }
  if (streamErr) {
    throw streamErr instanceof Error ? streamErr : new Error(String(streamErr))
  }
  return report
}

// Fallback for third-party inference plugins without getLanguageModel:
// stream via subscribe when available, else a single execute completion.
function streamReportViaPlugin(
  provider: PluginInstance,
  system: string,
  prompt: string,
  opts: RunResearchOptions,
): Promise<string> {
  const messages: Array<InferenceMessage> = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ]
  const executeParams = {
    capability: 'ai:inference' as const,
    params: { messages },
    context: opts.pluginManager.getContext(),
  }

  if (!provider.subscribe) {
    return provider.execute(executeParams).then((result) => {
      const content = (result as { content?: string } | null)?.content ?? ''
      if (content) opts.onDelta?.(content)
      return content
    })
  }

  return new Promise<string>((resolve, reject) => {
    let report = ''
    let settled = false
    const unsubscribe = provider.subscribe!(executeParams, (raw) => {
      if (settled) return
      const event = raw as InferenceStreamEvent
      if (event.type === 'text-delta') {
        report += event.text
        opts.onDelta?.(event.text)
      } else if (event.type === 'finish') {
        settled = true
        resolve(report)
      } else if (event.type === 'error') {
        settled = true
        reject(new Error(event.message))
      }
    })
    opts.abortSignal?.addEventListener('abort', () => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(new Error('Aborted'))
    })
  })
}
