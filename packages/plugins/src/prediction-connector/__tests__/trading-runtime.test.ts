// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The prediction trading runtime, driven against a fake exchange.
 *
 * The contract under test is mostly about what does NOT happen.
 * `trading:orders` is declared `sideEffect: true`, so the plugin manager never
 * re-routes a failure to another candidate; a throw out of this module reaches
 * the order pane as "All candidates failed" with the venue's real reason
 * buried inside it. Every path therefore has to come back as an
 * `OrderResult` — including the ones that only happen when the venue itself
 * misbehaves.
 *
 * The other two are money-shaped: a paper slot must never sign against
 * production, and no message that leaves here may carry credential material.
 */

import { describe, expect, it } from 'bun:test'
import {
  PredictionTradingRuntime,
  normalizePredictionPositions,
} from '../orders'
import { OutcomeKeyMap } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import { kalshiPredictionVenue } from '../venues/kalshi'
import { polymarketPredictionVenue } from '../venues/polymarket'
import { fakeExchange, memoryStorage } from './fake-exchange'
import type { PredictionExchangeHost } from '../exchange-host'
import type {
  PredictionExchangeLike,
  PredictionSlot,
  PredictionVenueConfig,
} from '../types'
import type { OrderParams } from '@pairlens/market-engine/types'

const PEM = '-----BEGIN PRIVATE KEY-----\nsupersecretpemvalue\n-----END-----'

function slot(overrides: Partial<PredictionSlot> = {}): PredictionSlot {
  return {
    id: 'c1',
    kind: 'credential',
    fields: { apiKey: 'key-uuid-value', apiSecret: PEM },
    secretRef: null,
    mode: 'live',
    country: 'US',
    currentPair: '',
    orderCallback: null,
    balanceCallback: null,
    ...overrides,
  }
}

/** A Polymarket slot: wallet-backed, with the key already resolvable. */
function walletSlot(): PredictionSlot {
  return slot({
    kind: 'wallet',
    fields: { walletAddress: '0xabc' },
    secretRef: async () => '0xprivatekey',
  })
}

/** A host stand-in: no ccxt class, no socket, no timers. */
function hostFor(
  exchange: PredictionExchangeLike,
  paperActive = false,
): PredictionExchangeHost {
  return {
    generation: 0,
    paperActive,
    authed: true,
    peek: () => exchange,
    setCountry: () => false,
    acquire: async () => ({ exchange, generation: 0 }),
    close: async () => undefined,
    destroy: async () => undefined,
  } as unknown as PredictionExchangeHost
}

function runtime(
  exchange: PredictionExchangeLike,
  opts: { venue?: PredictionVenueConfig; paperActive?: boolean } = {},
): PredictionTradingRuntime {
  const venue = opts.venue ?? kalshiPredictionVenue
  return new PredictionTradingRuntime({
    venue,
    resolver: new OutcomeResolver(
      venue,
      new OutcomeKeyMap(venue.marketId, memoryStorage()),
    ),
    createHost: () => hostFor(exchange, opts.paperActive ?? false),
  })
}

const LIMIT_ORDER: OrderParams = {
  market: 'kalshi',
  pair: 'KXBTCD-26AUG15-T53',
  side: 'buy',
  type: 'limit',
  size: '25',
  price: '0.53',
  mode: 'live',
}

