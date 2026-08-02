// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { formatAlertMessage } from '../indicator-alerts'

describe('formatAlertMessage', () => {
  it('expands every known placeholder', () => {
    const out = formatAlertMessage(
      '{{pair}} {{title}} hit {{value}} at {{price}} on {{timeframe}}',
      {
        pair: 'BTC-USDT',
        title: 'RSI overbought',
        value: '71.4',
        price: '63000',
        timeframe: '1h',
      },
    )
    expect(out).toBe('BTC-USDT RSI overbought hit 71.4 at 63000 on 1h')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(formatAlertMessage('{{ pair }}', { pair: 'ETH-USDT' })).toBe(
      'ETH-USDT',
    )
  })

  it('leaves unknown placeholders alone rather than blanking them', () => {
    // A typo should be visible in the notification, not silently swallowed.
    expect(formatAlertMessage('{{pare}} moved', { pair: 'BTC-USDT' })).toBe(
      '{{pare}} moved',
    )
  })

  it('passes through a template with no placeholders', () => {
    expect(formatAlertMessage('Something happened', {})).toBe(
      'Something happened',
    )
  })
})
