// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { buildCopilotTools } from '../index'
import {
  COPILOT_TOOL_LABELS,
  formatToolLabel,
  humanizeToolName,
} from '../tool-labels'
import type { CopilotToolDeps } from '../tool-deps'

describe('formatToolLabel', () => {
  test('phrases a known tool per phase', () => {
    expect(formatToolLabel('get_orderbook', 'running')).toBe(
      'Reading the order book…',
    )
    expect(formatToolLabel('get_orderbook', 'done')).toBe('Read the order book')
    expect(formatToolLabel('get_orderbook', 'error')).toBe(
      'Reading the order book',
    )
  })

  test('defaults to the completed phrasing', () => {
    expect(formatToolLabel('get_market_snapshot')).toBe(
      'Read the market snapshot',
    )
  })

  test('renders the verb alone when the label has no object', () => {
    expect(formatToolLabel('wait', 'running')).toBe('Waiting…')
    expect(formatToolLabel('wait', 'done')).toBe('Waited')
  })

  test('tolerates a raw `tool-<name>` part type', () => {
    expect(formatToolLabel('tool-get_ticker', 'done')).toBe('Read the ticker')
  })

  test('falls back to a humanized name for unknown tools', () => {
    expect(formatToolLabel('some_mcp_tool', 'done')).toBe('Some Mcp Tool')
    expect(formatToolLabel('some_mcp_tool', 'running')).toBe('Some Mcp Tool…')
  })
})

describe('humanizeToolName', () => {
  test('splits snake_case, kebab-case and camelCase', () => {
    expect(humanizeToolName('get_market_snapshot')).toBe('Get Market Snapshot')
    expect(humanizeToolName('fetch-open-orders')).toBe('Fetch Open Orders')
    expect(humanizeToolName('getOrderBook')).toBe('Get Order Book')
  })

  test('strips the AI SDK `tool-` prefix', () => {
    expect(humanizeToolName('tool-get_candles')).toBe('Get Candles')
  })

  test('keeps acronyms uppercase', () => {
    expect(humanizeToolName('get_RSI')).toBe('Get RSI')
  })

  test('never returns an empty label', () => {
    expect(humanizeToolName('')).toBe('Tool')
    expect(humanizeToolName('tool-')).toBe('Tool')
  })
})

describe('label coverage', () => {
  test('every built copilot tool has a label', () => {
    // Tools only touch deps inside execute(), so a stub is enough to enumerate.
    const tools = buildCopilotTools({} as CopilotToolDeps)
    const missing = Object.keys(tools).filter(
      (name) => !(name in COPILOT_TOOL_LABELS),
    )
    expect(missing).toEqual([])
  })

  test('has no labels for tools that no longer exist', () => {
    const tools = buildCopilotTools({} as CopilotToolDeps)
    const stale = Object.keys(COPILOT_TOOL_LABELS).filter(
      (name) => !(name in tools),
    )
    expect(stale).toEqual([])
  })
})
