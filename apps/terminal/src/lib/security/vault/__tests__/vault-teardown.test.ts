// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Desktop opt-out ordering.
 *
 * There is no transaction across N keychain writes, so the ordering IS the
 * guarantee: every value lands as plaintext and is read back to prove it,
 * and only then is the wrapped-DEK record deleted. A crash before that point
 * has to leave a state the app still reads correctly and the operation can
 * simply be re-run from.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

installBrowserGlobals()

// `mock.module` is process-global in bun and leaks into every later test file
// in the same run, so the real modules are captured up front and restored in
// `afterAll`. Restore with a SPREAD object — handing back the namespace
// itself silently does nothing, and the leaked stub then makes downstream
// security assertions pass vacuously.
const realPlatform = { ...(await import('@/lib/platform')) }
const realKeychain = { ...(await import('@/lib/keychain')) }
const realStorage = { ...(await import('../vault-storage')) }

afterAll(() => {
  mock.module('@/lib/platform', () => realPlatform)
  mock.module('@/lib/keychain', () => realKeychain)
  mock.module('../vault-storage', () => realStorage)
})

// Desktop is the only platform this runs on.
mock.module('@/lib/platform', () => ({ isStandalone: true }))

/** Fake keychain: the slot name → exactly what is on disk. */
let slots = new Map<string, string>()
/** Keys whose write should fail, to exercise the abort path. */
let failWrites = new Set<string>()
/** Keys whose read-back should lie, to exercise the verification path. */
let dropWrites = new Set<string>()

mock.module('@/lib/keychain', () => ({
  ...realKeychain,
  KEYCHAIN_STORAGE_PREFIX: 'pairlens:keychain:',
  readStoredValue: async (key: string) => slots.get(key) ?? null,
  writeStoredValue: async (key: string, stored: string) => {
    if (failWrites.has(key)) throw new Error('keychain refused the write')
    if (dropWrites.has(key)) return
    slots.set(key, stored)
  },
  // Stands in for the vault value layer: `enc.v2.` values decrypt to their
  // suffix, plaintext passes through, which is exactly the desktop contract.
  getCredential: async (key: string) => {
    const stored = slots.get(key)
    if (stored === undefined) return null
    return stored.startsWith('enc.v2.')
      ? stored.slice('enc.v2.'.length)
      : stored
  },
}))

const record = {
  v: 1 as const,
  state: 'ready' as const,
  revision: 1,
  prfSalt: 'c2FsdA==',
  webauthnUserId: 'dXNlcg==',
  createdAt: 1,
  protectors: [
    {
      id: 'p1',
      type: 'password' as const,
      createdAt: 1,
      label: 'Password',
      kdf: 'PBKDF2-SHA256' as const,
      iterations: 1000,
      salt: 'c2FsdA==',
      iv: 'aXY=',
      wrapped: 'dw==',
    },
  ],
}

let deletedRecord = false
// Only `deleteVaultRecord` is replaced; the rest of the surface has to keep
// working because `vault-session` imports from here too.
mock.module('../vault-storage', () => ({
  ...realStorage,
  deleteVaultRecord: async () => {
    deletedRecord = true
  },
}))

const session = await import('../vault-session')
const { disableVault, listVaultedKeys } = await import('../vault-teardown')

async function fakeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

function seedVaultedDevice(): void {
  slots = new Map([
    ['pairlens:credentials-index', 'enc.v2.["abc"]'],
    ['cred:abc', 'enc.v2.{"id":"abc"}'],
    ['pairlens:wallets-index', 'enc.v2.["w1"]'],
    ['wallet:w1', 'enc.v2.{"id":"w1"}'],
    ['wallet:w1:secret', 'enc.v2.PRIVATE-KEY'],
  ])
}

beforeEach(async () => {
  failWrites = new Set()
  dropWrites = new Set()
  deletedRecord = false
  seedVaultedDevice()
  session.__resetVaultSessionForTests()
  session.setVaultRecord(record, { broadcast: false })
  session.setDek(await fakeDek(), { broadcast: false, proven: true })
})

describe('listVaultedKeys on desktop', () => {
  test('enumerates from the indexes — the only listing the keychain allows', async () => {
    expect(await listVaultedKeys()).toEqual([
      'pairlens:credentials-index',
      'cred:abc',
      'pairlens:wallets-index',
      'wallet:w1',
      'wallet:w1:secret',
    ])
  })
})

describe('disableVault', () => {
  test('every value comes back as plaintext and the record goes last', async () => {
    const result = await disableVault()

    expect(result.restored).toBe(5)
    expect(slots.get('wallet:w1:secret')).toBe('PRIVATE-KEY')
    expect(slots.get('cred:abc')).toBe('{"id":"abc"}')
    expect([...slots.values()].some((v) => v.startsWith('enc.v2.'))).toBe(false)
    expect(deletedRecord).toBe(true)
    expect(session.isVaultEnrolled()).toBe(false)
    expect(session.isVaultUnlocked()).toBe(false)
  })

  test('refuses while sealed — nothing to decrypt with, nothing to enumerate', async () => {
    session.sealVault({ broadcast: false })
    await expect(disableVault()).rejects.toThrow()
    expect(deletedRecord).toBe(false)
    // Untouched.
    expect(slots.get('wallet:w1:secret')).toBe('enc.v2.PRIVATE-KEY')
  })

  test('a failed write aborts BEFORE the record is deleted', async () => {
    failWrites.add('wallet:w1:secret')
    await expect(disableVault()).rejects.toThrow()
    // The record surviving is what makes the half-done state recoverable:
    // the remaining enc.v2 values are still openable.
    expect(deletedRecord).toBe(false)
    expect(slots.get('wallet:w1:secret')).toBe('enc.v2.PRIVATE-KEY')
  })

  test('a write the keychain silently drops is caught by the read-back', async () => {
    dropWrites.add('cred:abc')
    await expect(disableVault()).rejects.toThrow()
    expect(deletedRecord).toBe(false)
  })

  test('re-running after a partial run finishes the job', async () => {
    failWrites.add('wallet:w1:secret')
    await expect(disableVault()).rejects.toThrow()

    failWrites.clear()
    const result = await disableVault()
    // Only the slots still holding ciphertext are rewritten — the ones that
    // already landed as plaintext are skipped, which is what makes this
    // idempotent rather than merely repeatable.
    expect(result.restored).toBeGreaterThan(0)
    expect([...slots.values()].some((v) => v.startsWith('enc.v2.'))).toBe(false)
    expect(deletedRecord).toBe(true)
  })
})
