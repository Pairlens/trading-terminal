// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { PluginChatTransport } from '../plugin-chat-transport'
import type { UIMessage, UIMessageChunk } from 'ai'
import type { PluginInstance, PluginManager } from '@pairlens/plugin-system'
import type {
  InferenceMessage,
  InferenceStreamEvent,
} from '@pairlens/shared/plugin-types'

type SendOptions = Parameters<PluginChatTransport['sendMessages']>[0]

function fakeManager(provider: PluginInstance | null): PluginManager {
  return {
    getPluginForCapability: () => provider,
    getContext: () => ({
      pair: 'BTC-USDT',
      market: 'okx',
      timeframe: '1h',
      mode: 'paper',
      country: '',
    }),
  } as unknown as PluginManager
}

function userMessage(text: string): UIMessage {
  return { id: 'u1', role: 'user', parts: [{ type: 'text', text }] }
}

function sendOptions(messages: Array<UIMessage>): SendOptions {
  return {
    trigger: 'submit-message',
    chatId: 'chat-1',
    messageId: undefined,
    messages,
    abortSignal: undefined,
  } as SendOptions
}

async function readAll(
  stream: ReadableStream<UIMessageChunk>,
): Promise<Array<UIMessageChunk>> {
  const reader = stream.getReader()
  const chunks: Array<UIMessageChunk> = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

function byokProvider(events: Array<InferenceStreamEvent>): {
  provider: PluginInstance
  received: Array<Record<string, unknown>>
} {
  const received: Array<Record<string, unknown>> = []
  const provider: PluginInstance = {
    manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
    status: 'active',
    config: {},
    execute: async () => {
      throw new Error('should not be called when subscribe exists')
    },
    subscribe: (params, callback) => {
      received.push(params.params)
      queueMicrotask(() => {
        for (const event of events) callback(event)
      })
      return () => {}
    },
  }
  return { provider, received }
}

describe('PluginChatTransport (BYOK path)', () => {
  test('streams deltas as a valid UIMessageChunk sequence', async () => {
    const { provider, received } = byokProvider([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'finish' },
    ])
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(provider),
      getData: () => ({
        market: 'okx',
        pair: 'BTC-USDT',
        timeframe: '1h',
        persona: 'technical',
        marketContext: {
          candles: [
            { ts: 2, open: 1, high: 3, low: 1, close: 2, volume: 10 },
            { ts: 1, open: 1, high: 2, low: 1, close: 1, volume: 5 },
          ],
        },
      }),
    })

    const chunks = await readAll(
      await transport.sendMessages(sendOptions([userMessage('hi')])),
    )

    expect(chunks.map((c) => c.type)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ])
    const deltas = chunks.filter((c) => c.type === 'text-delta')
    expect(deltas.map((d) => (d as { delta: string }).delta)).toEqual([
      'Hel',
      'lo',
    ])

    // The plugin received a system prompt with the market snapshot plus the
    // user conversation
    const messages = received[0]['messages'] as Array<InferenceMessage>
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('Pair: BTC-USDT')
    expect(messages[0].content).toContain('Latest close: 2')
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'hi',
    })
  })

  test('surfaces plugin errors as an error chunk and still finishes', async () => {
    const { provider } = byokProvider([
      { type: 'error', message: 'API error 401: bad key' },
    ])
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(provider),
      getData: () => ({}),
    })

    const chunks = await readAll(
      await transport.sendMessages(sendOptions([userMessage('hi')])),
    )

    const error = chunks.find((c) => c.type === 'error')
    expect((error as { errorText: string }).errorText).toContain('401')
    expect(chunks[chunks.length - 1].type).toBe('finish')
  })

  test('falls back to non-streaming execute for plugins without subscribe', async () => {
    const provider: PluginInstance = {
      manifest: { id: 'third-party-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => ({ content: 'full answer' }),
    }
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(provider),
      getData: () => ({}),
    })

    const chunks = await readAll(
      await transport.sendMessages(sendOptions([userMessage('hi')])),
    )

    const deltas = chunks.filter((c) => c.type === 'text-delta')
    expect((deltas[0] as { delta: string }).delta).toBe('full answer')
    expect(chunks[chunks.length - 1].type).toBe('finish')
  })

  test('throws when no provider is active', async () => {
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(null),
      getData: () => ({}),
    })

    expect(
      transport.sendMessages(sendOptions([userMessage('hi')])),
    ).rejects.toThrow('No AI provider')
  })
})

describe('PluginChatTransport (BYOK agentic path)', () => {
  test('runs the shared tool loop client-side when the plugin exposes a model', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Analysis' },
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
    const provider: PluginInstance = {
      manifest: { id: 'groq-inference' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => {
        throw new Error('agentic path must not use execute')
      },
      getLanguageModel: () => model,
    }
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(provider),
      getData: () => ({
        market: 'okx',
        pair: 'BTC-USDT',
        timeframe: '1h',
        persona: 'technical',
      }),
    })

    const chunks = await readAll(
      await transport.sendMessages(sendOptions([userMessage('hi')])),
    )

    const types = chunks.map((c) => c.type)
    expect(types).toContain('text-delta')
    expect(types[types.length - 1]).toBe('finish')

    // The model received the SAME brain as the App Server route: shared
    // system prompt + the full tool set (data + chart tools)
    const call = model.doStreamCalls[0]
    const toolNames = (call.tools ?? []).map((t) => t.name)
    expect(toolNames).toContain('get_market_snapshot')
    expect(toolNames).toContain('add_indicator')
    expect(toolNames).toContain('draw_trendline')
    // Expanded surface: market/context/portfolio reads + gated trading
    expect(toolNames).toContain('get_orderbook')
    expect(toolNames).toContain('get_portfolio')
    expect(toolNames).toContain('place_order')
    const systemMessage = call.prompt.find((m) => m.role === 'system')
    expect(String(systemMessage?.content)).toContain('trading copilot')
    expect(String(systemMessage?.content)).toContain('technical mode')
  })
})

describe('PluginChatTransport (Pairlens Intelligence path)', () => {
  test('runs the same client-side loop against the proxy-backed model', async () => {
    // Pairlens Intelligence is not special-cased: it exposes a model like
    // any BYOK plugin and the terminal runs the identical loop against it
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Hi' },
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
    const provider: PluginInstance = {
      manifest: { id: 'pairlens-intelligence' } as PluginInstance['manifest'],
      status: 'active',
      config: {},
      execute: async () => null,
      getLanguageModel: () => model,
    }
    const transport = new PluginChatTransport({
      pluginManager: fakeManager(provider),
      getData: () => ({ market: 'okx', pair: 'BTC-USDT' }),
    })

    const chunks = await readAll(
      await transport.sendMessages(sendOptions([userMessage('hi')])),
    )

    expect(chunks.map((c) => c.type)).toContain('text-delta')
    const toolNames = (model.doStreamCalls[0].tools ?? []).map((t) => t.name)
    expect(toolNames).toContain('get_market_snapshot')
    expect(toolNames).toContain('draw_trendline')
  })
})
