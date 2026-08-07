// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { $ } from 'bun'

const HERE = dirname(new URL(import.meta.url).pathname)
const CLI = resolve(HERE, '..', 'index.ts')

/**
 * Preload that answers OKX REST from a fixture inside the CLI's own process.
 *
 * The data commands used to call the live venue on every run, with a 15s
 * timeout standing in for a ~300ms request. That is a required status check
 * built on a third-party API being reachable and fast from a CI runner: it
 * went 307ms, timeout, 216ms across three runs of identical code, and a red
 * `main` from it looks exactly like a real regression until someone opens the
 * log. The same file already skips Binance in CI over an HTTP 451, so the
 * network was a known problem here; this removes it from the rest.
 *
 * What the venue was actually contributing is response SHAPE, and that is
 * covered where it belongs — the connector conformance suite in
 * packages/plugins drives every venue's parser against recorded payloads. What
 * these tests uniquely cover is the CLI wiring around it, which the fixture
 * leaves entirely intact.
 */
const STUB = resolve(HERE, 'fixtures', 'okx-rest-stub.ts')

/** The CLI, wired to the fixture instead of the internet. */
const cli = (...args: Array<string>) =>
  $`bun --preload ${STUB} ${CLI} ${args}`.text()

/**
 * Live-venue runs still exist, they just do not gate anything: set
 * PAIRLENS_LIVE_E2E=1 to point the same commands at the real OKX. Deleting
 * them outright would drop the only check that the venue still answers the
 * way the parsers expect.
 */
const liveOnly = it.skipIf(!process.env.PAIRLENS_LIVE_E2E)

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
    const result = await cli(
      'candles',
      '--market',
      'okx',
      '--pair',
      'BTC-USDT',
      '--timeframe',
      '1d',
      '--limit',
      '3',
    )
    const candles = JSON.parse(result)
    expect(Array.isArray(candles)).toBe(true)
    expect(candles.length).toBe(3)
    expect(candles[0]).toHaveProperty('ts')
    expect(candles[0]).toHaveProperty('open')
    expect(candles[0]).toHaveProperty('high')
    expect(candles[0]).toHaveProperty('low')
    expect(candles[0]).toHaveProperty('close')
    expect(candles[0]).toHaveProperty('volume')
    // Oldest first, so the parser's reverse of OKX's newest-first ordering is
    // asserted rather than assumed — a detail the live version could not pin
    // without hard-coding a moment in market history.
    expect(candles[0].ts).toBeLessThan(candles[2].ts)
  })

  it('fetches CSV candles', async () => {
    const result = await cli(
      'candles',
      '--market',
      'okx',
      '--pair',
      'ETH-USDT',
      '--timeframe',
      '1d',
      '--limit',
      '2',
      '--format',
      'csv',
    )
    const lines = result.trim().split('\n')
    expect(lines[0]).toBe('ts,open,high,low,close,volume')
    expect(lines.length).toBe(3) // header + 2 rows
  })

  // There was a Binance case here. It is gone rather than stubbed, and both
  // halves of that are deliberate.
  //
  // Stubbing it would have made it the OKX case above with a different market
  // string: all fourteen CEX connectors are built by the same
  // createCexConnectorPlugin factory, and per-venue wire shapes are already
  // covered by golden-conformance in packages/plugins. It would have asserted
  // nothing new while looking like coverage of a second venue.
  //
  // Keeping it live was worse. Binance answers a US address with HTTP 451, so
  // it was skipped in CI and ran ONLY on contributors' machines — where it
  // fails outright for anyone in the US, and fails intermittently for everyone
  // else. A test that cannot pass for a whole class of contributor teaches
  // them their tree is broken when it is not.
  //
  // What it was actually asking — does Binance still answer the way our parser
  // expects — is a live question, and it now lives with the other live
  // questions: the connector conformance suite in packages/plugins covers
  // Binance, and .github/workflows/live-connectors.yml runs that daily.

  liveOnly(
    'fetches candles from the live OKX API',
    async () => {
      const result =
        await $`bun ${CLI} candles --market okx --pair BTC-USDT --timeframe 1d --limit 3`.text()
      const candles = JSON.parse(result)
      expect(candles.length).toBe(3)
      expect(candles[0].close).toBeGreaterThan(0)
    },
    15000,
  )
})

describe('signals command', () => {
  it('computes signals and detects regime', async () => {
    const result = await cli(
      'signals',
      '--market',
      'okx',
      '--pair',
      'BTC-USDT',
      '--timeframe',
      '1d',
    )
    // Exact values, because the input is now known. The live version could
    // only accept any of the three regimes and any candle count, which meant
    // it passed whether or not the strategy engine had computed anything.
    expect(result).toContain('Loaded 300 candles for BTC-USDT (1d) on OKX')
    expect(result).toContain('Regime: chop')
  })

  liveOnly(
    'computes signals against the live OKX API',
    async () => {
      const result =
        await $`bun ${CLI} signals --market okx --pair BTC-USDT --timeframe 1d`.text()
      expect(result).toContain('Loaded')
      expect(result).toMatch(/Regime: (trend|chop|unknown)/)
    },
    15000,
  )
})