describe('placeOrder never throws', () => {
  it('returns the order id on success', async () => {
    const exchange = fakeExchange({
      createOrder: async () => ({ id: 'ord-1' }),
    })
    const result = await runtime(exchange).placeOrder(LIMIT_ORDER, slot())
    expect(result).toEqual({ success: true, orderId: 'ord-1' })
  })

  it('turns a venue rejection into a failure result', async () => {
    const exchange = fakeExchange({
      createOrder: async () => {
        throw new Error('kalshi insufficient balance')
      },
    })
    const result = await runtime(exchange).placeOrder(LIMIT_ORDER, slot())
    expect(result.success).toBe(false)
    expect(result.error).toContain('insufficient balance')
  })

  it('turns a non-Error rejection into a failure result', async () => {
    const exchange = fakeExchange({
      createOrder: async () => {
        throw 'plain string thrown by a transport shim'
      },
    })
    const result = await runtime(exchange).placeOrder(LIMIT_ORDER, slot())
    expect(result.success).toBe(false)
  })

  it('turns a missing createOrder into a failure result', async () => {
    const exchange = fakeExchange({ createOrder: undefined })
    const result = await runtime(exchange).placeOrder(LIMIT_ORDER, slot())
    expect(result.success).toBe(false)
    expect(result.error).toContain('cannot place orders')
  })

  it('turns an unresolvable outcome into a failure result', async () => {
    const exchange = fakeExchange({
      fetchEvents: async () => [],
      createOrder: async () => ({ id: 'never' }),
    })
    const result = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).placeOrder(
      { ...LIMIT_ORDER, market: 'polymarket', pair: 'GONE-YES' },
      slot({ fields: { walletAddress: '0xabc', privateKey: '0xkey' } }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('events browser')
  })

  it('records the pair before anything that can fail', async () => {
    const exchange = fakeExchange({
      createOrder: async () => {
        throw new Error('rejected')
      },
    })
    const s = slot()
    await runtime(exchange).placeOrder(LIMIT_ORDER, s)
    expect(s.currentPair).toBe('KXBTCD-26AUG15-T53')
  })
})

describe('paper mode', () => {
  it('refuses a paper slot when the sandbox did not take', async () => {
    // Falling through would sign a real order against a credential the user
    // labelled paper — the worst failure mode in this module.
    const exchange = fakeExchange({
      createOrder: async () => ({ id: 'should-not-happen' }),
    })
    let placed = false
    const result = await runtime(
      fakeExchange({
        ...exchange,
        createOrder: async () => {
          placed = true
          return { id: 'x' }
        },
      }),
      { paperActive: false },
    ).placeOrder({ ...LIMIT_ORDER, mode: 'paper' }, slot({ mode: 'paper' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('paper trading environment')
    expect(placed).toBe(false)
  })

  it('places the order when the sandbox is active', async () => {
    const exchange = fakeExchange({
      createOrder: async () => ({ id: 'demo-1' }),
    })
    const result = await runtime(exchange, { paperActive: true }).placeOrder(
      { ...LIMIT_ORDER, mode: 'paper' },
      slot({ mode: 'paper' }),
    )
    expect(result).toEqual({ success: true, orderId: 'demo-1' })
  })
})

describe('secret redaction', () => {
  it('strips credential material out of a venue error message', async () => {
    const exchange = fakeExchange({
      createOrder: async () => {
        throw new Error(`kalshi rejected request signed with ${PEM}`)
      },
    })
    const result = await runtime(exchange).placeOrder(LIMIT_ORDER, slot())
    expect(result.error).not.toContain('supersecretpemvalue')
    expect(result.error).toContain('***')
  })

  it('strips a wallet address echoed back by the venue', async () => {
    const exchange = fakeExchange({
      createOrder: async () => {
        throw new Error('rejected for funder 0xabcdef0123456789')
      },
    })
    const result = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).placeOrder(
      { ...LIMIT_ORDER, market: 'polymarket', pair: 'KXBTCD-26AUG15-T53' },
      slot({
        fields: { walletAddress: '0xabcdef0123456789', privateKey: '0xkey' },
      }),
    )
    expect(result.error).not.toContain('0xabcdef0123456789')
  })
})

describe('wallet slots', () => {
  it('never writes the resolved key back into the slot', async () => {
    let reads = 0
    const exchange = fakeExchange({
      createOrder: async () => ({ id: 'ord-w' }),
    })
    const s = slot({
      kind: 'wallet',
      fields: { walletAddress: '0xabc' },
      secretRef: async () => {
        reads++
        return '0xprivatekey'
      },
    })
    const rt = runtime(exchange, { venue: polymarketPredictionVenue })
    await rt.placeOrder({ ...LIMIT_ORDER, market: 'polymarket' }, s)
    await rt.placeOrder({ ...LIMIT_ORDER, market: 'polymarket' }, s)
    // Resolved once, for the build — `secretRef` is a vault decrypt and the
    // terminal polls this path every 60 s. See PredictionTradingRuntime's doc
    // for why an in-place rotation waits for the next rebuild signal.
    expect(reads).toBe(1)
    // And never written back into the slot.
    expect(s.fields['privateKey']).toBeUndefined()
  })

  it('reports a locked wallet as a failure the user can act on', async () => {
    const exchange = fakeExchange({
      createOrder: async () => ({ id: 'never' }),
    })
    const result = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).placeOrder(
      { ...LIMIT_ORDER, market: 'polymarket' },
      slot({
        kind: 'wallet',
        fields: { walletAddress: '0xabc' },
        secretRef: async () => null,
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('locked')
  })
})

describe('reads degrade to empty rather than throwing', () => {
  it('returns no open orders when the venue errors', async () => {
    const exchange = fakeExchange({
      fetchOpenOrders: async () => {
        throw new Error('rate limited')
      },
    })
    expect(await runtime(exchange).fetchOpenOrders(slot())).toEqual([])
  })

  it('returns no balances when the venue errors', async () => {
    const exchange = fakeExchange({
      fetchBalance: async () => {
        throw new Error('rate limited')
      },
    })
    expect(await runtime(exchange).fetchBalances(slot())).toEqual([])
  })

  it('normalizes balances and drops empty currencies', async () => {
    const exchange = fakeExchange({
      fetchBalance: async () => ({
        total: { USD: 250.5, BTC: 0 },
        free: { USD: 200, BTC: 0 },
        used: { USD: 50.5, BTC: 0 },
      }),
    })
    expect(await runtime(exchange).fetchBalances(slot())).toEqual([
      { currency: 'USD', available: '200', frozen: '50.5', total: '250.5' },
    ])
  })

  it('maps an order row onto the pair key, not ccxt handle', async () => {
    const exchange = fakeExchange({
      fetchOpenOrders: async () => [
        {
          id: 'o1',
          outcome: 'FED_CUT_25BPS:YES',
          side: 'buy',
          type: 'limit',
          amount: 40,
          price: 0.62,
          filled: 10,
          status: 'open',
          timestamp: 1_700_000_000_000,
        },
      ],
    })
    const [order] = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).fetchOpenOrders(walletSlot())
    expect(order?.pair).toBe('FED-CUT-25BPS-YES')
    // A partial fill is its own status; the position ledger keys off it.
    expect(order?.status).toBe('partially_filled')
  })
})

describe('positions', () => {
  it('surfaces a missing wallet address as a sentence, not an empty list', async () => {
    // Polymarket's fetchPositions throws ArgumentsRequired without one, which
    // is a configuration problem — an empty list would read as "you hold
    // nothing".
    const exchange = fakeExchange({
      fetchPositions: async () => {
        throw new Error(
          'polymarket walletAddress is required to fetchPositions',
        )
      },
    })
    const result = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).fetchPositions(walletSlot())
    expect(result.positions).toEqual([])
    expect(result.error).toContain('walletAddress')
  })

  it('normalizes rows and drops flat ones', () => {
    const rows = normalizePredictionPositions(
      [
        {
          outcome: 'FED_CUT:YES',
          label: 'Yes',
          contracts: 120,
          entryPrice: 0.48,
          side: 'long',
          market: 'Will the Fed cut 25bps?',
          end: 1_800_000_000_000,
        },
        { outcome: 'FED_CUT:NO', label: 'No', contracts: 0 },
        {
          outcome: 'OLD_EVENT:YES',
          label: 'Yes',
          contracts: 50,
          resolved: true,
          payout: 50,
          market: 'Resolved question',
        },
      ],
      (outcome) => outcome.replace(/[_:]/g, '-').toUpperCase(),
    )
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual({
      pairKey: 'FED-CUT-YES',
      outcomeLabel: 'Yes',
      contracts: '120',
      avgPrice: '0.48',
      side: 'long',
      marketTitle: 'Will the Fed cut 25bps?',
      endMs: 1_800_000_000_000,
    })
    expect(rows[1]?.resolved).toBe(true)
    expect(rows[1]?.payout).toBe('50')
  })

  it('reads a negative contract count as a short', () => {
    const [row] = normalizePredictionPositions(
      [{ outcome: 'A:YES', contracts: -10 }],
      (outcome) => outcome,
    )
    expect(row?.side).toBe('short')
    expect(row?.contracts).toBe('10')
  })
})

describe('cancel', () => {
  it('cancels by id even when the outcome can no longer be resolved', async () => {
    // A resolved-away market must still be cancellable: that is the one action
    // that frees collateral.
    let cancelled: Array<unknown> = []
    const exchange = fakeExchange({
      fetchEvents: async () => [],
      cancelOrder: async (id, outcome) => {
        cancelled = [id, outcome]
        return { id }
      },
    })
    const result = await runtime(exchange, {
      venue: polymarketPredictionVenue,
    }).cancelOrder('o1', 'GONE-YES', walletSlot())
    expect(result).toEqual({ success: true, orderId: 'o1' })
    expect(cancelled).toEqual(['o1', undefined])
  })

  it('turns a cancel failure into a failure result', async () => {
    const exchange = fakeExchange({
      cancelOrder: async () => {
        throw new Error('order not found')
      },
    })
    const result = await runtime(exchange).cancelOrder(
      'o1',
      'KXBTCD-26AUG15-T53',
      slot(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})
