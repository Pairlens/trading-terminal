// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The verifier is the one place where getting it wrong is silent: a hash
 * that always matches, or a salt reused across installs, looks exactly like
 * a working lock until someone tries to break it.
 *
 * `verifyPassword` has three outcomes and the difference is load-bearing —
 * `'missing'` self-heals the lock, a *throw* keeps it locked. Both are
 * exercised here.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Stand-in keychain: the real one branches on Tauri vs browser storage,
// neither of which exists in a test process.
const store = new Map<string, string>()
let failNext = false

void mock.module('@/lib/keychain', () => ({
  saveCredential: async (key: string, value: string) => {
    if (failNext) throw new Error('keychain unavailable')
    store.set(key, value)
  },
  getCredential: async (key: string) => {
    if (failNext) throw new Error('keychain unavailable')
    return store.get(key) ?? null
  },
  deleteCredential: async (key: string) => {
    if (failNext) throw new Error('keychain unavailable')
    store.delete(key)
  },
}))

const {
  LOCK_VERIFIER_KEY,
  clearVerifier,
  constantTimeEquals,
  createVerifier,
  parseVerifier,
  saveVerifier,
  verifyPassword,
} = await import('../lock-verifier')

// The shipped cost is 600k iterations (~0.3–0.8s per check). Tests use a
// token count: what is under test is the round trip, not the KDF's price.
const FAST = 1_000

beforeEach(() => {
  store.clear()
  failNext = false
})

describe('createVerifier / verifyPassword', () => {
  test('round trip: the right password verifies, a wrong one does not', async () => {
    await saveVerifier(await createVerifier('correct horse', FAST))
    expect(await verifyPassword('correct horse')).toBe('ok')
    expect(await verifyPassword('Correct horse')).toBe('wrong')
    expect(await verifyPassword('')).toBe('wrong')
  })

  test('the password itself is never stored', async () => {
    const verifier = await createVerifier('hunter2', FAST)
    const serialized = JSON.stringify(verifier)
    expect(serialized).not.toContain('hunter2')
  })

  test('two verifiers for the same password differ (salted)', async () => {
    const a = await createVerifier('same password', FAST)
    const b = await createVerifier('same password', FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  test('iterations travel with the verifier, so the cost can be raised', async () => {
    const verifier = await createVerifier('pw', FAST)
    expect(verifier.iterations).toBe(FAST)
    await saveVerifier(verifier)
    // Verification must use the STORED count, not today's constant.
    expect(await verifyPassword('pw')).toBe('ok')
  })

  test("an absent entry reports 'missing', not 'wrong'", async () => {
    // The caller self-heals on 'missing' (disable the lock) but stays locked
    // on 'wrong' — conflating them would be a bypass.
    expect(await verifyPassword('anything')).toBe('missing')
  })

  test('a corrupt entry is treated as absent', async () => {
    store.set(LOCK_VERIFIER_KEY, '{not json')
    expect(await verifyPassword('anything')).toBe('missing')
    store.set(LOCK_VERIFIER_KEY, JSON.stringify({ v: 2, hash: 'x' }))
    expect(await verifyPassword('anything')).toBe('missing')
  })

  test('a keychain backend failure throws rather than resolving', async () => {
    await saveVerifier(await createVerifier('pw', FAST))
    failNext = true
    // The overlay must be able to tell "nothing stored" from "the keychain
    // is down" — the second one keeps the terminal locked.
    expect(verifyPassword('pw')).rejects.toThrow()
  })

  test('clearVerifier removes it', async () => {
    await saveVerifier(await createVerifier('pw', FAST))
    expect(await verifyPassword('pw')).toBe('ok')
    await clearVerifier()
    expect(await verifyPassword('pw')).toBe('missing')
  })
})

describe('parseVerifier', () => {
  test('rejects anything that is not a v1 PBKDF2 record', () => {
    expect(parseVerifier(null)).toBeNull()
    expect(parseVerifier('')).toBeNull()
    expect(parseVerifier('{}')).toBeNull()
    expect(
      parseVerifier(
        JSON.stringify({
          v: 1,
          kdf: 'md5',
          salt: 'a',
          hash: 'b',
          iterations: 1,
        }),
      ),
    ).toBeNull()
    expect(
      parseVerifier(
        JSON.stringify({
          v: 1,
          kdf: 'PBKDF2-SHA256',
          salt: 'a',
          hash: 'b',
          iterations: 0,
        }),
      ),
    ).toBeNull()
  })
})

describe('constantTimeEquals', () => {
  test('matches only identical byte strings', () => {
    expect(
      constantTimeEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
    ).toBe(true)
    expect(
      constantTimeEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])),
    ).toBe(false)
    // A prefix must not pass — the length check comes first.
    expect(
      constantTimeEquals(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])),
    ).toBe(false)
  })
})
