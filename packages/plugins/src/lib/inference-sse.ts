// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  InferenceMessage,
  InferenceStreamEvent,
} from '@pairlens/shared/plugin-types'

// Streaming clients for ai:inference plugins. Both parse SSE bodies and emit
// InferenceStreamEvent to the callback. Exactly one terminal event is emitted
// per stream: 'finish' on success, 'error' otherwise. The returned function
// aborts the request (safe to call after completion).

type OnEvent = (event: InferenceStreamEvent) => void

function splitSseMessages(buffer: string): {
  messages: Array<string>
  rest: string
} {
  const parts = buffer.split('\n\n')
  return { messages: parts.slice(0, -1), rest: parts[parts.length - 1] }
}

function dataLines(message: string): Array<string> {
  const lines: Array<string> = []
  for (const line of message.split('\n')) {
    if (line.startsWith('data:')) lines.push(line.slice(5).trim())
  }
  return lines
}

async function pumpSse(
  response: Response,
  onData: (data: string) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { messages, rest } = splitSseMessages(buffer)
    buffer = rest
    for (const message of messages) {
      for (const data of dataLines(message)) onData(data)
    }
  }
}

// OpenAI-compatible chat completions streaming (OpenAI, Groq, and most
// third-party inference endpoints)
export function streamOpenAiCompatible(opts: {
  url: string
  apiKey: string
  model: string
  messages: Array<InferenceMessage>
  temperature?: number
  maxTokens?: number
  onEvent: OnEvent
}): () => void {
  const controller = new AbortController()
  let settled = false
  const emit = (event: InferenceStreamEvent) => {
    if (settled) return
    if (event.type === 'finish' || event.type === 'error') settled = true
    opts.onEvent(event)
  }

  void (async () => {
    try {
      const response = await fetch(opts.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 2048,
          stream: true,
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        emit({
          type: 'error',
          message: `API error ${response.status}: ${text || response.statusText}`,
        })
        return
      }

      let model = opts.model
      await pumpSse(response, (data) => {
        if (data === '[DONE]') return
        try {
          const chunk = JSON.parse(data) as {
            model?: string
            choices?: Array<{ delta?: { content?: string } }>
          }
          if (chunk.model) model = chunk.model
          const text = chunk.choices?.[0]?.delta?.content
          if (text) emit({ type: 'text-delta', text })
        } catch {
          // Skip malformed SSE data lines
        }
      })
      emit({ type: 'finish', model })
    } catch (err) {
      if (controller.signal.aborted) return
      emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })()

  return () => controller.abort()
}

// Anthropic Messages API streaming
export function streamAnthropic(opts: {
  apiKey: string
  model: string
  messages: Array<InferenceMessage>
  maxTokens?: number
  onEvent: OnEvent
}): () => void {
  const controller = new AbortController()
  let settled = false
  const emit = (event: InferenceStreamEvent) => {
    if (settled) return
    if (event.type === 'finish' || event.type === 'error') settled = true
    opts.onEvent(event)
  }

  const system = opts.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n')
  const conversation = opts.messages.filter((m) => m.role !== 'system')

  void (async () => {
    try {
      const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        messages: conversation,
        stream: true,
      }
      if (system.length > 0) body['system'] = system

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
          // Required for direct browser access with a user-provided key
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        emit({
          type: 'error',
          message: `API error ${response.status}: ${text || response.statusText}`,
        })
        return
      }

      let model = opts.model
      await pumpSse(response, (data) => {
        try {
          const event = JSON.parse(data) as {
            type: string
            message?: { model?: string }
            delta?: { type?: string; text?: string }
          }
          if (event.type === 'message_start' && event.message?.model) {
            model = event.message.model
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta' &&
            event.delta.text
          ) {
            emit({ type: 'text-delta', text: event.delta.text })
          }
        } catch {
          // Skip malformed SSE data lines
        }
      })
      emit({ type: 'finish', model })
    } catch (err) {
      if (controller.signal.aborted) return
      emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })()

  return () => controller.abort()
}
