// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChat } from '@ai-sdk/react'
import { Brain, Loader2 } from 'lucide-react'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { parseBillingErrorCode } from '@pairlens/shared/billing-types'
import { CopilotChat } from './copilot-chat'
import { CopilotHeader } from './copilot-header'
import { CopilotInput } from './copilot-input'
import { CopilotOrderActionsProvider } from './copilot-order-card'
import type {
  CopilotCancelRequest,
  CopilotOrderActions,
  CopilotOrderRequest,
} from './copilot-order-card'
import type { UIMessage } from 'ai'

import type {
  FastFinancialChartRef,
  IndicatorInstanceInput,
} from 'fast-financial-charts/types'

import type { SignalPayload } from '@pairlens/shared/types'
import type { PluginCandle } from '@/hooks/use-candle-stream'
import type { TickerSnapshot } from '@/hooks/use-ticker-stream'
import type { useOptionalChartActions } from '@/lib/chart-terminal-context'
import type {
  CopilotChartSnapshot,
  CopilotMarketDataHandle,
} from '@/lib/copilot/tool-deps'
import { track } from '@/lib/analytics-events'
import { useCandleStream } from '@/hooks/use-candle-stream'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useCapabilityAccess } from '@/hooks/use-capability-access'
import { api, queryKeys } from '@/lib/api'
import { usePairlens } from '@/lib/pairlens-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { PluginChatTransport } from '@/lib/plugin-chat-transport'
import { useCredentialsStore } from '@/stores/credentials-store'
import { normalizePair, normalizeTimeframe } from '@/lib/copilot/tool-deps'
import { AuthRequiredPrompt } from '@/components/capability-gate'
import {
  BillingErrorNotice,
  IntelligenceUpgradePrompt,
} from '@/components/billing/intelligence-upsell'

type ChartActions = NonNullable<ReturnType<typeof useOptionalChartActions>>
type MarketData = ReturnType<typeof useMarketData>

type IndicatorActions = {
  add: (indicator: IndicatorInstanceInput) => void
  remove: (id: string) => void
  removeAll: () => void
}

type CopilotPanelProps = {
  pairKey: string
  market: string
  timeframe: string
  chartRef: React.RefObject<FastFinancialChartRef | null>
  indicatorActions?: IndicatorActions
  chartActions?: ChartActions
}

// Map per-type drawing tools to addDrawing command payloads.
// DrawingBase requires visible, color, and lineWidth — the chart engine
// does NOT default these, so we must always provide them.
const DEFAULT_COLOR = '#ffb020'
const DEFAULT_LINE_WIDTH = 1.5

const drawingToolMap: Record<
  string,
  (
    p: Record<string, unknown>,
    chart?: FastFinancialChartRef,
  ) => Record<string, unknown>
> = {
  draw_horizontal_line: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_vertical_line: (p) => ({
    type: 'vline',
    ts: p.ts,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_trendline: (p) => ({
    type: 'line',
    points: [p.start, p.end],
    extend: p.extend,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_rectangle: (p) => ({
    type: 'rectangle',
    points: [p.start, p.end],
    visible: true,
    color: (p.color as string) ?? '#ffb02040',
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_circle: (p, chart) => {
    const center = p.center as { ts: number; price: number }
    const radiusBars = (p.radiusBars as number) ?? 3
    const bars = chart?.data() ?? []
    let barInterval = 60_000
    if (bars.length >= 2) {
      barInterval = bars[1].ts - bars[0].ts
    }
    const edge = {
      ts: center.ts + barInterval * radiusBars,
      price: center.price * (1 + 0.01 * radiusBars),
    }
    return {
      type: 'circle',
      points: [center, edge],
      visible: true,
      color: (p.color as string) ?? DEFAULT_COLOR,
      lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
    }
  },
  draw_fibonacci: (p) => ({
    type: 'fibonacci',
    points: [p.start, p.end],
    levels: p.levels,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
  }),
  annotate_chart: (p) => ({
    type: 'text',
    point: { ts: p.ts, price: p.price },
    content: p.text,
    fontSize: p.fontSize,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: 1,
  }),
  draw_stop_loss: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    // Warm Precision --down / --up / --primary (WebGL needs concrete hex)
    color: '#e94f55',
    lineWidth: 2,
  }),
  draw_take_profit: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: '#40c786',
    lineWidth: 2,
  }),
  draw_entry_price: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: '#929bf5',
    lineWidth: 2,
  }),
}

