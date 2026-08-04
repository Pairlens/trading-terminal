// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The lock and the vault are two states sharing one password, and the places
 * where they touch are where this feature can lock a user out of their own
 * keys. Each test here is one of those contact points, written as an
 * executable rule rather than a comment somebody can drift away from.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from '../vault/__tests__/test-globals'

const storage = installBrowserGlobals()

const { setLockEnabled, updateLockTriggers } = await import('../lock-config')
const { requireUnlockForTrade, clearAttempts, lockNow, unlockNow } =
  await import('../lock-store')
const {
  __resetVaultSessionForTests,
  setDek,
  setVaultRecord,
  isVaultEnrolled,
  isVaultUnlocked,
} = await import('../vault/vault-session')
const { VAULT_RECORD_VERSION } = await import('../vault/vault-record')
const { vaultRequiredForNewCredentials, mustEnrollFirst } =
  await import('../vault/vault-policy')

async function fakeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

function record(kind: 'password' | 'passkey' = 'password') {
  return {
    v: VAULT_RECORD_VERSION as 1,
    state: 'ready' as const,
    revision: 1,
    prfSalt: 'c2FsdA==',
    webauthnUserId: 'dXNlcg==',
    createdAt: 1,
    protectors: [
      kind === 'password'
        ? {
            id: 'p1',
            type: 'password' as const,
            createdAt: 1,
            label: 'Password',
            kdf: 'PBKDF2-SHA256' as const,
            iterations: 1000,
            salt: 'c2FsdA==',
            iv: 'aXY=',
            wrapped: 'dw==',
          }
        : {
            id: 'k1',
            type: 'passkey' as const,
            createdAt: 1,
            label: 'Passkey',
            credentialId: 'Y3JlZA==',
            salt: 'c2FsdA==',
            iv: 'aXY=',
            wrapped: 'dw==',
          },
    ],
  }
}

beforeEach(() => {
  storage.clear()
  __resetVaultSessionForTests()
  clearAttempts(false)
  unlockNow()
  setLockEnabled(false)
})

afterEach(() => {
  __resetVaultSessionForTests()
  setLockEnabled(false)
})

describe('requireUnlockForTrade gains a vault precondition', () => {
  test('a sealed vault blocks interactive trading even with the lock off', async () => {
    setVaultRecord(record(), { broadcast: false })
    expect(isVaultEnrolled()).toBe(true)
    expect(isVaultUnlocked()).toBe(false)

    // The lock is OFF, so the old implementation resolved `true` outright.
    // The credential that would sign the order is ciphertext we cannot open,
    // so this has to be a hard no regardless of lock configuration.
    expect(await requireUnlockForTrade()).toBe(false)
  })

  test('an unlocked vault does not change the answer', async () => {
    setVaultRecord(record(), { broadcast: false })
    setDek(await fakeDek(), { broadcast: false })
    expect(await requireUnlockForTrade()).toBe(true)
  })

  test('with no vault at all the lock is still the only gate', async () => {
    expect(await requireUnlockForTrade()).toBe(true)
  })

  test('a sealed vault beats the before-trade grace window', async () => {
    setLockEnabled(true)
    // 15 is a real TRADE_GRACE_OPTIONS value; anything else is sanitized to 0
    // and the grace window silently never opens.
    updateLockTriggers({ beforeTrade: { enabled: true, graceMinutes: 15 } })
    // A real lock→unlock cycle is what stamps `lastVerifiedAt` and opens the
    // grace window; `unlockNow()` on an already-unlocked store is a no-op.
    lockNow('manual')
    unlockNow()
    expect(await requireUnlockForTrade()).toBe(true)
    // …and sealing the vault closes the door anyway.
    setVaultRecord(record(), { broadcast: false })
    expect(await requireUnlockForTrade()).toBe(false)
  })
})

describe('a UI lock never seals the vault', () => {
  test('lockNow leaves the data key alive so automations keep trading', async () => {
    setLockEnabled(true)
    setVaultRecord(record(), { broadcast: false })
    setDek(await fakeDek(), { broadcast: false })

    lockNow('manual')

    // The load-bearing inverse of hardLock: a screen lock that stopped bots
    // would turn "my laptop locked" into "my stop-loss stopped running".
    expect(isVaultUnlocked()).toBe(true)
  })
})

describe('the enrollment policy', () => {
  test('the browser always requires a vault for new credentials', () => {
    // `isStandalone` is false under the test globals — this is the web rule.
    expect(vaultRequiredForNewCredentials(false)).toBe(true)
    expect(vaultRequiredForNewCredentials(true)).toBe(true)
  })

  test('mustEnrollFirst is true on the web with no record', async () => {
    expect(await mustEnrollFirst()).toBe(true)
  })

  test('mustEnrollFirst is false once a record exists', async () => {
    setVaultRecord(record(), { broadcast: false })
    expect(await mustEnrollFirst()).toBe(false)
  })
})
