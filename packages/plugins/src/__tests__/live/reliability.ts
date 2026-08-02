// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Connector-switch reliability harness.
 *
 * Reproduces the terminal's real switching pattern: ONE long-lived WsClient per
 * connector (the plugin keeps a singleton and reuses it across market switches),
 * with candle+ticker+orderbook subscribed near-simultaneously, then torn down
 * (switch away) and re-subscribed (switch back). Connectors that rebuild the
 * whole socket on each subscription change can race here — out-of-order connect
 * resolution leaves a stale socket missing some channels, so a channel silently
 * stops delivering after a switch. That is the "data streaming stops on switch"
 * and "chart stalls while orderbook stays live" class of bug.
 */

import type { LiveDriver, WsClientLike } from './harness'

export type ChannelDelivery = {
  candle: boolean
  ticker: boolean
  book: boolean
}

export type ReliabilityResult = {
  name: string
  cycles: number
  /** Per-cycle delivery after (re)subscribing all three channels. */
  perCycle: Array<ChannelDelivery>
  /** True if every channel delivered on every cycle. */
  ok: boolean
  failureSummary: string
}

const SETTLE_TIMEOUT = 15_000
// Quick switch-back — inside the connectors' disconnect grace period, where the
// rebuild/reconnect race is most likely.
const SWITCH_AWAY_MS = 800

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Subscribe all three channels on `client` and resolve once each has delivered (or timeout). */
function subscribeAllAndWait(
  client: WsClientLike,
  d: LiveDriver,
): Promise<{ got: ChannelDelivery; unsubscribe: () => void }> {
  return new Promise((resolve) => {
    const got: ChannelDelivery = { candle: false, ticker: false, book: false }
    let settled = false

    const unsubs: Array<() => void> = []
    const unsubscribe = () => {
      for (const u of unsubs) {
        try {
          u()
        } catch {
          // ignore
        }
      }
    }

    const check = () => {
      if (settled) return
      if (got.candle && got.ticker && got.book) {
        settled = true
        clearTimeout(timer)
        resolve({ got, unsubscribe })
      }
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ got, unsubscribe })
    }, SETTLE_TIMEOUT)

    // Subscribe in rapid succession WITHOUT awaiting — mirrors the terminal,
    // where three independent hooks each kick off a subscription and the
    // connector coalesces/rebuilds. This is what triggers the race.
    unsubs.push(
      client.subscribeCandles(d.pair, d.timeframe, d.country, (u) => {
        if (u?.candles?.length) {
          got.candle = true
          check()
        }
      }),
    )
    unsubs.push(
      client.subscribeTicker(d.pair, d.country, (u) => {
        if (u?.ticker?.last > 0) {
          got.ticker = true
          check()
        }
      }),
    )
    unsubs.push(
      client.subscribeOrderbook(d.pair, d.country, (u) => {
        if ((u?.bids?.length ?? 0) > 0 && (u?.asks?.length ?? 0) > 0) {
          got.book = true
          check()
        }
      }),
    )
  })
}

export async function runReliabilityCheck(
  d: LiveDriver,
  cycles = 4,
): Promise<ReliabilityResult> {
  // ONE client reused across cycles — exactly how the plugin reuses its
  // singleton WsClient across market switches.
  const client = d.makeClient()
  const perCycle: Array<ChannelDelivery> = []

  try {
    for (let i = 0; i < cycles; i++) {
      const { got, unsubscribe } = await subscribeAllAndWait(client, d)
      perCycle.push(got)
      // Switch away.
      unsubscribe()
      await delay(SWITCH_AWAY_MS)
    }
  } finally {
    client.destroy()
  }

  const failedCycles = perCycle
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !(c.candle && c.ticker && c.book))

  const ok = failedCycles.length === 0
  const failureSummary = ok
    ? ''
    : failedCycles
        .map(({ c, i }) => {
          const dead = (['candle', 'ticker', 'book'] as const).filter(
            (k) => !c[k],
          )
          return `cycle ${i + 1}: no ${dead.join('+')}`
        })
        .join('; ')

  return { name: d.name, cycles, perCycle, ok, failureSummary }
}

export function formatReliabilityMatrix(
  rows: Array<ReliabilityResult>,
): string {
  const nameW = Math.max(9, ...rows.map((r) => r.name.length))
  const lines = [
    'connector'.padEnd(nameW) + '  cycles(candle/ticker/book per cycle)',
    '-'.repeat(nameW + 40),
  ]
  for (const r of rows) {
    const cells = r.perCycle
      .map(
        (c) =>
          `${c.candle ? 'C' : '·'}${c.ticker ? 'T' : '·'}${c.book ? 'B' : '·'}`,
      )
      .join(' ')
    lines.push(
      `${r.name.padEnd(nameW)}  ${r.ok ? 'PASS' : 'FAIL'}  ${cells}` +
        (r.ok ? '' : `   (${r.failureSummary})`),
    )
  }
  return lines.join('\n')
}
