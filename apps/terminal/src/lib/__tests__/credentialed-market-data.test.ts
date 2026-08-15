// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { alpacaMarketConnectorManifest } from '@pairlens/plugins/alpaca-market-connector'

/**
 * Alpaca is the only connector whose MARKET DATA needs credentials — every CEX
 * has a public feed. In a browser the vault is sealed on load, so the chart's
 * first subscribe runs before any credential exists, throws, and nothing
 * re-runs it: unlocking a vault is not a pair, venue or timeframe change. The
 * pane then spins for the rest of the session while trading works fine, which
 * is a confusing way to be broken.
 *
 * The recovery is a `streamVersion` bump once such a connector is provisioned,
 * reusing the counter the stream hooks already watch for pause/resume. Two
 * halves, and each is silently skippable:
 *
 *   1. the connector must DECLARE that its data is credential-gated,
 *   2. the provider must bump on that flag — and only on that flag, or every
 *      crypto chart gets torn down and refetched when a vault is unlocked.
 */

const SRC = join(import.meta.dir, '..', '..')

function read(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('credential-gated market data recovers after unlock', () => {
  test('the Alpaca connector declares its data is credential-gated', () => {
    expect(
      alpacaMarketConnectorManifest.metadata?.['credentialedMarketData'],
    ).toBe(true)
  })

  const provider = read('lib/market-data-provider.tsx')

  test('the provider bumps the stream version when one is provisioned', () => {
    expect(provider).toMatch(
      /credentialedMarketData'\] === true\)\s*\{\s*setStreamVersion\(\(v\) => v \+ 1\)/,
    )
  })

  test('the bump is gated on the flag, never unconditional', () => {
    // Exactly two bump sites: this one and resumeStreams. A third would most
    // likely be an unguarded one.
    const bumps = provider.match(/setStreamVersion\(\(v\) => v \+ 1\)/g)
    expect(bumps).toHaveLength(2)
  })

  test('bumping cannot re-trigger provisioning', () => {
    // streamVersion in the provisioning effect's deps would loop: bump →
    // re-provision → bump.
    expect(provider).toContain(
      '}, [credentials, credentialsLoaded, pluginsReady, pluginManager])',
    )
  })
})
