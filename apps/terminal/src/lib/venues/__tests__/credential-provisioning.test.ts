// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One exchange key now provisions two connectors, and the properties that
 * keeps honest are all about isolation.
 *
 * The alias map and the balance namespacing are testable directly. The
 * provisioning effect is not — it lives inside a provider that needs a plugin
 * manager, a credential store and a vault — so its invariants are read off the
 * source, the way `credentialed-market-data.test.ts` already reads that file.
 * A source assertion is a weak test; it is a much stronger one than the
 * nothing that was there before, and each one names the bug it pins.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  balanceScopeFor,
  credentialAliasEntries,
  credentialMarketFor,
  credentialsForMarket,
  hasCredentialForMarket,
  isAliasedVenue,
  setCredentialAliases,
} from '../credential-alias'
import type { PluginInstance } from '@pairlens/plugin-system/types'
import {
  clearBalancesForCredential,
  clearBalancesForScope,
  getBalances,
  upsertBalance,
  venueBalanceCredentialKey,
} from '@/stores/balances-store'

const CREDENTIALS = [
  { id: 'c1', market: 'binance' },
  { id: 'c2', market: 'kucoin' },
  { id: 'c3', market: 'kraken-futures' },
]

function asPlugin(id: string, market: string, alias?: string): PluginInstance {
  return {
    manifest: {
      id,
      capabilities: [{ id: 'market-data:candles', markets: [market] }],
      metadata: alias ? { credentialAlias: alias } : {},
    },
  } as unknown as PluginInstance
}

beforeEach(() => {
  setCredentialAliases(
    credentialAliasEntries([
      asPlugin('binance-market-connector', 'binance'),
      asPlugin(
        'binance-futures-market-connector',
        'binance-futures',
        'binance',
      ),
      asPlugin('kucoin-futures-market-connector', 'kucoin-futures', 'kucoin'),
      // Kraken Futures issues its own keys, so it declares no alias.
      asPlugin('kraken-futures-market-connector', 'kraken-futures'),
    ]),
  )
})

describe('credential aliases', () => {
  test('a futures venue resolves to the key its spot sibling holds', () => {
    expect(credentialMarketFor('binance-futures')).toBe('binance')
    expect(credentialMarketFor('kucoin-futures')).toBe('kucoin')
    expect(isAliasedVenue('binance-futures')).toBe(true)
  })

  test('a venue with its own keys is the identity function', () => {
    expect(credentialMarketFor('kraken-futures')).toBe('kraken-futures')
    expect(credentialMarketFor('okx')).toBe('okx')
    expect(isAliasedVenue('kraken-futures')).toBe(false)
  })

  test('the lookup finds the spot key for a futures venue', () => {
    // The bug this prevents: a raw `c.market === market` filter finds nothing
    // for 'binance-futures' however many Binance keys are stored, and the
    // ticket then blurs itself behind a connect gate for a live account.
    expect(credentialsForMarket(CREDENTIALS, 'binance-futures')).toEqual([
      { id: 'c1', market: 'binance' },
    ])
    expect(hasCredentialForMarket(CREDENTIALS, 'binance-futures')).toBe(true)
    expect(hasCredentialForMarket(CREDENTIALS, 'okx')).toBe(false)
  })

  test('a futures venue resolves to exactly ONE credential, not two', () => {
    // The positions hook used to accept both the venue id AND the alias, which
    // listed one account twice the moment a same-named key existed.
    const both = [...CREDENTIALS, { id: 'c4', market: 'binance-futures' }]
    expect(credentialsForMarket(both, 'binance-futures')).toHaveLength(1)
  })
})

describe('balance namespacing', () => {
  beforeEach(() => {
    clearBalancesForCredential('c1')
  })

  test('an aliased venue writes to its own namespace', () => {
    expect(balanceScopeFor('c1', 'binance')).toBe('c1')
    expect(balanceScopeFor('c1', 'binance-futures')).toBe('c1@binance-futures')
  })

  const record = (credentialId: string, currency: string) => ({
    currency,
    available: '1',
    frozen: '0',
    total: '1',
    market: 'binance',
    credentialId,
    updatedAt: 0,
  })

  test('clearing a scope leaves the sibling venue alone', () => {
    upsertBalance(record('c1', 'BTC'))
    upsertBalance(
      record(venueBalanceCredentialKey('c1', 'binance-futures'), 'USDT'),
    )
    clearBalancesForScope('c1@binance-futures')
    expect(getBalances().map((b) => b.credentialId)).toEqual(['c1'])
  })

  test('removing the account clears every venue it reached', () => {
    // Derived by prefix rather than from a caller-held list of scopes: by the
    // time teardown runs the credential is already out of the store, so its
    // aliases cannot be recomputed from it.
    upsertBalance(record('c1', 'BTC'))
    upsertBalance(
      record(venueBalanceCredentialKey('c1', 'binance-futures'), 'USDT'),
    )
    upsertBalance(record('c1x', 'ETH'))
    clearBalancesForCredential('c1')
    expect(getBalances().map((b) => b.credentialId)).toEqual(['c1x'])
    clearBalancesForCredential('c1x')
  })
})

describe('the provisioning effect', () => {
  const provider = readFileSync(
    join(import.meta.dir, '..', '..', 'market-data-provider.tsx'),
    'utf8',
  )

  test('slots are tracked per (credential, plugin), not per credential', () => {
    // Flat, deactivating the futures connector tore down the spot sibling's
    // order and balance sockets too, and nothing re-wired them.
    expect(provider).toContain('new Map<string, Map<string, ProvisionSlot>>()')
    expect(provider).toMatch(/teardownPlugin\(credId, pluginId\)/)
  })

  test('the unsub list is per slot, so a re-provision cannot accumulate', () => {
    // Two rapid credential edits used to leave the first edit's subscription
    // live alongside the second's.
    expect(provider).toContain('slot.unsubs.push(...unsubs)')
    expect(provider).not.toContain('credentialUnsubsRef')
  })

  test('the dead alias disjunct is gone', () => {
    // `getInstalledPlugins` includes deactivated plugins, so the primary-id
    // half of the old match was unreachable.
    expect(provider).not.toContain('`${cred.market}-market-connector` ===')
  })

  test('an aliased venue with no sandbox is skipped in paper mode', () => {
    // Provisioning it anyway pointed a paper-labelled credential at the
    // venue's PRODUCTION host.
    expect(provider).toMatch(
      /aliased &&\s*cred\.mode === 'paper' &&\s*plugin\.manifest\.metadata\?\.\['paperTrading'\] === false/,
    )
  })

  test('the position cap measures against the venue-scoped portfolio', () => {
    // The bare id reads a futures-only account as a portfolio of zero, and a
    // zero denominator disables the cap.
    expect(provider).toContain('balanceScopeFor(credentialId, market)')
  })

  test('the guard resolves a contract size the caller did not send', () => {
    // Copilot and bot orders arrive hintless.
    expect(provider).toContain('contractSizeFor(market, pair)')
  })
})