// Client-executed chart command names → executeCommand type.
const SIMPLE_CHART_COMMANDS: Record<string, string> = {
  remove_drawing: 'removeDrawing',
  clear_drawings: 'clearDrawings',
  undo: 'undo',
  redo: 'redo',
  fit_content: 'fitContent',
  scroll_to_latest: 'scrollToLatest',
  take_screenshot: 'takeScreenshot',
}

type ClientToolContext = {
  chartRef: React.RefObject<FastFinancialChartRef | null>
  indicatorActions?: IndicatorActions
  chartActions?: ChartActions
  navigate: ReturnType<typeof useNavigate>
  currentMarket: string
  /** Arm a deferred copilot check (schedule_check tool). */
  scheduleCheck?: (delayMinutes: number, instruction: string) => void
}

/**
 * Perform the real effect of a client-forwarded tool call (chart mutations +
 * navigation). Data/read tools resolve in the transport; trading tools render
 * a confirmation card — both are ignored here.
 */
function executeClientTool(
  toolName: string,
  input: Record<string, unknown> | undefined,
  ctx: ClientToolContext,
): void {
  const chart = ctx.chartRef.current
  const p = input ?? {}
  try {
    // ── Indicators ──
    if (toolName === 'add_indicator') {
      const payload: Record<string, unknown> = { type: p.type }
      if (p.period != null) payload.params = { period: p.period }
      if (p.color) payload.color = p.color
      ctx.indicatorActions?.add(payload as IndicatorInstanceInput)
      return
    }
    if (toolName === 'remove_indicator') {
      if (p.id) ctx.indicatorActions?.remove(p.id as string)
      return
    }
    if (toolName === 'remove_all_indicators') {
      ctx.indicatorActions?.removeAll()
      return
    }
    if (toolName === 'update_indicator') {
      if (p.id) {
        ctx.chartActions?.updateIndicator(
          p.id as string,
          (p.params as Record<string, string | number | boolean>) ?? {},
        )
      }
      return
    }

    // ── Navigation ──
    if (toolName === 'switch_market') {
      if (p.market) ctx.chartActions?.setMarket(String(p.market).toLowerCase())
      return
    }
    if (toolName === 'set_timeframe') {
      const tf = p.timeframe ? normalizeTimeframe(String(p.timeframe)) : null
      if (tf) ctx.chartActions?.setTimeframe(tf as never)
      return
    }
    if (toolName === 'switch_pair') {
      const pair = normalizePair(String(p.pair ?? ''))
      if (p.market) ctx.chartActions?.setMarket(String(p.market).toLowerCase())
      if (pair) {
        void ctx.navigate({ to: '/pair/$pair', params: { pair } })
      }
      return
    }

    // ── Scheduled checks ──
    if (toolName === 'schedule_check') {
      const mins = Number(p.delayMinutes)
      const instruction = String(p.instruction ?? '').trim()
      if (Number.isFinite(mins) && mins >= 1 && instruction) {
        ctx.scheduleCheck?.(Math.min(mins, 240), instruction)
      }
      return
    }

    // ── Compare & replay ──
    if (toolName === 'add_compare_symbol') {
      ctx.chartActions?.addCompareSymbol({
        pairKey: normalizePair(String(p.pair ?? '')),
        market: (p.market as string)?.toLowerCase() ?? ctx.currentMarket,
      })
      return
    }
    if (toolName === 'remove_compare_symbol') {
      if (p.id) ctx.chartActions?.removeCompareSymbol(p.id as string)
      return
    }
    if (toolName === 'start_replay') {
      ctx.chartActions?.startReplay()
      return
    }
    if (toolName === 'exit_replay') {
      ctx.chartActions?.exitReplay()
      return
    }

    if (!chart) return

    // ── View config (route through chart actions for state sync) ──
    if (toolName === 'set_chart_type') {
      ctx.chartActions?.setChartType(p.chartType as never)
      return
    }
    if (toolName === 'set_price_scale') {
      ctx.chartActions?.setPriceScaleMode(p.mode as never)
      return
    }

    // ── Drawings ──
    const drawingMapper = drawingToolMap[toolName]
    if (drawingMapper) {
      chart.executeCommand({
        type: 'addDrawing',
        payload: drawingMapper(p, chart),
      } as Parameters<FastFinancialChartRef['executeCommand']>[0])
      return
    }

    // ── Simple pass-through commands ──
    const command = SIMPLE_CHART_COMMANDS[toolName]
    if (command) {
      chart.executeCommand({
        type: command,
        payload: p,
      } as Parameters<FastFinancialChartRef['executeCommand']>[0])
    }
  } catch {
    // Client tool execution is best-effort — never break the chat loop.
  }
}

