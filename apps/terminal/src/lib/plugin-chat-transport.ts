// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { buildCopilotSystemPrompt } from './copilot-brain'
import { buildCopilotTools } from './copilot'
import type {
  ChatTransport,
  LanguageModel,
  UIMessage,
  UIMessageChunk,
} from 'ai'
import type {
  CopilotChartSnapshot,
  CopilotMarketContext,
  CopilotMarketDataHandle,
  CopilotToolDeps,
} from './copilot/tool-deps'
import type { PluginInstance, PluginManager } from '@pairlens/plugin-system'
import type {
  InferenceMessage,
  InferenceStreamEvent,
} from '@pairlens/shared/plugin-types'
import { track } from '@/lib/analytics-events'

// Chat transport that honors ai:inference capability resolution (including
// user pins from the plugin Configuration page). The ENTIRE agentic loop
// runs client-side (copilot-brain.ts) — the resolved plugin only supplies
// the model:
//
// - Plugin exposes an AI SDK LanguageModel (Pairlens Intelligence via the
//   App Server inference proxy, or BYOK Groq/OpenAI/Anthropic) → streamText
//   with the full tool set. Data tools read the live market context; chart
//   tools execute in the panel via useChat's onToolCall.
// - A third-party plugin with only subscribe/execute → text-only streaming
//   with a market snapshot inlined in the system prompt.

type ChatCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type ChatRequestData = {
  market?: string
  pair?: string
  timeframe?: string
  persona?: string
  marketContext?: {
    candles?: Array<ChatCandle>
    ticker?: unknown
    signal?: unknown
  }
  // Live handles the copilot tools read through. Safe to carry because the
  // whole agent loop runs client-side, in the same process as the panel.
  marketData?: CopilotMarketDataHandle | null
  chartSnapshot?: CopilotChartSnapshot | null
}

// ---------------------------------------------------------------------------
// Local system prompt — mirrors the App Server personas, but replaces the
// tool instructions with an inline market snapshot since the BYOK path has
// no tools
// ---------------------------------------------------------------------------

const PERSONA_INSTRUCTIONS: Record<string, string> = {
  mentor:
    'You are in mentor mode. Explain your reasoning in an educational way. ' +
    'Help the user learn trading concepts. Use analogies and break down complex ideas.',
  balanced:
    'You are in balanced mode. Provide a mix of data-driven analysis and educational context. ' +
    'Keep responses clear and moderately concise. A few solid paragraphs or bullet points are usually best. ' +
    'Prioritize clarity and signal over filler. Do not repeat the same point in multiple ways.',
  technical:
    'You are in technical mode. Focus on data, numbers, and chart patterns. ' +
    'Be terse: short bullet points, key levels, and percentages. No narrative or hand-holding.',
}

function sma(closes: Array<number>, period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(0, period).reduce((s, c) => s + c, 0) / period
}

function summarizeMarket(ctx: ChatRequestData['marketContext']): string {
  if (!ctx) return 'No market data available.'
  const lines: Array<string> = []

  // Newest-first regardless of the stream's ordering
  const candles = [...(ctx.candles ?? [])].sort((a, b) => b.ts - a.ts)
  if (candles.length > 0) {
    const closes = candles.map((c) => c.close)
    const latest = candles[0]
    lines.push(`Latest close: ${latest.close}`)
    lines.push(
      `Range over last ${candles.length} candles: high ${Math.max(...candles.map((c) => c.high))}, low ${Math.min(...candles.map((c) => c.low))}`,
    )
    const sma20 = sma(closes, 20)
    const sma50 = sma(closes, 50)
    if (sma20 !== null) lines.push(`SMA20: ${sma20.toFixed(2)}`)
    if (sma50 !== null) lines.push(`SMA50: ${sma50.toFixed(2)}`)
    const recent = candles
      .slice(0, 10)
      .map(
        (c) =>
          `${new Date(c.ts).toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`,
      )
    lines.push('Recent candles (newest first):', ...recent)
  }
  if (ctx.ticker) lines.push(`Ticker: ${JSON.stringify(ctx.ticker)}`)
  if (ctx.signal) lines.push(`Latest signal: ${JSON.stringify(ctx.signal)}`)

  return lines.length > 0 ? lines.join('\n') : 'No market data available.'
}

