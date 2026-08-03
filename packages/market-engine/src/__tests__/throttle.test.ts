// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { StreamThrottle } from '../throttle'

describe('StreamThrottle', () => {
  it('defaults to balanced mode', () => {
    const throttle = new StreamThrottle()
    expect(throttle.getMode()).toBe('balanced')
  })

  it('performance mode passes through immediately', () => {
    const throttle = new StreamThrottle()
    throttle.setMode('performance')
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('candles', (d) => received.push(d))
    wrapped(1)
    wrapped(2)
    wrapped(3)
    expect(received).toEqual([1, 2, 3])
  })

  it('balanced mode throttles calls', async () => {
    const throttle = new StreamThrottle()
    throttle.setMode('balanced')
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('candles', (d) => received.push(d))

    wrapped(1) // fires immediately
    wrapped(2) // throttled
    wrapped(3) // throttled (overwrites 2)

    expect(received).toEqual([1]) // only first call went through

    // Wait for throttle to flush
    await new Promise((r) => setTimeout(r, 600))
    expect(received).toEqual([1, 3]) // latest value delivered
  })

  it('cancel() drops the pending trailing-edge update (no stale frame after unsubscribe)', async () => {
    const throttle = new StreamThrottle()
    throttle.setMode('balanced')
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('candles', (d) => received.push(d))

    wrapped(1) // fires immediately
    wrapped(2) // throttled — pending
    expect(received).toEqual([1])

    // Unsubscribe before the trailing timer fires.
    wrapped.cancel()

    await new Promise((r) => setTimeout(r, 600))
    // The pending value must NOT be delivered after cancel.
    expect(received).toEqual([1])
  })

  it('setMode to a faster mode reschedules a pending trailing-edge timer', async () => {
    const throttle = new StreamThrottle()
    throttle.setMode('energy-saver') // 2000ms candle interval
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('candles', (d) => received.push(d))

    wrapped(1) // fires immediately
    wrapped(2) // pending — timer scheduled ~2000ms out
    expect(received).toEqual([1])

    // Switching to performance must flush the pending frame promptly, not
    // leave it waiting out the stale 2000ms delay.
    throttle.setMode('performance')
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual([1, 2])
  })

  it('setMode to a slower mode defers the pending flush to the new interval', async () => {
    const throttle = new StreamThrottle()
    throttle.setMode('balanced') // 500ms candle interval
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('candles', (d) => received.push(d))

    wrapped(1)
    wrapped(2) // pending — timer scheduled ~500ms out
    throttle.setMode('energy-saver') // 2000ms — pending must wait longer

    await new Promise((r) => setTimeout(r, 700))
    // The old 500ms timer must not have fired under the new slower mode.
    expect(received).toEqual([1])
    wrapped.cancel()
  })
})

describe('StreamThrottle — trades are lossless', () => {
  // The throttle is lossy by construction: a queued frame is replaced by the
  // next arrival. That is correct for state streams (latest wins) and wrong
  // for the trade tape, where each frame is an execution no later frame
  // contains. These pin the invariant so a future tuning pass can't quietly
  // start deleting prints.
  it('never drops a trade frame in any mode', () => {
    for (const mode of ['performance', 'balanced', 'energy-saver'] as const) {
      const throttle = new StreamThrottle()
      throttle.setMode(mode)
      const received: Array<number> = []
      const wrapped = throttle.wrap<number>('trades', (d) => received.push(d))

      // A burst that would collapse to one frame on any throttled stream.
      for (let i = 1; i <= 25; i++) wrapped(i)

      expect(received).toHaveLength(25)
      expect(received[0]).toBe(1)
      expect(received[24]).toBe(25)
      wrapped.cancel()
    }
  })

  it('delivers trades synchronously, with nothing left pending', () => {
    const throttle = new StreamThrottle()
    throttle.setMode('energy-saver')
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('trades', (d) => received.push(d))

    wrapped(1)
    // No timer involved at interval 0 — the frame is already out.
    expect(received).toEqual([1])
    wrapped.cancel()
    expect(received).toEqual([1])
  })

  it('still collapses an orderbook burst — the contrast that makes it lossy', () => {
    const throttle = new StreamThrottle()
    throttle.setMode('balanced')
    const received: Array<number> = []
    const wrapped = throttle.wrap<number>('orderbook', (d) => received.push(d))

    for (let i = 1; i <= 25; i++) wrapped(i)

    expect(received).toEqual([1])
    wrapped.cancel()
  })
})