/** Extract a compact chart snapshot for the copilot's chart-query tools. */
function buildChartSnapshot(
  chart: FastFinancialChartRef | null,
): CopilotChartSnapshot | null {
  if (!chart) return null
  const ref = chart as unknown as {
    getSnapshot?: (o?: unknown) => Record<string, unknown>
    data?: () => Array<unknown>
    seriesOrder?: () => Array<string>
  }
  if (!ref.getSnapshot) return null
  try {
    const s = ref.getSnapshot() ?? {}
    const indicators = Array.isArray(s.indicators)
      ? (s.indicators as Array<Record<string, unknown>>).map((ind) => ({
          id: String(ind.id ?? ''),
          type: String(ind.type ?? ''),
          params: ind.params as Record<string, unknown> | undefined,
        }))
      : []
    const drawings = Array.isArray(s.drawings)
      ? (s.drawings as Array<Record<string, unknown>>).map((d) => ({
          id: String(d.id ?? ''),
          type: String(d.type ?? ''),
        }))
      : []
    const viewport = s.viewport as
      | { startIndex?: number; endIndex?: number }
      | undefined
    const seriesOrder = ref.seriesOrder?.() ?? []
    return {
      timeframe: s.timeframe as string | undefined,
      chartType: s.chartType as string | undefined,
      priceScaleMode: s.priceScaleMode as string | undefined,
      indicators,
      drawings,
      visibleRange:
        viewport?.startIndex != null && viewport?.endIndex != null
          ? { startIndex: viewport.startIndex, endIndex: viewport.endIndex }
          : undefined,
      barCount: ref.data?.().length,
      compareSymbols: seriesOrder.slice(1),
    }
  } catch {
    return null
  }
}

function toMarketDataHandle(
  md: MarketData | null,
): CopilotMarketDataHandle | null {
  if (!md) return null
  return {
    availableMarkets: md.availableMarkets.map((m) => ({
      marketId: m.marketId,
      displayName: m.displayName,
      assetClasses: m.assetClasses as unknown as Array<string> | undefined,
      supportedTimeframes: m.supportedTimeframes as unknown as
        | Array<string>
        | undefined,
      capabilities: md.getCapabilities(m.marketId),
    })),
    getTimeframes: md.getTimeframes,
    getCapabilities: md.getCapabilities,
    fetchHistory: md.fetchHistory,
    subscribeOrderbook: md.subscribeOrderbook,
  }
}

// ---------------------------------------------------------------------------
// Render-null subscriber — owns the per-tick candle/ticker state AND mirrors
// the market-data provider handle into a ref, so stream updates re-render only
// this component (not the chat) while the transport still reads fresh handles.
// ---------------------------------------------------------------------------

function MarketContextSync({
  market,
  pairKey,
  timeframe,
  candlesRef,
  tickerRef,
  signalRef,
  marketDataRef,
}: {
  market: string
  pairKey: string
  timeframe: string
  candlesRef: React.RefObject<Array<PluginCandle>>
  tickerRef: React.RefObject<TickerSnapshot | null>
  signalRef: React.RefObject<SignalPayload | null>
  marketDataRef: React.RefObject<MarketData | null>
}) {
  const { candles, latestSignal } = useCandleStream({
    market,
    pairKey,
    timeframe,
  })
  const { ticker } = useTickerStream({ market, pairKey })
  const marketData = useMarketData()

  candlesRef.current = candles
  tickerRef.current = ticker
  signalRef.current = latestSignal
  marketDataRef.current = marketData

  return null
}

// ---------------------------------------------------------------------------
// Inner chat component
// ---------------------------------------------------------------------------