function buildLocalSystemPrompt(data: ChatRequestData): string {
  const persona =
    PERSONA_INSTRUCTIONS[data.persona ?? 'balanced'] ??
    PERSONA_INSTRUCTIONS.balanced

  const contextLines: Array<string> = []
  if (data.market) contextLines.push(`Market: ${data.market}`)
  if (data.pair) contextLines.push(`Pair: ${data.pair}`)
  if (data.timeframe) contextLines.push(`Timeframe: ${data.timeframe}`)

  return [
    'You are a trading copilot for Pairlens, an AI-native crypto spot trading terminal.',
    `Today's date: ${new Date().toISOString().slice(0, 10)} (UTC).`,
    '',
    persona,
    '',
    contextLines.length > 0
      ? `Current context:\n${contextLines.join('\n')}`
      : 'No specific trading context provided yet.',
    '',
    'Market snapshot (live data pushed from the terminal):',
    summarizeMarket(data.marketContext),
    '',
    'Constraints:',
    '- You have NO tools in this mode. Do not emit tool calls or pretend to modify the chart.',
    '- If the user asks you to draw on the chart or add indicators, explain that chart actions require the Pairlens Intelligence provider.',
    '- Ground analysis in the market snapshot above. Never invent prices.',
    '- Keep responses concise and actionable. Never provide financial advice or guarantee outcomes.',
    '- Format numbers clearly (e.g., $67,432.50, +2.34%).',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// UIMessage → plain chat messages
// ---------------------------------------------------------------------------

function toInferenceMessages(
  messages: Array<UIMessage>,
): Array<InferenceMessage> {
  const out: Array<InferenceMessage> = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter((t) => t.length > 0)
      .join('\n')
    if (text.trim().length === 0) continue
    out.push({ role: message.role, content: text })
  }
  return out
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class PluginChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly opts: {
      pluginManager: PluginManager
      // Read at send time so refs deliver the freshest market context
      getData: () => ChatRequestData
    },
  ) {}

  sendMessages: ChatTransport<UIMessage>['sendMessages'] = async (options) => {
    const provider =
      this.opts.pluginManager.getPluginForCapability('ai:inference')
    if (!provider) {
      throw new Error(
        'No AI provider is enabled. Enable one on the Plugins page.',
      )
    }

    const data = this.opts.getData()

    const model = provider.getLanguageModel?.()
    track('copilot_message_sent', {
      provider: provider.manifest.id,
      persona: data.persona ?? 'balanced',
      model:
        model && typeof model === 'object' && 'modelId' in model
          ? String((model as { modelId: unknown }).modelId)
          : typeof model === 'string'
            ? model
            : 'plugin-stream',
    })
    if (model) {
      return this.streamWithTools(
        model as LanguageModel,
        options.messages,
        data,
        options.abortSignal,
      )
    }

    return this.streamViaPlugin(provider, options.messages, data, {
      abortSignal: options.abortSignal,
    })
  }

  // Full agentic loop against the plugin-provided AI SDK model
  private async streamWithTools(
    model: LanguageModel,
    uiMessages: Array<UIMessage>,
    data: ChatRequestData,
    abortSignal: AbortSignal | undefined,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const deps: CopilotToolDeps = {
      getCtx: () => (data.marketContext as CopilotMarketContext | null) ?? null,
      getContextInfo: () => ({
        market: data.market,
        pair: data.pair,
        timeframe: data.timeframe,
      }),
      getMarketData: () => data.marketData ?? null,
      pluginManager: this.opts.pluginManager,
      getChartSnapshot: () => data.chartSnapshot ?? null,
    }

    const result = streamText({
      model,
      system: buildCopilotSystemPrompt({
        market: data.market,
        pair: data.pair,
        timeframe: data.timeframe,
        persona: data.persona,
      }),
      messages: await convertToModelMessages(uiMessages),
      tools: buildCopilotTools(deps),
      stopWhen: stepCountIs(16),
      onStepFinish: (step) => {
        for (const call of step.toolCalls) {
          track('copilot_tool_used', { tool: call.toolName })
        }
      },
      abortSignal,
    })
    return result.toUIMessageStream({
      onError: (error) =>
        error instanceof Error ? error.message : String(error),
    })
  }

  reconnectToStream: ChatTransport<UIMessage>['reconnectToStream'] =
    async () => {
      // Plugin streams are not resumable; the App Server route does not
      // support reconnection either
      return null
    }

  private streamViaPlugin(
    provider: PluginInstance,
    uiMessages: Array<UIMessage>,
    data: ChatRequestData,
    { abortSignal }: { abortSignal?: AbortSignal },
  ): ReadableStream<UIMessageChunk> {
    const pluginManager = this.opts.pluginManager
    const messages: Array<InferenceMessage> = [
      { role: 'system', content: buildLocalSystemPrompt(data) },
      ...toInferenceMessages(uiMessages),
    ]

    const textId = crypto.randomUUID()
    let unsubscribe: (() => void) | null = null

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        let closed = false
        let textStarted = false

        const enqueue = (chunk: UIMessageChunk) => {
          if (closed) return
          controller.enqueue(chunk)
        }
        const close = () => {
          if (closed) return
          closed = true
          controller.close()
        }
        const finish = (errorText?: string) => {
          if (errorText !== undefined) enqueue({ type: 'error', errorText })
          if (textStarted) enqueue({ type: 'text-end', id: textId })
          enqueue({ type: 'finish-step' })
          enqueue({ type: 'finish' })
          close()
        }

        const onEvent = (raw: unknown) => {
          const event = raw as InferenceStreamEvent
          if (event.type === 'text-delta') {
            if (!textStarted) {
              enqueue({ type: 'text-start', id: textId })
              textStarted = true
            }
            enqueue({ type: 'text-delta', id: textId, delta: event.text })
          } else if (event.type === 'finish') {
            finish()
          } else if (event.type === 'error') {
            finish(event.message)
          }
        }

        enqueue({ type: 'start' })
        enqueue({ type: 'start-step' })

        abortSignal?.addEventListener('abort', () => {
          unsubscribe?.()
          if (!closed) {
            enqueue({ type: 'abort' })
            close()
          }
        })

        const executeParams = {
          capability: 'ai:inference' as const,
          params: { messages },
          context: pluginManager.getContext(),
        }

        try {
          if (provider.subscribe) {
            unsubscribe = provider.subscribe(executeParams, onEvent)
          } else {
            // Third-party plugin without streaming — fall back to a single
            // non-streaming completion
            provider
              .execute(executeParams)
              .then((result) => {
                const content =
                  (result as { content?: string } | null)?.content ??
                  String(result)
                onEvent({ type: 'text-delta', text: content })
                onEvent({ type: 'finish' })
              })
              .catch((err: unknown) => {
                onEvent({
                  type: 'error',
                  message: err instanceof Error ? err.message : String(err),
                })
              })
          }
        } catch (err) {
          finish(err instanceof Error ? err.message : String(err))
        }
      },
      cancel() {
        unsubscribe?.()
      },
    })
  }
}
