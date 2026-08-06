// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import {
  escapeHtml,
  formatTelegramMessage,
  looksLikeBotToken,
} from '../telegram'
import type { NotificationMessage } from '@pairlens/notification-engine/types'

/**
 * The parts of Telegram delivery that are pure enough to pin down.
 *
 * Formatting carries real risk: `parse_mode: HTML` means an alert body that
 * happens to contain `<` or `&` is a rejected message rather than an escaped
 * one, and Telegram's 4096-character cap turns a long body into a 400 instead
 * of a truncated notification. Both failures are invisible until an alert
 * fires for real, which is the worst possible moment to find them.
 */

function message(over: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    ruleId: 'rule-1',
    ruleName: 'Breakout watch',
    title: 'Price Alert: BTC-USDT',
    body: 'BTC-USDT is now above 64000',
    severity: 'info',
    timestamp: 0,
    payload: {
      eventType: 'price-alert',
      timestamp: 0,
      pair: 'BTC-USDT',
      market: 'okx',
      data: {},
    },
    ...over,
  }
}

describe('escapeHtml', () => {
  test('escapes the three characters Telegram parses', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;')
  })

  test('escapes ampersands before angle brackets', () => {
    // '&' last would double-escape the entities it just produced.
    expect(escapeHtml('&<')).toBe('&amp;&lt;')
  })
})

describe('formatTelegramMessage', () => {
  test('bolds the title and appends rule + market context', () => {
    const text = formatTelegramMessage(message())
    expect(text).toContain('<b>Price Alert: BTC-USDT</b>')
    expect(text).toContain('BTC-USDT is now above 64000')
    expect(text).toContain('<i>Breakout watch — BTC-USDT · okx</i>')
  })

  test('marks severity', () => {
    expect(formatTelegramMessage(message({ severity: 'error' }))).toStartWith(
      '🔴',
    )
    expect(formatTelegramMessage(message({ severity: 'success' }))).toStartWith(
      '✅',
    )
  })

  test('escapes user-controlled text', () => {
    const text = formatTelegramMessage(
      message({
        title: 'Alert <script>',
        body: 'a & b < c',
        ruleName: 'R&D',
      }),
    )
    expect(text).toContain('<b>Alert &lt;script&gt;</b>')
    expect(text).toContain('a &amp; b &lt; c')
    expect(text).toContain('R&amp;D')
    // Only the tags this module adds may survive as markup.
    expect(text.match(/<(?!\/?[bi]>)/)).toBeNull()
  })

  test('drops the footer when there is no context to name', () => {
    const text = formatTelegramMessage(
      message({
        ruleName: '',
        payload: { eventType: 'test', timestamp: 0, data: {} },
      }),
    )
    expect(text).not.toContain('<i>')
  })

  test('truncates to Telegram’s 4096-character limit', () => {
    const text = formatTelegramMessage(message({ body: 'x'.repeat(9000) }))
    expect(text.length).toBeLessThanOrEqual(4096)
    // The head and footer are what say what fired and where — they survive.
    expect(text).toContain('<b>Price Alert: BTC-USDT</b>')
    expect(text).toContain('<i>Breakout watch — BTC-USDT · okx</i>')
    expect(text).toContain('…')
  })

  test('never ends mid-entity when it truncates', () => {
    // A body of ampersands is all entities once escaped; a blind slice would
    // leave a dangling '&am' and Telegram would reject the whole message.
    const text = formatTelegramMessage(message({ body: '&'.repeat(9000) }))
    expect(text.length).toBeLessThanOrEqual(4096)
    expect(text).not.toMatch(/&[a-z]*…/i)
  })
})

describe('looksLikeBotToken', () => {
  test('accepts a BotFather token', () => {
    expect(
      looksLikeBotToken('123456789:AAHrLK-9dQw6_tEsT0kEnV4lu3AbCdEfGhI'),
    ).toBe(true)
  })

  test('rejects the things people paste by mistake', () => {
    expect(looksLikeBotToken('')).toBe(false)
    expect(looksLikeBotToken('@my_alerts_bot')).toBe(false)
    expect(looksLikeBotToken('123456789')).toBe(false)
    expect(looksLikeBotToken('https://t.me/my_alerts_bot')).toBe(false)
  })
})

describe('telegram step definition', () => {
  const step = CORE_NOTIFICATION_STEPS.find((s) => s.type === 'telegram')

  test('is a channel step', () => {
    expect(step?.category).toBe('channel')
    expect(step?.handles.outputs).toHaveLength(0)
  })

  test('carries no credential field', () => {
    // A token field here would be a secret persisted into rules, which sync
    // to the App Server. It belongs in the keychain and nowhere else.
    const keys = step?.configSchema.map((f) => f.key) ?? []
    expect(keys).toEqual(['chatId', 'silent'])
  })

  test('validates a chat id without demanding one', () => {
    expect(step?.validate({ chatId: '' })).toEqual([])
    expect(step?.validate({ chatId: '123456789' })).toEqual([])
    expect(step?.validate({ chatId: '-1001234567890' })).toEqual([])
    expect(step?.validate({ chatId: '@pairlens_alerts' })).toEqual([])
    expect(step?.validate({ chatId: '123456789:AAHrLK' })).not.toEqual([])
  })
})
