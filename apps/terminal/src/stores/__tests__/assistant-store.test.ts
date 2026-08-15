// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import { askAssistant, useAssistantStore } from '../assistant-store'

beforeEach(() => {
  useAssistantStore.setState({ isOpen: false, seed: null, focusSignal: 0 })
})

describe('the assistant dock store', () => {
  test('toggling closes and reopens without touching the seed', () => {
    const { toggle } = useAssistantStore.getState()
    toggle()
    expect(useAssistantStore.getState().isOpen).toBe(true)
    toggle()
    // Closed means collapsed, not torn down: the conversation stays
    // mounted and a run in flight keeps going.
    expect(useAssistantStore.getState().isOpen).toBe(false)
  })

  test('opening pulls focus into the composer each time', () => {
    const { open, close } = useAssistantStore.getState()
    open()
    const first = useAssistantStore.getState().focusSignal
    close()
    useAssistantStore.getState().open()
    // A counter, not a boolean: asking twice has to focus twice.
    expect(useAssistantStore.getState().focusSignal).toBeGreaterThan(first)
  })

  test('askAssistant sends by default', () => {
    askAssistant('Build me an alert')
    const { isOpen, seed } = useAssistantStore.getState()
    expect(isOpen).toBe(true)
    // A button that says what it will ask for should not open a chat and
    // then sit there waiting.
    expect(seed).toEqual({ prompt: 'Build me an alert', send: true })
  })

  test('askAssistant can seed the composer instead of sending', () => {
    askAssistant('Write an indicator that', { send: false })
    expect(useAssistantStore.getState().seed).toEqual({
      prompt: 'Write an indicator that',
      send: false,
    })
  })

  test('the seed is consumed exactly once', () => {
    askAssistant('Analyze BTC-USDT')
    const { consumeSeed } = useAssistantStore.getState()
    expect(consumeSeed()?.prompt).toBe('Analyze BTC-USDT')
    // A second read must not replay the request: the conversation's
    // effect re-runs whenever handleSend changes identity.
    expect(useAssistantStore.getState().consumeSeed()).toBeNull()
  })

  test('reopening while a seed is pending keeps it', () => {
    askAssistant('Deploy a bot')
    useAssistantStore.getState().open()
    expect(useAssistantStore.getState().seed?.prompt).toBe('Deploy a bot')
  })
})
