// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the key comes from.
 *
 * The behaviour under test is an onboarding one: an NFT board has to open for
 * someone who has never made an OpenSea account. What makes it worth pinning is
 * the other half, which is invisible when it works and expensive when it
 * breaks. Key creation is rate limited PER IP, so the ways this can go wrong
 * are "mint twenty times on a cold board", "mint again on every reload" and
 * "ignore a 429 and lose the address entirely". Each of those has a test here,
 * because none of them shows up as a failure in the browser: the board just
 * quietly stops having a key one day.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { replaceRejectedKey, resetAuth, resolveKey, setUserKey } from '../auth'

const STORAGE_KEY = 'pairlens:opensea-auto-key'
const MINT_URL = 'https://api.opensea.io/api/v2/auth/keys'
const DAY_MS = 86_400_000

const realFetch = globalThis.fetch

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

function installStorage(): Storage {
  const store = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
  return store
}

/** A mint endpoint that hands out a new key each call and counts the calls. */
function mintServer(
  responder: (call: number) => Response = (call) =>
    new Response(
      JSON.stringify({
        api_key: `minted-${call}`,
        expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      }),
      { status: 200 },
    ),
) {
  const calls: Array<string> = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url !== MINT_URL) throw new Error(`unexpected request to ${url}`)
    if (init?.method !== 'POST') throw new Error('mint must be a POST')
    calls.push(url)
    return responder(calls.length)
  }) as typeof globalThis.fetch
  return calls
}

let store: Storage

beforeEach(() => {
  store = installStorage()
  resetAuth()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('a user who has never heard of an API key', () => {
  test('gets one minted on the first read', async () => {
    const calls = mintServer()
    expect(await resolveKey()).toBe('minted-1')
    expect(calls).toHaveLength(1)
  })

  test('a cold board of twenty reads mints exactly once', async () => {
    const calls = mintServer()
    const keys = await Promise.all(
      Array.from({ length: 20 }, () => resolveKey()),
    )
    expect(new Set(keys)).toEqual(new Set(['minted-1']))
    // The whole point: creation is IP-rationed, so a board's cold burst must
    // collapse onto one attempt rather than twenty.
    expect(calls).toHaveLength(1)
  })

  test('the key is reused, not re-minted, on later reads', async () => {
    const calls = mintServer()
    await resolveKey()
    await resolveKey()
    await resolveKey()
    expect(calls).toHaveLength(1)
  })

  test('the key outlives the tab', async () => {
    mintServer()
    await resolveKey()
    const persisted = JSON.parse(store.getItem(STORAGE_KEY) ?? '{}')
    expect(persisted.key).toBe('minted-1')
    expect(persisted.expiresAt).toBeGreaterThan(Date.now())
  })

  test('a key an earlier session minted is used without minting again', async () => {
    // A reload: same storage, fresh module state.
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: 'from-yesterday', expiresAt: Date.now() + DAY_MS }),
    )
    const calls = mintServer()
    expect(await resolveKey()).toBe('from-yesterday')
    expect(calls).toHaveLength(0)
  })

  test('a key about to expire is replaced before it dies mid-board', async () => {
    store.setItem(
      STORAGE_KEY,
      // Inside the refresh margin: still valid, not valid for long.
      JSON.stringify({ key: 'nearly-dead', expiresAt: Date.now() + 60_000 }),
    )
    const calls = mintServer()
    expect(await resolveKey()).toBe('minted-1')
    expect(calls).toHaveLength(1)
  })
})

