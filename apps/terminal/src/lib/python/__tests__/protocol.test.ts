// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { candleTransferables, outputTransferables } from '../protocol'
import type { CandleArrays } from '../protocol'

function makeCandles(n: number): CandleArrays {
  return {
    time: new Float64Array(n),
    open: new Float64Array(n),
    high: new Float64Array(n),
    low: new Float64Array(n),
    close: new Float64Array(n),
    volume: new Float64Array(n),
  }
}

describe('candleTransferables', () => {
  it('collects the six distinct backing buffers', () => {
    const candles = makeCandles(8)
    const buffers = candleTransferables(candles)
    expect(buffers).toHaveLength(6)
    expect(buffers).toContain(candles.close.buffer)
    expect(buffers).toContain(candles.volume.buffer)
  })

  it('deduplicates views sharing one buffer', () => {
    const backing = new ArrayBuffer(6 * 4 * 8)
    const view = (i: number) => new Float64Array(backing, i * 4 * 8, 4)
    const candles: CandleArrays = {
      time: view(0),
      open: view(1),
      high: view(2),
      low: view(3),
      close: view(4),
      volume: view(5),
    }
    expect(candleTransferables(candles)).toEqual([backing])
  })
})

describe('outputTransferables', () => {
  it('collects one buffer per output series', () => {
    const outputs = {
      macd: new Float64Array(4),
      signal: new Float64Array(4),
    }
    const buffers = outputTransferables(outputs)
    expect(buffers).toHaveLength(2)
    expect(buffers).toContain(outputs.macd.buffer)
    expect(buffers).toContain(outputs.signal.buffer)
  })

  it('is empty for empty outputs', () => {
    expect(outputTransferables({})).toEqual([])
  })
})
