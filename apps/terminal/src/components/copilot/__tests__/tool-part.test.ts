// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { asToolPart } from '../tool-part'
import type { UIMessage } from 'ai'

type Part = UIMessage['parts'][number]

describe('asToolPart', () => {
  test('normalizes a typed `tool-<name>` part (what static tools emit)', () => {
    // The transport probe confirmed static `tool()` definitions stream as
    // `tool-<name>` parts, not `dynamic-tool` — this is the case that used to
    // fall through and render nothing.
    const part = {
      type: 'tool-get_market_snapshot',
      toolCallId: 'c1',
      state: 'output-available',
      output: { latestPrice: 42 },
    } as unknown as Part
    expect(asToolPart(part)).toEqual({
      toolName: 'get_market_snapshot',
      state: 'output-available',
      output: { latestPrice: 42 },
      errorText: undefined,
    })
  })

  test('normalizes a dynamic-tool part', () => {
    const part = {
      type: 'dynamic-tool',
      toolName: 'some_mcp_tool',
      toolCallId: 'c2',
      state: 'output-available',
      output: { ok: true },
    } as unknown as Part
    expect(asToolPart(part)).toEqual({
      toolName: 'some_mcp_tool',
      state: 'output-available',
      output: { ok: true },
      errorText: undefined,
    })
  })

  test('withholds output until the tool result is available', () => {
    const part = {
      type: 'tool-get_orderbook',
      toolCallId: 'c3',
      state: 'input-available',
      input: { pair: 'BTC-USDT' },
    } as unknown as Part
    const result = asToolPart(part)
    expect(result?.toolName).toBe('get_orderbook')
    expect(result?.state).toBe('input-available')
    expect(result?.output).toBeUndefined()
  })

  test('surfaces errorText on a failed tool call', () => {
    const part = {
      type: 'tool-place_order',
      toolCallId: 'c4',
      state: 'output-error',
      errorText: 'boom',
    } as unknown as Part
    const result = asToolPart(part)
    expect(result?.state).toBe('output-error')
    expect(result?.errorText).toBe('boom')
    expect(result?.output).toBeUndefined()
  })

  test('returns null for non-tool parts (text, step-start, data-*)', () => {
    expect(asToolPart({ type: 'text', text: 'hi' } as Part)).toBeNull()
    expect(asToolPart({ type: 'step-start' } as unknown as Part)).toBeNull()
    expect(
      asToolPart({ type: 'data-weather', data: {} } as unknown as Part),
    ).toBeNull()
  })
})