function CopilotChatInner({
  pairKey,
  market,
  timeframe,
  chartRef,
  indicatorActions,
  chartActions,
  initialMessages,
}: CopilotPanelProps & { initialMessages: Array<UIMessage> }) {
  const [persona, setPersona] = usePersistedState<
    'mentor' | 'balanced' | 'technical'
  >('copilot.persona', 'balanced')

  const { pluginManager } = usePairlens()
  const navigate = useNavigate()

  const marketRef = useRef(market)
  marketRef.current = market
  const pairKeyRef = useRef(pairKey)
  pairKeyRef.current = pairKey
  const chartActionsRef = useRef(chartActions)
  chartActionsRef.current = chartActions

  // Live data pushed to the agent loop, held in refs so per-tick stream
  // updates re-render only <MarketContextSync>, not the chat.
  const candlesRef = useRef<Array<PluginCandle>>([])
  const tickerRef = useRef<TickerSnapshot | null>(null)
  const signalRef = useRef<SignalPayload | null>(null)
  const marketDataRef = useRef<MarketData | null>(null)

  // schedule_check timers. Sent back into the chat via handleSend when they
  // fire; all pending timers die with the panel (documented tool limitation).
  const handleSendRef = useRef<(text: string) => void>(() => {})
  const scheduledTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set(),
  )
  useEffect(() => {
    const timers = scheduledTimersRef.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])
  const scheduleCheck = useCallback((delayMinutes: number, instr: string) => {
    if (scheduledTimersRef.current.size >= 8) return
    const timer = setTimeout(() => {
      scheduledTimersRef.current.delete(timer)
      handleSendRef.current(
        `[Scheduled check — you set this ${delayMinutes} min ago] ${instr}`,
      )
    }, delayMinutes * 60_000)
    scheduledTimersRef.current.add(timer)
  }, [])

  const transport = useMemo(
    () =>
      new PluginChatTransport({
        pluginManager,
        getData: () => ({
          market: marketRef.current,
          pair: pairKeyRef.current,
          timeframe,
          persona,
          marketContext: {
            candles: candlesRef.current,
            ticker: tickerRef.current,
            signal: signalRef.current,
          },
          marketData: toMarketDataHandle(marketDataRef.current),
          chartSnapshot: buildChartSnapshot(chartRef.current),
        }),
      }),
    [pluginManager, timeframe, persona, chartRef],
  )

  const queryClient = useQueryClient()

  // Product analytics: per-run tool-call count and latency (no content).
  const runStartRef = useRef(0)
  const runToolCallsRef = useRef(0)

  const { messages, status, sendMessage, setMessages, stop, error } = useChat({
    id: `${market}:${pairKey}`,
    messages: initialMessages,
    transport,
    onToolCall: ({ toolCall }) => {
      runToolCallsRef.current += 1
      executeClientTool(
        toolCall.toolName,
        toolCall.input as Record<string, unknown> | undefined,
        {
          chartRef,
          indicatorActions,
          chartActions: chartActionsRef.current,
          navigate,
          currentMarket: marketRef.current,
          scheduleCheck,
        },
      )
    },
    onFinish: ({ message }) => {
      track('copilot_run_completed', {
        outcome: 'success',
        tool_calls: runToolCallsRef.current,
        duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
      })
      api
        .saveAiMessage(marketRef.current, pairKeyRef.current, message)
        .catch(() => {
          // Persistence failure is non-critical
        })
    },
  })

  // Order execution actions for the confirmation cards. Read the provider from
  // the ref so this stays stable and doesn't subscribe the chat to stream ticks.
  const orderActions = useMemo<CopilotOrderActions>(
    () => ({
      tradingMode: 'paper',
      placeOrder: async (req: CopilotOrderRequest, mode) => {
        const md = marketDataRef.current
        if (!md) return { success: false, error: 'Trading is unavailable.' }
        const cred = useCredentialsStore
          .getState()
          .getCredentialForMarket(req.market)
        if (mode === 'live' && !cred) {
          return {
            success: false,
            error: `No credentials connected for ${req.market}. Add API keys in Accounts to trade live.`,
          }
        }
        const params: Record<string, unknown> = {
          market: req.market,
          pair: req.pair,
          side: req.side,
          type: req.type,
          size: String(req.size),
          mode,
          analyticsSource: 'copilot',
        }
        if (cred) params.credentialId = cred.id
        if (req.type === 'limit' && req.price != null) {
          params.price = String(req.price)
        }
        try {
          const result = await md.placeOrder(params)
          return {
            success: result.success,
            orderId: result.orderId,
            error: result.error,
          }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      cancelOrder: async (req: CopilotCancelRequest) => {
        const md = marketDataRef.current
        if (!md) return { success: false, error: 'Trading is unavailable.' }
        const cred = useCredentialsStore
          .getState()
          .getCredentialForMarket(req.market)
        try {
          const result = await md.cancelOrder(
            req.market,
            req.orderId,
            req.pair,
            cred?.id,
          )
          return { success: result.success, error: result.error }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
    [],
  )

  const handleClearHistory = useCallback(() => {
    api.clearAiMessages(market, pairKey).catch(() => {
      // Non-critical
    })
    setMessages([])
    queryClient.invalidateQueries({
      queryKey: queryKeys.aiMessages(market, pairKey),
    })
  }, [market, pairKey, setMessages, queryClient])

  const quickActions = useMemo(
    () => [
      `How is ${pairKey.split('-')[0]} doing?`,
      'Suggested indicators',
      'Any signals?',
    ],
    [pairKey],
  )

  const handleSend = useCallback(
    (text: string) => {
      runStartRef.current = Date.now()
      runToolCallsRef.current = 0
      sendMessage({ text })
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        parts: [{ type: 'text' as const, text }],
      }
      api.saveAiMessage(market, pairKey, userMsg).catch(() => {
        // Non-critical
      })
    },
    [sendMessage, market, pairKey],
  )
  handleSendRef.current = handleSend

  const hasMessages = messages.length > 0
  // Typed billing failures (no subscription / budget exhausted) render as an
  // upsell card instead of a generic error line.
  const billingErrorCode = parseBillingErrorCode(error?.message)

  // A run that surfaced an error never reaches onFinish — record it once.
  const trackedErrorRef = useRef<unknown>(null)
  useEffect(() => {
    if (!error || trackedErrorRef.current === error) return
    trackedErrorRef.current = error
    track('copilot_run_completed', {
      outcome: 'error',
      tool_calls: runToolCallsRef.current,
      duration_ms: runStartRef.current ? Date.now() - runStartRef.current : 0,
    })
  }, [error])

  return (
    <CopilotOrderActionsProvider value={orderActions}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* The one magic surface: a thin animated gradient seam + a soft
            radial glow in the top corner. Both are purely decorative. */}
        <div className="magic-gradient pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(100% 100% at 100% 0%, color-mix(in oklch, var(--magic-1) 18%, transparent), transparent 70%)',
          }}
        />
        <MarketContextSync
          market={market}
          pairKey={pairKey}
          timeframe={timeframe}
          candlesRef={candlesRef}
          tickerRef={tickerRef}
          signalRef={signalRef}
          marketDataRef={marketDataRef}
        />
        {hasMessages && (
          <div className="border-border/60 relative z-10 border-b p-3">
            <CopilotHeader
              persona={persona}
              onPersonaChange={setPersona}
              onClearHistory={handleClearHistory}
              status={status}
              watching={`Watching ${pairKey.replace('-', '/')} · ${timeframe}`}
              onRerun={() => handleSend(quickActions[0])}
            />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <CopilotChat
            messages={messages}
            status={status}
            pairKey={pairKey}
            persona={persona}
            onPersonaChange={setPersona}
          />
          {error ? (
            <div className="px-3 pb-1">
              {billingErrorCode ? (
                <BillingErrorNotice code={billingErrorCode} />
              ) : (
                <p className="text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                  The copilot hit an error — try sending that again.
                </p>
              )}
            </div>
          ) : null}
          <CopilotInput
            onSend={handleSend}
            status={status}
            onStop={stop}
            quickActions={quickActions}
          />
        </div>
      </div>
    </CopilotOrderActionsProvider>
  )
}

// ---------------------------------------------------------------------------
// Outer shell — handles capability check + history loading
// ---------------------------------------------------------------------------

export function CopilotPanel(props: CopilotPanelProps) {
  const { market, pairKey } = props

  const access = useCapabilityAccess('ai:inference')

  const historyQuery = useQuery({
    queryKey: queryKeys.aiMessages(market, pairKey),
    queryFn: () => api.getAiMessages(market, pairKey),
    enabled: access.status === 'granted',
  })

  if (access.status === 'auth-required') {
    return (
      <AuthRequiredPrompt
        title="Meet your AI copilot"
        description="Contextual analysis on any pair — it reads the chart, checks your risk limits, and answers with reasoning you can question. Sign in, then subscribe to Pairlens Intelligence or bring your own AI key."
      />
    )
  }

  if (access.status === 'upgrade-required') {
    return (
      <IntelligenceUpgradePrompt description="Your AI copilot reads the chart, checks your risk limits, and answers with reasoning you can question. Subscribe to Pairlens Intelligence — or bring your own AI key via Plugins, free." />
    )
  }

  if (access.status !== 'granted') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <Empty className="max-w-xs">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Brain className="size-5" />
            </EmptyMedia>
            <EmptyTitle>AI Lens Unavailable</EmptyTitle>
            <EmptyDescription>
              Enable an AI plugin on the Plugins page to get real-time market
              analysis and trading assistance.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            className="mt-4 gap-2"
            render={<Link to="/plugins" />}
          >
            <Brain className="size-4" />
            Go to Plugins
          </Button>
        </Empty>
      </div>
    )
  }

  if (historyQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  return (
    <CopilotChatInner
      {...props}
      initialMessages={(historyQuery.data ?? []) as Array<UIMessage>}
    />
  )
}
