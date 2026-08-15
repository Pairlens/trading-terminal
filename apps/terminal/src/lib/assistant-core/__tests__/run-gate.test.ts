// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { hasParkedToolCall } from '../run-gate'
import type { UIMessage } from 'ai'

const message = (
  role: 'user' | 'assistant',
  parts: Array<unknown>,
): UIMessage => ({ id: role, role, parts }) as unknown as UIMessage

const toolPart = (name: string, state: string) => ({
  type: `tool-${name}`,
  toolCallId: `${name}-1`,
  state,
  input: {},
})

describe('hasParkedToolCall', () => {
  test('an empty thread is not parked', () => {
    expect(hasParkedToolCall([])).toBe(false)
  })

  test('a finished answer is not parked', () => {
    expect(
      hasParkedToolCall([
        message('assistant', [{ type: 'text', text: 'done' }]),
      ]),
    ).toBe(false)
  })

  test('a completed tool call is not parked', () => {
    expect(
      hasParkedToolCall([
        message('assistant', [
          toolPart('get_market_snapshot', 'output-available'),
        ]),
      ]),
    ).toBe(false)
  })

  test('a call still waiting for a result IS parked', () => {
    // This is the approval card / ask_user window. Sending a user turn here
    // strands the call and the conversation cannot be continued.
    expect(
      hasParkedToolCall([
        message('assistant', [toolPart('add_pane', 'input-available')]),
      ]),
    ).toBe(true)
  })

  test('one parked call among finished ones still parks the run', () => {
    expect(
      hasParkedToolCall([
        message('assistant', [
          toolPart('get_market_snapshot', 'output-available'),
          toolPart('ask_user', 'input-available'),
        ]),
      ]),
    ).toBe(true)
  })

  test('only the LAST message matters', () => {
    expect(
      hasParkedToolCall([
        message('assistant', [toolPart('ask_user', 'input-available')]),
        message('user', [{ type: 'text', text: 'answered' }]),
      ]),
    ).toBe(false)
  })

  test('a failed call is settled, not parked', () => {
    expect(
      hasParkedToolCall([
        message('assistant', [toolPart('run_backtest', 'output-error')]),
      ]),
    ).toBe(false)
  })
})