describe('when OpenSea will not issue a key', () => {
  test('a creation throttle backs off instead of retrying', async () => {
    const calls = mintServer(
      () =>
        new Response('{"errors":["Key creation rate limit exceeded."]}', {
          status: 429,
          headers: { 'retry-after': '1251' },
        }),
    )
    expect(await resolveKey()).toBeNull()
    // Hammering a creation limit is how an address loses the endpoint for good.
    expect(await resolveKey()).toBeNull()
    expect(calls).toHaveLength(1)
  })

  test('the cool-off survives a reload', async () => {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ blockedUntil: Date.now() + 600_000 }),
    )
    const calls = mintServer()
    expect(await resolveKey()).toBeNull()
    // A cool-off a refresh clears is not a cool-off, and a refresh is the most
    // likely thing to happen right after a board fails to load.
    expect(calls).toHaveLength(0)
  })

  test('a network failure backs off rather than looping', async () => {
    let attempts = 0
    globalThis.fetch = (async () => {
      attempts += 1
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof globalThis.fetch
    expect(await resolveKey()).toBeNull()
    expect(await resolveKey()).toBeNull()
    expect(attempts).toBe(1)
  })

  test('a malformed answer is not mistaken for a key', async () => {
    mintServer(() => new Response('{"ok":true}', { status: 200 }))
    expect(await resolveKey()).toBeNull()
  })
})

describe('the user brings their own key', () => {
  test('it wins, and nothing is minted', async () => {
    const calls = mintServer()
    setUserKey('user-key')
    expect(await resolveKey()).toBe('user-key')
    expect(calls).toHaveLength(0)
  })

  test('clearing it falls back to a minted one', async () => {
    const calls = mintServer()
    setUserKey('user-key')
    await resolveKey()
    setUserKey(undefined)
    expect(await resolveKey()).toBe('minted-1')
    expect(calls).toHaveLength(1)
  })

  test('blank is the same as absent', async () => {
    mintServer()
    setUserKey('   ')
    expect(await resolveKey()).toBe('minted-1')
  })
})

describe('a key that stopped working', () => {
  test("the user's rejected key falls back to a minted one", async () => {
    mintServer()
    setUserKey('revoked')
    expect(await resolveKey()).toBe('revoked')
    expect(await replaceRejectedKey('revoked')).toBe('minted-1')
    // And it stays fallen back: re-offering a key we know is dead spends a
    // request to learn the same thing again.
    expect(await resolveKey()).toBe('minted-1')
  })

  test('editing the field gives the new key a fresh try', async () => {
    mintServer()
    setUserKey('revoked')
    await replaceRejectedKey('revoked')
    setUserKey('a-good-one')
    expect(await resolveKey()).toBe('a-good-one')
  })

  test('a rejected key from an earlier session is replaced', async () => {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: 'last-week', expiresAt: Date.now() + DAY_MS }),
    )
    const calls = mintServer()
    expect(await resolveKey()).toBe('last-week')
    expect(await replaceRejectedKey('last-week')).toBe('minted-1')
    expect(calls).toHaveLength(1)
  })

  test('a key rejected moments after minting does not mint another', async () => {
    const calls = mintServer()
    expect(await resolveKey()).toBe('minted-1')
    // A board arrives in waves, and single flight only collapses the wave in
    // flight together. Without a floor between mints, every later wave that is
    // rejected mints again: three keys in eighteen seconds, measured in the
    // browser, against a budget of two a day.
    expect(await replaceRejectedKey('minted-1')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  test('two mints in a rolling day is the ceiling', async () => {
    const now = Date.now()
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ mints: [now - 90_000, now - 3_600_000] }),
    )
    const calls = mintServer()
    // The venue's own cap, enforced on our side so a loop is stopped before it
    // reaches them and burns the address for the rest of the day.
    expect(await resolveKey()).toBeNull()
    expect(calls).toHaveLength(0)
  })

  test('a mint that succeeded yesterday does not count against today', async () => {
    const now = Date.now()
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ mints: [now - 2 * DAY_MS, now - 3 * DAY_MS] }),
    )
    const calls = mintServer()
    expect(await resolveKey()).toBe('minted-1')
    expect(calls).toHaveLength(1)
  })

  test('there is no replacement to offer when minting is blocked', async () => {
    mintServer(
      () =>
        new Response('nope', {
          status: 429,
          headers: { 'retry-after': '600' },
        }),
    )
    setUserKey('revoked')
    // Null is what the connector turns into its typed "add a key" refusal, and
    // it must never be the same key that was just rejected.
    expect(await replaceRejectedKey('revoked')).toBeNull()
  })
})
