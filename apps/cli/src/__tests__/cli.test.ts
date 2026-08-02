// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { $ } from 'bun'

const CLI = resolve(
  dirname(new URL(import.meta.url).pathname),
  '..',
  'index.ts',
)

describe('CLI', () => {
  it('prints help with --help', async () => {
    const result = await $`bun ${CLI} --help`.text()
    expect(result).toContain('Pairlens CLI')
    expect(result).toContain('candles')
    expect(result).toContain('ticker')
    expect(result).toContain('orderbook')
    expect(result).toContain('signals')
    expect(result).toContain('order')
    expect(result).toContain('markets')
  })

  it('prints help with help command', async () => {
    const result = await $`bun ${CLI} help`.text()
    expect(result).toContain('Pairlens CLI')
  })

  it('lists available markets', async () => {
    const result = await $`bun ${CLI} markets`.text()
    expect(result).toContain('okx')
    expect(result).toContain('binance')
    expect(result).toContain('bybit')
  })

  it('exits with error for unknown command', async () => {
    const proc = Bun.spawn(['bun', CLI, 'nonexistent'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    expect(code).toBe(1)
  })

  it('exits with error when --pair is missing for candles', async () => {
    const proc = Bun.spawn(['bun', CLI, 'candles'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    expect(code).toBe(1)
  })
})

describe('candles command', () => {
  it('fetches JSON candles from OKX', async () => {
    const result =
      await $`bun ${CLI} candles --market okx --pair BTC-USDT --timeframe 1d --limit 3`.text()
    const candles = JSON.parse(result)
    expect(Array.isArray(candles)).toBe(true)
    expect(candles.length).toBe(3)
    expect(candles[0]).toHaveProperty('ts')
    expect(candles[0]).toHaveProperty('open')
    expect(candles[0]).toHaveProperty('high')
    expect(candles[0]).toHaveProperty('low')
    expect(candles[0]).toHaveProperty('close')
    expect(candles[0]).toHaveProperty('volume')
  }, 15000)

  it('fetches CSV candles', async () => {
    const result =
      await $`bun ${CLI} candles --market okx --pair ETH-USDT --timeframe 1d --limit 2 --format csv`.text()
    const lines = result.trim().split('\n')
    expect(lines[0]).toBe('ts,open,high,low,close,volume')
    expect(lines.length).toBe(3) // header + 2 rows
  }, 15000)

  // Binance blocks US IPs (HTTP 451) — skip in CI where runners are US-based
  it.skipIf(!!process.env.CI)(
    'fetches candles from Binance',
    async () => {
      const result =
        await $`bun ${CLI} candles --market binance --pair BTC-USDT --timeframe 1d --limit 2`.text()
      const candles = JSON.parse(result)
      expect(candles.length).toBe(2)
      expect(candles[0].close).toBeGreaterThan(0)
    },
    15000,
  )
})

describe('signals command', () => {
  it('computes signals and detects regime', async () => {
    const result =
      await $`bun ${CLI} signals --market okx --pair BTC-USDT --timeframe 1d`.text()
    expect(result).toContain('Loaded')
    expect(result).toContain('Regime:')
    expect(result).toMatch(/Regime: (trend|chop|unknown)/)
  }, 15000)
})
