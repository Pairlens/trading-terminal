// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bypass this module exists to close.
 *
 * The lock verifier is a plaintext PBKDF2 digest in localStorage, and both
 * lock surfaces used to treat "no verifier" as a reason to let the user in and
 * turn the lock off. Deleting one file walked past the screen; planting one
 * walked past it with a password of your choosing. Neither is fixable where
 * the verifier lives, so the fix was to stop asking it whenever a vault
 * password protector exists and unwrap the data key instead.
 *
 * These tests are the rule, so they are written as the attack: delete it,
 * forge it, and assert the door stays shut.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

const verifierStore = new Map<string, string>()

// `mock.module` is process-global and bun shares one process across test
// files, so the real modules go back afterwards — otherwise every later file
// runs against these stubs. Same reasoning as lock-verifier.test.ts.
const realKeychain = { ...(await import('@/lib/keychain')) }
const realSession = { ...(await import('../vault/vault-session')) }
const realProtectors = { ...(await import('../vault/vault-protectors')) }
const realStore = { ...(await import('../lock-store')) }
afterAll(() => {
  void mock.module('@/lib/keychain', () => realKeychain)
  void mock.module('@/lib/security/vault/vault-session', () => realSession)
  void mock.module(
    '@/lib/security/vault/vault-protectors',
    () => realProtectors,
  )
  void mock.module('@/lib/security/lock-store', () => realStore)
})

void mock.module('@/lib/keychain', () => ({
  saveCredential: async (k: string, v: string) => void verifierStore.set(k, v),
  getCredential: async (k: string) => verifierStore.get(k) ?? null,
  deleteCredential: async (k: string) => void verifierStore.delete(k),
}))

let vaultHasPassword = false
void mock.module('@/lib/security/vault/vault-session', () => ({
  ...realSession,
  hasPasswordProtector: async () => vaultHasPassword,
}))

/** The real vault password, known only to the fake unwrap below. */
const VAULT_PASSWORD = 'the real one'
let unlockCalls = 0
/** Set to simulate the storage backend itself being unreachable. */
let vaultBackendDown = false
void mock.module('@/lib/security/vault/vault-protectors', () => ({
  ...realProtectors,
  unlockVault: async (input: { kind: string; password?: string }) => {
    unlockCalls++
    const { VaultProtectorError } = realErrors
    if (vaultBackendDown) {
      throw new VaultProtectorError('storage gone', 'unavailable')
    }
    if (input.password !== VAULT_PASSWORD) {
      // The vault records this attempt itself, which is why the caller
      // must not (see the counting test below).
      recorded++
      throw new VaultProtectorError('wrong', 'wrong-password')
    }
  },
}))

let recorded = 0
void mock.module('@/lib/security/lock-store', () => ({
  ...realStore,
  recordFailedAttempt: () => void recorded++,
}))

const realErrors = await import('../vault/vault-errors')
const { attemptLockUnlock } = await import('../lock-unlock')
const { createVerifier, saveVerifier } = await import('../lock-verifier')

const FAST = 1_000

beforeEach(() => {
  verifierStore.clear()
  vaultHasPassword = false
  vaultBackendDown = false
  unlockCalls = 0
  recorded = 0
})

describe('with a vault password protector, the vault is the only authority', () => {
  test('a deleted verifier no longer opens the lock', async () => {
    vaultHasPassword = true
    // Nothing in the verifier store at all: the exact state that used to
    // resolve to 'missing' and unlock unconditionally.
    expect(verifierStore.size).toBe(0)

    expect(await attemptLockUnlock('anything')).toBe('wrong')
    expect(await attemptLockUnlock(VAULT_PASSWORD)).toBe('ok')
    // The unwrap is what answered, not a lookup that found nothing.
    expect(unlockCalls).toBe(2)
  })

  test('a planted verifier does not make its password work', async () => {
    vaultHasPassword = true
    // The attacker writes a verifier for a password they chose.
    await saveVerifier(await createVerifier('attacker picked', FAST))

    expect(await attemptLockUnlock('attacker picked')).toBe('wrong')
    // And the real password still works, planted verifier or not.
    expect(await attemptLockUnlock(VAULT_PASSWORD)).toBe('ok')
  })

  test('a backend failure stays locked rather than falling through', async () => {
    vaultHasPassword = true
    vaultBackendDown = true
    // Not 'wrong' and not 'missing': the caller must show a retry and keep
    // the screen up, never fall through to the verifier.
    expect(attemptLockUnlock('whatever')).rejects.toThrow()
  })
})

describe('without one, the verifier is still all there is', () => {
  test('a correct password opens it', async () => {
    await saveVerifier(await createVerifier('screen only', FAST))
    expect(await attemptLockUnlock('screen only')).toBe('ok')
    // The vault was never consulted: there is no password protector to ask.
    expect(unlockCalls).toBe(0)
  })

  test('a wrong password is wrong', async () => {
    await saveVerifier(await createVerifier('screen only', FAST))
    expect(await attemptLockUnlock('nope')).toBe('wrong')
  })

  // Kept deliberately. Anyone who can delete the slot already owns the
  // account, and there are no vault keys behind this door to lose — bricking
  // the app to spite them is the worse trade.
  test('a deleted verifier still self-heals', async () => {
    expect(await attemptLockUnlock('anything')).toBe('missing')
  })
})

/**
 * One counter, shared with the vault's own prompts. The two paths behind
 * `attemptLockUnlock` count differently — `recoverRawDek` records inside the
 * vault, `verifyPassword` records nothing — so the module owns the
 * bookkeeping and callers must not add their own.
 */
describe('a wrong password is counted exactly once', () => {
  test('on the vault path', async () => {
    vaultHasPassword = true
    await attemptLockUnlock('wrong')
    expect(recorded).toBe(1)
  })

  test('on the verifier path', async () => {
    await saveVerifier(await createVerifier('screen only', FAST))
    await attemptLockUnlock('wrong')
    expect(recorded).toBe(1)
  })
})

/**
 * The rule that drifts if nobody pins it: a lock surface reaching for
 * `verifyPassword` again reopens the door, and it would look perfectly
 * reasonable in review.
 */
describe('no lock surface talks to the verifier directly', () => {
  const SURFACES = ['components/security/terminal-lock.tsx']

  for (const surface of SURFACES) {
    const src = readFileSync(
      join(import.meta.dir, '..', '..', '..', surface),
      'utf8',
    )

    test(`${surface} goes through attemptLockUnlock`, () => {
      expect(src).toContain('attemptLockUnlock')
      expect(src).not.toContain('lock-verifier')
    })

    test(`${surface} does its own attempt bookkeeping nowhere`, () => {
      expect(src).not.toContain('recordFailedAttempt')
    })
  }

  // Settings still owns the verifier: writing one on enrollment and rotating
  // it on a password change are exactly what it is for. Only ANSWERING a lock
  // screen with it moved.
  test('settings still writes it', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '..',
        '..',
        '..',
        'components/settings/security-section.tsx',
      ),
      'utf8',
    )
    expect(src).toContain('saveVerifier')
  })
})
