// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, test } from 'bun:test'
import { streamAnthropic, streamOpenAiCompatible } from '../lib/inference-sse'
import type { InferenceStreamEvent } from '@pairlens/shared/plugin-types'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function sseResponse(messages: Array<string>, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const message of messages) {
        controller.enqueue(encoder.encode(message))
      }
      controller.close()
    },
  })
  return new Response(body, { status })
}

function mockFetch(response: Response | (() => Response)): {
  requests: Array<{ url: string; init: RequestInit | undefined }>
} {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = []
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init })
    return Promise.resolve(
      typeof response === 'function' ? response() : response,
    )
  }) as typeof fetch
  return { requests }
}

function collectEvents(
  run: (onEvent: (e: InferenceStreamEvent) => void) => void,
): Promise<Array<InferenceStreamEvent>> {
  return new Promise((resolve) => {
    const events: Array<InferenceStreamEvent> = []
    run((event) => {
      events.push(event)
      if (event.type === 'finish' || event.type === 'error') resolve(events)
    })
  })
}

describe('streamOpenAiCompatible', () => {
  test('parses deltas and finishes once', async () => {
    const { requests } = mockFetch(
      sseResponse([
        'data: {"model":"llama-3.3","choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[{"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    const events = await collectEvents((onEvent) =>
      streamOpenAiCompatible({
        url: 'https://api.example.com/v1/chat/completions',
        apiKey: 'k',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        onEvent,
      }),
    )

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'finish', model: 'llama-3.3' },
    ])
    const body = JSON.parse(String(requests[0].init?.body)) as {
      stream: boolean
      messages: Array<unknown>
    }
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(1)
  })

  test('handles SSE messages split across reads', async () => {
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"con',
        'tent":"AB"}}]}\n\nda',
        'ta: [DONE]\n\n',
      ]),
    )

    const events = await collectEvents((onEvent) =>
      streamOpenAiCompatible({
        url: 'https://api.example.com/v1/chat/completions',
        apiKey: 'k',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        onEvent,
      }),
    )

    expect(events[0]).toEqual({ type: 'text-delta', text: 'AB' })
    expect(events[events.length - 1]?.type).toBe('finish')
  })

  test('emits error on non-OK response', async () => {
    mockFetch(() => new Response('nope', { status: 401 }))

    const events = await collectEvents((onEvent) =>
      streamOpenAiCompatible({
        url: 'https://api.example.com/v1/chat/completions',
        apiKey: 'bad',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        onEvent,
      }),
    )

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { message: string }).message).toContain('401')
  })

  test('abort suppresses further events', async () => {
    let releaseStream: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    globalThis.fetch = (async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await gate
          if (init?.signal?.aborted) {
            controller.error(new DOMException('aborted', 'AbortError'))
            return
          }
          controller.close()
        },
      })
      return new Response(body, { status: 200 })
    }) as typeof fetch

    const events: Array<InferenceStreamEvent> = []
    const abort = streamOpenAiCompatible({
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: 'k',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      onEvent: (e) => events.push(e),
    })

    abort()
    releaseStream()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(events).toHaveLength(0)
  })
})

describe('streamAnthropic', () => {
  test('parses text deltas, separates system prompt, finishes', async () => {
    const { requests } = mockFetch(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-x"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    )

    const events = await collectEvents((onEvent) =>
      streamAnthropic({
        apiKey: 'k',
        model: 'm',
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
        onEvent,
      }),
    )

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hi' },
      { type: 'finish', model: 'claude-x' },
    ])
    const body = JSON.parse(String(requests[0].init?.body)) as {
      system: string
      messages: Array<{ role: string; content: string }>
      stream: boolean
    }
    expect(body.system).toBe('be brief')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.stream).toBe(true)
  })
})
