// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { alpacaMarketConnectorManifest } from '@pairlens/plugins/alpaca-market-connector'

import { resolveCredentialGate } from '../use-market-credential-gate'

const SRC = join(import.meta.dir, '..', '..')

describe('resolveCredentialGate', () => {
  test('a venue with a public feed is never gated', () => {
    for (const status of [
      'idle',
      'loading',
      'ready',
      'sealed',
      'error',
    ] as const) {
      expect(
        resolveCredentialGate({
          credentialedMarketData: false,
          status,
          hasCredential: false,
        }),
      ).toBe('ok')
    }
  })

  test('a sealed vault asks for an unlock, not for a key', () => {
    expect(
      resolveCredentialGate({
        credentialedMarketData: true,
        status: 'sealed',
        // Sealed always reports an empty list — see the CredentialsStatus doc
        // comment. Guessing "no key" from it is the bug this asserts against.
        hasCredential: false,
      }),
    ).toBe('sealed')
  })

  test('a loaded profile with no key for the venue asks for one', () => {
    expect(
      resolveCredentialGate({
        credentialedMarketData: true,
        status: 'ready',
        hasCredential: false,
      }),
    ).toBe('missing')
  })

  test('a provisioned key gets out of the way', () => {
    expect(
      resolveCredentialGate({
        credentialedMarketData: true,
        status: 'ready',
        hasCredential: true,
      }),
    ).toBe('ok')
  })

  // The window between "the app booted" and "the keychain answered" is every
  // cold start. Painting "Connect Alpaca" there would tell users with a
  // perfectly good key that they have none.
  test('an unfinished read shows no verdict at all', () => {
    for (const status of ['idle', 'loading', 'error'] as const) {
      expect(
        resolveCredentialGate({
          credentialedMarketData: true,
          status,
          hasCredential: false,
        }),
      ).toBe('ok')
    }
  })
})

/**
 * The flag is what makes any of this reachable. It has to survive on the
 * manifest, because the panes read it BEFORE any adapter exists to ask.
 */
describe('the flag reaches the panes', () => {
  test('Alpaca declares credentialedMarketData', () => {
    expect(
      alpacaMarketConnectorManifest.metadata?.['credentialedMarketData'],
    ).toBe(true)
  })

  test('useAvailableMarkets carries it onto every MarketOption', () => {
    const src = readFileSync(
      join(SRC, 'hooks/use-available-markets.ts'),
      'utf8',
    )
    expect(src).toMatch(
      /credentialedMarketData: Boolean\(m\.credentialedMarketData\)/,
    )
  })
})

/**
 * Ordering is the whole point, not a detail.
 *
 * With no key nothing was ever subscribed, so the pair-availability verdict is
 * a verdict on a request that was never made. Checked in the wrong order, a
 * locked keychain reads as "Alpaca doesn't list AAPL" and the recovery CTA
 * offers to switch to a venue that has no stocks at all.
 */
describe('every market pane checks the gate before pair availability', () => {
  const PANES = [
    'components/terminal/chart-pane.tsx',
    'components/terminal/orderbook-pane.tsx',
    'components/terminal/depth-pane.tsx',
    'components/terminal/trades-pane.tsx',
    'components/terminal/liquidity-heatmap-pane.tsx',
  ]

  for (const pane of PANES) {
    const src = readFileSync(join(SRC, pane), 'utf8')

    test(`${pane} renders PaneCredentialsRequired`, () => {
      expect(src).toContain('PaneCredentialsRequired')
      expect(src).toContain('useMarketCredentialGate')
    })

    test(`${pane} checks it first`, () => {
      const gate = src.indexOf("credentialGate.state !== 'ok'")
      // The JSX site, not the import at the top of the file.
      const unavailable = src.indexOf('<PaneDataUnavailable')
      expect(gate).toBeGreaterThan(-1)
      expect(unavailable).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(unavailable)
    })
  }

  // The phone runs the same order through its own markup (see the comment on
  // `ChartUnavailable` for why it is markup and not the component).
  test('the mobile chart surface checks it before its own empty state', () => {
    const src = readFileSync(
      join(SRC, 'mobile/chart/mobile-chart-surface.tsx'),
      'utf8',
    )
    expect(src.indexOf('<ChartCredentialsRequired')).toBeLessThan(
      src.indexOf('<ChartUnavailable'),
    )
  })
})
