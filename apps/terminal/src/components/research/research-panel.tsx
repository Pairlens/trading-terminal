// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Link } from '@tanstack/react-router'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

import { computeSignals } from '@pairlens/strategy-engine/compute'
import { parseBillingErrorCode } from '@pairlens/shared/billing-types'
import { parseResearchSections } from './parse-research-sections'
import { ResearchSectionRenderer } from './research-section-renderer'
import { ResearchSourceCard } from './research-source-card'
import type { RefObject } from 'react'
import type { Candle } from '@pairlens/shared/types'
import type { TickerSnapshot } from '@/hooks/use-ticker-stream'
import type { CopilotCandle } from '@/lib/copilot-brain'
import { track } from '@/lib/analytics-events'
import { api } from '@/lib/api'
import { useMarketData } from '@/lib/market-data-provider'
import { usePairlens } from '@/lib/pairlens-provider'
import { formatRelativeTime } from '@/lib/format-time'
import { runResearch } from '@/lib/research-brain'
import { useCapabilityAccess } from '@/hooks/use-capability-access'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { AuthRequiredPrompt } from '@/components/capability-gate'
import {
  BillingErrorNotice,
  IntelligenceUpgradePrompt,
} from '@/components/billing/intelligence-upsell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceInfo = { url: string; title: string }

type ResearchPanelProps = {
  pairKey: string
  market: string
}

type ResearchStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Animated loading phases
// ---------------------------------------------------------------------------

// Translation keys — the phase text is resolved with t() at render time so
// the animated loading copy follows the active locale.
const RESEARCH_PHASE_KEYS = [
  'research.phaseSearching',
  'research.phaseReading',
  'research.phaseAnalyzing',
  'research.phaseWriting',
] as const

const PHASE_DELAYS = [0, 4000, 9000, 16000] as const

function useResearchPhase(isActive: boolean) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setPhase(0)
      return
    }

    const timers = PHASE_DELAYS.slice(1).map((delay, i) =>
      setTimeout(() => setPhase(i + 1), delay),
    )

    return () => timers.forEach(clearTimeout)
  }, [isActive])

  return phase
}

// ---------------------------------------------------------------------------
// Local report cache — replaces the old server-side shared cache. Reports
// are generated client-side now (research-brain.ts), so the terminal caches
// them locally to avoid re-burning inference on every pair switch.
// ---------------------------------------------------------------------------

const RESEARCH_CACHE_PREFIX = 'pairlens:research:v1:'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

type CachedResearch = {
  report: string
  sources: Array<SourceInfo>
  generatedAt: string
  expiresAt: string
}

function readResearchCache(
  market: string,
  pair: string,
): CachedResearch | null {
  try {
    const raw = localStorage.getItem(
      `${RESEARCH_CACHE_PREFIX}${market}:${pair}`,
    )
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedResearch
    if (new Date(cached.expiresAt).getTime() <= Date.now()) return null
    return cached
  } catch {
    return null
  }
}

function writeResearchCache(
  market: string,
  pair: string,
  entry: CachedResearch,
): void {
  try {
    // Prune expired entries so old reports don't accumulate
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith(RESEARCH_CACHE_PREFIX)) continue
      try {
        const cached = JSON.parse(
          localStorage.getItem(key) ?? '',
        ) as CachedResearch
        if (new Date(cached.expiresAt).getTime() <= Date.now()) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
    localStorage.setItem(
      `${RESEARCH_CACHE_PREFIX}${market}:${pair}`,
      JSON.stringify(entry),
    )
  } catch {
    // Quota exceeded — caching is best-effort
  }
}

// ---------------------------------------------------------------------------
// Streaming hook — runs the client-side research loop (research-brain.ts)
// ---------------------------------------------------------------------------

const STALE_TIME_MS = 30 * 60_000 // 30 min

