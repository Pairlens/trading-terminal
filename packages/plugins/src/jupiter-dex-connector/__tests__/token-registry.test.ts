// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two mint lookups, and the difference that matters.
 *
 * `resolveToken` is the TRADING path: it pins (symbol → mint) for the session
 * and publishes to the process-wide token directory, which is last-write-wins.
 * That is correct when the user picked the token off discovery or search.
 *
 * `lookupTokenByMint` exists because the LP reader labels tokens it found in
 * pools the user never chose. Every Solana ticker is squatted, so pinning from
 * there would let a position in a scam-USDC pool re-point USDC for every later
 * swap, chart and pool lookup in the session. The test below is that exact
 * scenario.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
  clearTokenDirectory,
  lookupToken,
} from '@pairlens/market-engine/token-directory'
import {
  clearTokenCache,
  lookupTokenByMint,
  resolveToken,
} from '../token-registry'

const REAL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const FAKE_USDC = '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  clearTokenCache()
  clearTokenDirectory()
})

/** Jupiter's search endpoint, answering with whatever the test hands it. */
function stubSearch(byQuery: Record<string, Array<unknown>>) {
  const calls: Array<string> = []
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    calls.push(url)
    const query = decodeURIComponent(url.split('query=')[1] ?? '')
    return new Response(JSON.stringify(byQuery[query] ?? []), {
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return calls
}

function token(id: string, symbol: string) {
  return { id, symbol, name: symbol, decimals: 6 }
}

describe('lookupTokenByMint', () => {
  test('returns the token for an exact mint match', async () => {
    stubSearch({ [REAL_USDC]: [token(REAL_USDC, 'USDC')] })
    const result = await lookupTokenByMint(REAL_USDC)
    expect(result?.address).toBe(REAL_USDC)
    expect(result?.symbol).toBe('USDC')
  })

  test('does NOT pin the symbol, so a squatted ticker cannot hijack a swap', async () => {
    // The user pinned the real USDC by trading it.
    stubSearch({
      USDC: [token(REAL_USDC, 'USDC')],
      [FAKE_USDC]: [token(FAKE_USDC, 'USDC')],
    })
    await resolveToken('USDC')
    expect(lookupToken('solana', 'USDC')?.address).toBe(REAL_USDC)

    // An LP position in a pool holding a token that also calls itself USDC.
    const impostor = await lookupTokenByMint(FAKE_USDC)
    expect(impostor?.address).toBe(FAKE_USDC)

    // The binding the swap path reads is untouched. This is the whole test.
    expect(lookupToken('solana', 'USDC')?.address).toBe(REAL_USDC)
    expect((await resolveToken('USDC'))?.address).toBe(REAL_USDC)
  })

  test('refuses a near match rather than labelling the wrong token', async () => {
    // The search ranks by relevance and will happily answer with something
    // else. Only the address asked about counts.
    stubSearch({ [FAKE_USDC]: [token(REAL_USDC, 'USDC')] })
    expect(await lookupTokenByMint(FAKE_USDC)).toBeNull()
  })

  test('caches the miss, so a scam mint is not re-queried every refresh', async () => {
    const calls = stubSearch({})
    await lookupTokenByMint(FAKE_USDC)
    await lookupTokenByMint(FAKE_USDC)
    expect(calls).toHaveLength(1)
  })

  test('never queries for something that is not an address', async () => {
    const calls = stubSearch({ USDC: [token(REAL_USDC, 'USDC')] })
    expect(await lookupTokenByMint('USDC')).toBeNull()
    expect(calls).toEqual([])
  })
})
