// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'bun:test'

import { draftPrice, useOrderDraftStore } from '../lib/order-draft-store'

/**
 * Two properties of the mobile ticket are worth pinning, because both fail
 * silently and neither is visible to the type checker:
 *
 *   1. The draft outlives the sheet. Tapping the chart dismisses the Trade
 *      panel, which unmounts it — if the draft lived in the component, every
 *      glance at the chart would erase a half-typed order.
 *   2. `placeOrder` is the only way an order leaves the mobile surface.
 *      `placeUnattendedOrder` skips the identity check that the attended path
 *      performs, and a ticket is by definition attended.
 */

const store = useOrderDraftStore

describe('order draft', () => {
  beforeEach(() => {
    store.getState().reset()
  })

  test('survives the sheet unmounting and remounting', () => {
    store.getState().focusMarket('okx', 'BTC-USDT')
    store.getState().setOrderType('limit')
    store.getState().setLimitPrice('63900.0')
    store.getState().setAmount('0.18')
    store.getState().setSide('sell')

    // Dismissing the panel unmounts the sheet. Nothing in the mobile surface
    // touches the store on the way out — this call is what a re-open does.
    store.getState().markTicketOpened()

    const draft = store.getState()
    expect(draft.orderType).toBe('limit')
    expect(draft.limitPrice).toBe('63900.0')
    expect(draft.amount).toBe('0.18')
    expect(draft.side).toBe('sell')
  })

  test('the ticket-opened flag latches, so the limit line stays put', () => {
    expect(store.getState().ticketOpened).toBe(false)
    store.getState().markTicketOpened()
    const first = store.getState()
    store.getState().markTicketOpened()
    expect(store.getState().ticketOpened).toBe(true)
    // Same object: a re-open must not invalidate every subscriber.
    expect(store.getState()).toBe(first)
  })

  test('changing venue keeps the draft; changing pair clears the numbers', () => {
    store.getState().focusMarket('okx', 'BTC-USDT')
    store.getState().setLimitPrice('63900')
    store.getState().setStopPrice('62000')
    store.getState().setAmount('0.18')

    store.getState().focusMarket('binance', 'BTC-USDT')
    expect(store.getState().market).toBe('binance')
    expect(store.getState().limitPrice).toBe('63900')
    expect(store.getState().amount).toBe('0.18')

    store.getState().focusMarket('binance', 'SOL-USDT')
    expect(store.getState().pairKey).toBe('SOL-USDT')
    expect(store.getState().limitPrice).toBe('')
    expect(store.getState().stopPrice).toBe('')
    expect(store.getState().amount).toBe('')
  })

  test('re-focusing the same market is a no-op for subscribers', () => {
    store.getState().focusMarket('okx', 'BTC-USDT')
    const before = store.getState()
    store.getState().focusMarket('okx', 'BTC-USDT')
    expect(store.getState()).toBe(before)
  })

  test('a placed order clears the size and keeps the price preference', () => {
    store.getState().setLimitPrice('63900')
    store.getState().setAmount('0.18')
    store.getState().clearAmount()
    expect(store.getState().amount).toBe('')
    expect(store.getState().limitPrice).toBe('63900')
  })

  test('draftPrice reads the field the order type actually uses', () => {
    store.getState().setLimitPrice('63900')
    store.getState().setStopPrice('62000')

    store.getState().setOrderType('limit')
    expect(draftPrice(store.getState())).toBe(63900)

    store.getState().setOrderType('stop')
    expect(draftPrice(store.getState())).toBe(62000)

    // A market order has no price of its own, and a blank or junk field is
    // "no price", never zero — zero would be a valid-looking order.
    store.getState().setOrderType('market')
    expect(draftPrice(store.getState())).toBeNull()

    store.getState().setOrderType('limit')
    store.getState().setLimitPrice('')
    expect(draftPrice(store.getState())).toBeNull()
    store.getState().setLimitPrice('abc')
    expect(draftPrice(store.getState())).toBeNull()
    store.getState().setLimitPrice('-5')
    expect(draftPrice(store.getState())).toBeNull()
  })
})

// ── Submission path ───────────────────────────────────────────────────

const MOBILE_ROOT = join(import.meta.dir, '..')

/**
 * Comments are prose — this file's own doc block names the forbidden call, and
 * so does the ticket's. The assertion is about what the code DOES.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function sourceFiles(dir: string): Array<string> {
  const out: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry.name)) out.push(path)
  }
  return out
}

describe('mobile order submission', () => {
  const files = sourceFiles(MOBILE_ROOT).map((path) => ({
    path: path.slice(MOBILE_ROOT.length + 1),
    source: stripComments(readFileSync(path, 'utf8')),
  }))

  test('nothing on the mobile surface reaches the unattended path', () => {
    const offenders = files
      .filter((file) => file.source.includes('placeUnattendedOrder'))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })

  test('nothing executes trading:orders directly', () => {
    const offenders = files
      .filter((file) => file.source.includes("'trading:orders'"))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })

  test('the ticket is the only file that places an order, via placeOrder', () => {
    const callers = files
      .filter((file) => /\bplaceOrder\b/.test(file.source))
      .map((file) => file.path)
    expect(callers).toEqual(['panels/trade-panel.tsx'])

    const ticket = files.find((f) => f.path === 'panels/trade-panel.tsx')
    expect(ticket?.source).toContain('useMarketData()')
    expect(ticket?.source).toContain('await placeOrder(params)')
  })
})
