// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { AlpacaOrderPoller } from '../order-poller'
import type { NormalizedOrderUpdate } from '@pairlens/market-engine/types'

const CREDS = { apiKey: 'PKTEST123', apiSecret: 'alpaca-secret-DO-NOT-LEAK' }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function order(id: string, status: string, filledQty = '0') {
  return {
    id,
    symbol: 'AAPL',
    side: 'buy',
    type: 'limit',
    qty: '1',
    limit_price: '100',
    filled_qty: filledQty,
    filled_avg_price: filledQty === '0' ? null : '305.76',
    status,
    created_at: '2026-08-14T20:07:00Z',
    updated_at: '2026-08-14T20:07:00Z',
  }
}

/**
 * Routes the poller's two order calls to whatever the current round declares.
 * `rounds` is consumed one entry per poll.
 */
function stubRounds(
  rounds: Array<{ open: Array<unknown>; closed: Array<unknown> }>,
) {
  let call = 0
  globalThis.fetch = mock(async (url: unknown) => {
    const round = rounds[Math.min(Math.floor(call / 2), rounds.length - 1)]
    call++
    const body = String(url).includes('status=open') ? round.open : round.closed
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
}

/**
 * The poller's own timer is 5s; drive it directly so tests stay instant.
 * `connect()` kicks off its own poll, and the in-flight guard makes a
 * concurrent call a no-op — so settle first, then poll, then settle again.
 */
async function pollOnce(poller: AlpacaOrderPoller): Promise<void> {
  await settle()
  await (poller as unknown as { poll: () => Promise<void> }).poll()
  await settle()
}

/** Let every immediately-resolved fetch promise land. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('AlpacaOrderPoller — baseline seeding', () => {
  // Regression: the baseline used to be inferred from `seen.size === 0`, so an
  // account with NO order history re-seeded on every poll and the first order
  // a user ever placed was recorded silently instead of emitted. Verified
  // against the paper API — four orders placed, zero updates delivered.
  it('emits the first order placed on an account with no history', async () => {
    stubRounds([
      { open: [], closed: [] }, // baseline: brand-new account
      { open: [order('o-1', 'accepted')], closed: [] }, // first order ever
    ])
    const seen: Array<NormalizedOrderUpdate> = []
    const poller = new AlpacaOrderPoller()
    poller.connect(CREDS, true, (u) => seen.push(u)) // baseline poll
    await settle()
    expect(seen).toHaveLength(0)

    await pollOnce(poller)
    expect(seen).toHaveLength(1)
    expect(seen[0].orderId).toBe('o-1')
    expect(seen[0].status).toBe('live')
    poller.destroy()
  })

  it('stays silent for orders that already existed at connect time', async () => {
    stubRounds([
      { open: [order('pre-existing', 'accepted')], closed: [] },
      { open: [order('pre-existing', 'accepted')], closed: [] },
    ])
    const seen: Array<NormalizedOrderUpdate> = []
    const poller = new AlpacaOrderPoller()
    poller.connect(CREDS, true, (u) => seen.push(u))
    await pollOnce(poller)
    expect(seen).toHaveLength(0)
    poller.destroy()
  })

  it('emits again when a seeded order changes state', async () => {
    stubRounds([
      { open: [order('o-1', 'accepted')], closed: [] },
      { open: [], closed: [order('o-1', 'filled', '1')] },
    ])
    const seen: Array<NormalizedOrderUpdate> = []
    const poller = new AlpacaOrderPoller()
    poller.connect(CREDS, true, (u) => seen.push(u))
    await pollOnce(poller)
    expect(seen).toHaveLength(1)
    expect(seen[0].status).toBe('filled')
    expect(seen[0].fillSize).toBe('1')
    poller.destroy()
  })

  it('re-seeds after disconnect so a reconnect does not replay old orders', async () => {
    stubRounds([
      { open: [], closed: [] },
      { open: [order('o-1', 'accepted')], closed: [] },
    ])
    const seen: Array<NormalizedOrderUpdate> = []
    const poller = new AlpacaOrderPoller()
    poller.connect(CREDS, true, (u) => seen.push(u))
    await settle()
    poller.disconnect()

    poller.connect(CREDS, true, (u) => seen.push(u))
    await settle() // fresh baseline — o-1 is pre-existing now
    expect(seen).toHaveLength(0)
    poller.destroy()
  })
})