function useResearchStream(
  market: string,
  pairKey: string,
  fetchHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
  ) => Promise<Array<unknown>>,
  // Live ticker via a ref (written by the render-null <ResearchTickerSync>)
  // so per-tick stream updates never re-render the panel; the freshest
  // snapshot is read here at request time.
  tickerRef: RefObject<TickerSnapshot | null>,
) {
  const { pluginManager } = usePairlens()
  const [report, setReport] = useState('')
  const [sources, setSources] = useState<Array<SourceInfo>>([])
  const [status, setStatus] = useState<ResearchStatus>('idle')
  const [cached, setCached] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // Track what pair we've fetched to avoid refetching on re-render
  const fetchedRef = useRef<string | null>(null)

  const startStream = useCallback(
    async (forceRefresh = false) => {
      // Abort any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // Reset state
      setReport('')
      setSources([])
      setCached(false)
      setError(null)
      setGeneratedAt(null)
      setExpiresAt(null)
      setStatus('loading')
      const startedAt = Date.now()

      // Serve from the local cache when fresh
      if (!forceRefresh) {
        const cachedEntry = readResearchCache(market, pairKey)
        if (cachedEntry) {
          setReport(cachedEntry.report)
          setSources(cachedEntry.sources)
          setGeneratedAt(cachedEntry.generatedAt)
          setExpiresAt(cachedEntry.expiresAt)
          setCached(true)
          setStatus('done')
          track('research_run_completed', {
            outcome: 'success',
            cached: true,
            duration_ms: Date.now() - startedAt,
          })
          fetchedRef.current = `${pairKey}:false`
          return
        }
      }

      try {
        // Fetch candles plus best-effort enrichment (news, sentiment,
        // fundamentals, benchmark). Enrichment failures — signed out, no
        // provider key — degrade the report section by section, never fail it.
        const baseAsset = pairKey.split('-')[0] ?? pairKey
        const isCrypto = market !== 'alpaca'
        const benchmarkPair = isCrypto ? 'BTC-USDT' : 'SPY-USD'
        const wantBenchmark = baseAsset !== benchmarkPair.split('-')[0]

        const [
          dailyCandles,
          hourlyCandles,
          benchmarkCandles,
          news,
          fearGreed,
          assetOverview,
        ] = await Promise.all([
          fetchHistory(market, pairKey, '1d', 300).catch(() => []),
          fetchHistory(market, pairKey, '1h', 168).catch(() => []),
          wantBenchmark
            ? fetchHistory(market, benchmarkPair, '1d', 120).catch(() => [])
            : Promise.resolve([]),
          api
            .getNews({ tickers: baseAsset, limit: 8 })
            .then((r) =>
              (r.articles ?? []).map((a) => ({
                title: a.title,
                url: a.url,
                source: a.source,
                publishedAt: a.timePublished,
                sentiment: a.overallSentimentLabel,
                summary: a.summary,
              })),
            )
            .catch(() => undefined),
          isCrypto
            ? api
                .getFearGreed()
                .then((fg) => ({
                  latest: fg.latest,
                  history: (fg.historical ?? []).slice(0, 7),
                }))
                .catch(() => undefined)
            : Promise.resolve(undefined),
          api
            .getTickerOverview(baseAsset, isCrypto ? 'crypto' : 'stocks')
            .then((r) => r.overview)
            .catch(() => undefined),
        ])

        // Compute signals from daily candles
        const signals =
          dailyCandles.length >= 39
            ? [computeSignals(dailyCandles as Array<Candle>)].filter(Boolean)
            : []

        const generatedAtIso = new Date().toISOString()
        const expiresAtIso = new Date(Date.now() + CACHE_TTL_MS).toISOString()

        const { report: fullReport, sources: finalSources } = await runResearch(
          {
            market,
            pair: pairKey,
            marketData: {
              dailyCandles: dailyCandles as Array<CopilotCandle>,
              hourlyCandles: hourlyCandles as Array<CopilotCandle>,
              ticker: tickerRef.current,
              signals,
              news,
              fearGreed,
              assetOverview,
              benchmark:
                benchmarkCandles.length > 0
                  ? {
                      pair: benchmarkPair,
                      dailyCandles: benchmarkCandles as Array<CopilotCandle>,
                    }
                  : undefined,
            },
            pluginManager,
            abortSignal: controller.signal,
            onSources: (s) => {
              if (controller.signal.aborted) return
              setSources(s)
              setGeneratedAt(generatedAtIso)
              setExpiresAt(expiresAtIso)
              setStatus('streaming')
            },
            onDelta: (delta) => {
              if (controller.signal.aborted) return
              setReport((prev) => prev + delta)
            },
          },
        )

        if (controller.signal.aborted) return
        setCached(false)
        setStatus('done')
        track('research_run_completed', {
          outcome: 'success',
          cached: false,
          duration_ms: Date.now() - startedAt,
        })
        fetchedRef.current = `${pairKey}:${forceRefresh}`
        writeResearchCache(market, pairKey, {
          report: fullReport,
          sources: finalSources,
          generatedAt: generatedAtIso,
          expiresAt: expiresAtIso,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
        track('research_run_completed', {
          outcome: 'error',
          cached: false,
          duration_ms: Date.now() - startedAt,
        })
      }
    },
    // tickerRef is a stable ref; pluginManager and fetchHistory are stable provider callbacks
    [market, pairKey, fetchHistory, pluginManager],
  )

  // Auto-fetch on mount / pair change
  useEffect(() => {
    if (!market || !pairKey) return

    // If we have a completed result for this pair and it's still fresh, skip
    if (
      status === 'done' &&
      generatedAt &&
      fetchedRef.current === `${pairKey}:false` &&
      Date.now() - new Date(generatedAt).getTime() < STALE_TIME_MS
    ) {
      return
    }

    // Reset fetchedRef when pair changes
    if (fetchedRef.current && !fetchedRef.current.startsWith(`${pairKey}:`)) {
      fetchedRef.current = null
    }

    // Don't refetch if already fetching/streaming for this pair
    if (
      (status === 'loading' || status === 'streaming') &&
      fetchedRef.current === null
    ) {
      return
    }

    // Don't refetch if already completed for this pair
    if (fetchedRef.current?.startsWith(`${pairKey}:`)) {
      return
    }

    void startStream(false)
    // deps scoped to market/pairKey: refetch on pair change, not when stream helpers re-create
  }, [market, pairKey])

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const refresh = useCallback(() => {
    fetchedRef.current = null
    void startStream(true)
  }, [startStream])

  return {
    report,
    sources,
    status,
    cached,
    error,
    generatedAt,
    expiresAt,
    refresh,
  }
}

// ---------------------------------------------------------------------------
// Render-null subscriber — owns the per-tick ticker state so stream updates
// re-render only this component. The latest snapshot is mirrored into a ref
// the research request reads at send time.
// ---------------------------------------------------------------------------

function ResearchTickerSync({
  market,
  pairKey,
  tickerRef,
}: {
  market: string
  pairKey: string
  tickerRef: RefObject<TickerSnapshot | null>
}) {
  const { ticker } = useTickerStream({ market, pairKey })
  tickerRef.current = ticker
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchPanel({ pairKey, market }: ResearchPanelProps) {
  const { t } = useTranslation()
  // Research runs client-side against the resolved ai:inference provider
  // (research-brain.ts) — same gate as the copilot. Web search grounding is
  // an optional extra resolved via ai:web-search.
  const access = useCapabilityAccess('ai:inference')
  const tickerRef = useRef<TickerSnapshot | null>(null)

  if (access.status === 'auth-required') {
    return (
      <AuthRequiredPrompt
        title={t('research.authRequiredTitle')}
        description={t('research.authRequiredDescription')}
      />
    )
  }

  if (access.status === 'upgrade-required') {
    return (
      <IntelligenceUpgradePrompt
        description={t('research.upgradeDescription')}
      />
    )
  }

  if (access.status !== 'granted') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <Empty className="max-w-xs">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t('research.unavailableTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('research.unavailableDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            className="mt-4 gap-2"
            render={<Link to="/plugins" />}
          >
            <Search className="size-4" />
            {t('research.goToPlugins')}
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <>
      <ResearchTickerSync
        market={market}
        pairKey={pairKey}
        tickerRef={tickerRef}
      />
      <ResearchPanelBody
        pairKey={pairKey}
        market={market}
        tickerRef={tickerRef}
      />
    </>
  )
}

function ResearchPanelBody({
  pairKey,
  market,
  tickerRef,
}: ResearchPanelProps & { tickerRef: RefObject<TickerSnapshot | null> }) {
  const { t } = useTranslation()
  const { fetchHistory } = useMarketData()
  const { report, sources, status, cached, error, generatedAt, refresh } =
    useResearchStream(market, pairKey, fetchHistory, tickerRef)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyReport = useCallback(() => {
    if (!report) return
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [report])

  const isLoading = status === 'loading'
  const isStreaming = status === 'streaming'
  const isGenerating = isLoading || isStreaming
  const hasContent = report.trim().length > 0
  // Keep the rich loading screen (and its animated phases) until the first
  // token actually lands. Web search resolving flips status loading→streaming
  // *before* the model's first token, so gating only on `isLoading` left a
  // blank body under a "Generating report…" header during time-to-first-token.
  const showLoadingScreen = isGenerating && !hasContent
  const phase = useResearchPhase(showLoadingScreen)

  // Follow the report as it streams, yielding the moment the user scrolls up.
  const { contentRef } = useStickToBottom({ enabled: isStreaming })

  // Extract headings from markdown for sidebar navigation (exclude AI sources)
  const HIDDEN_SLUGS = useMemo(
    () => new Set(['sources', 'sources-references', 'references']),
    [],
  )
  const sections = useMemo(() => parseResearchSections(report), [report])
  const headings = useMemo(
    () =>
      sections
        .filter((s) => !HIDDEN_SLUGS.has(s.slug))
        .map((s) => ({ text: s.heading, id: s.slug })),
    [sections, HIDDEN_SLUGS],
  )

  // No pair context
  if (!pairKey || !market) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
        <Search className="mb-3 size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {t('research.navigateToPair')}
        </p>
      </div>
    )
  }

  // Loading state — held until the first token arrives (see showLoadingScreen)
  if (showLoadingScreen) {
    const symbol = pairKey.includes('-') ? pairKey : pairKey.split('-')[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
        <AiOrb size="48px" animationDuration={12} state="thinking" />
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-foreground">
            {t('research.researchingSymbol', { symbol })}
          </p>
          <div className="relative h-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <ShimmeringText
                  text={t(RESEARCH_PHASE_KEYS[phase])}
                  duration={1.8}
                  repeatDelay={0.4}
                  spread={3}
                  startOnView={false}
                  className="text-xs"
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {RESEARCH_PHASE_KEYS.map((_, i) => (
              <div
                key={i}
                className={`size-1.5 rounded-full transition-colors duration-300 ${
                  i <= phase ? 'bg-primary' : 'bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    // Typed billing failures (no subscription / budget exhausted) get the
    // upsell card instead of the raw error message.
    const billingErrorCode = parseBillingErrorCode(error ?? undefined)
    if (billingErrorCode) {
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-4">
          <BillingErrorNotice code={billingErrorCode} />
        </div>
      )
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
        <AlertCircle className="size-8 text-destructive/60" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {t('research.errorTitle')}
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{error}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 gap-1.5"
          onClick={refresh}
        >
          <RefreshCw className="size-3.5" />
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  // No data yet (idle)
  if (status === 'idle' && !report) return null

  // -- Header bar (shared between inline and fullscreen) --
  const headerBar = (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isGenerating ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>{t('research.generatingReport')}</span>
          </>
        ) : cached ? (
          <>
            <Clock className="size-3.5" />
            <span>
              {t('research.cachedGenerated', {
                time: generatedAt ? formatRelativeTime(generatedAt) : '',
              })}
            </span>
          </>
        ) : (
          <>
            <Sparkles className="size-3.5 text-primary" />
            <span>{t('research.freshGenerated')}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={refresh}
          disabled={isLoading || isStreaming}
        >
          {isLoading || isStreaming ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {t('research.refresh')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={copyReport}
          disabled={!report}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setIsFullscreen((v) => !v)}
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  )

  // -- Report body --
  const reportBody = (
    <>
      <ResearchSectionRenderer
        report={report}
        sources={sources}
        market={market}
        pair={pairKey}
      />

      {/* Sources section — numbered to match inline citations */}
      {sources.length > 0 && status === 'done' && (
        <div className="mt-6 border-t pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Zap className="size-3.5" />
            {t('research.sourcesCount', { count: sources.length })}
          </div>
          <div className="grid gap-1.5">
            {sources.map((source, i) => (
              <ResearchSourceCard
                key={source.url}
                url={source.url}
                title={source.title}
                index={i + 1}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )

  // -- Fullscreen mode --
  if (isFullscreen) {
    return (
      <>
        <div className="h-full" />
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setIsFullscreen(false)
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-5xl"
          >
            <DialogTitle className="sr-only">
              {t('research.reportTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('research.fullscreenDescription')}
            </DialogDescription>
            {headerBar}
            <div className="flex min-h-0 flex-1">
              {/* Section sidebar */}
              {headings.length > 0 && (
                <nav className="w-[180px] shrink-0 overflow-y-auto border-r px-2 py-3">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('research.sections')}
                  </p>
                  <ul className="space-y-0.5">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="w-full truncate rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() =>
                            document.getElementById(h.id)?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }
                        >
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              {/* Scrollable report */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div ref={contentRef} className="mx-auto max-w-prose">
                  {reportBody}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // -- Inline mode --
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {headerBar}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div ref={contentRef}>{reportBody}</div>
      </div>
    </div>
  )
}
