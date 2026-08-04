// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `lib/keychain.ts` with the vault layer in front of it, against the real
 * module and real storage (a fake localStorage).
 *
 * The regression that matters most is in the second block: a sealed vault
 * must THROW, never resolve `null`. Callers all over the app treat absence as
 * permission to self-heal — the terminal lock disables itself, the Accounts
 * page renders its empty hero, a live bot decides it has no credential — and
 * every one of those would fire against secrets that are still on disk.
 *
 * The browser path is the one under test because that is where the vault is
 * mandatory. The desktop branch differs only in which store the bytes go to
 * (`keychain_set` instead of localStorage); the format decisions below are
 * the same code either way — except for the one place they must differ, which
 * the first block covers: with no vault, desktop writes plaintext to the OS
 * keychain and browser refuses to write at all.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

const { deleteCredential, getCredential, saveCredential } =
  await import('@/lib/keychain')
const { CIPHER_V2, generateRawDek, importDek, randomBytes, toBase64 } =
  await import('../vault-crypto')
const { VaultEnrollmentRequiredError, VaultSealedError } =
  await import('../vault-errors')
const { __resetVaultSessionForTests, sealVault, setDek, setVaultRecord } =
  await import('../vault-session')
const { LOCK_VERIFIER_KEY } = await import('../../keys')

const SLOT = 'pairlens:keychain:'

const record = {
  v: 1 as const,
  state: 'ready' as const,
  revision: 1,
  prfSalt: toBase64(randomBytes(32)),
  webauthnUserId: toBase64(randomBytes(32)),
  createdAt: 1,
  protectors: [
    {
      id: 'p1',
      type: 'password' as const,
      createdAt: 1,
      label: 'Password',
      kdf: 'PBKDF2-SHA256' as const,
      iterations: 1_000,
      salt: 'c2FsdA==',
      iv: 'aXY=',
      wrapped: 'dw==',
    },
  ],
}

async function enrollAndUnlock(): Promise<void> {
  setVaultRecord(record, { broadcast: false })
  setDek(await importDek(generateRawDek()), { broadcast: false })
}

beforeEach(() => {
  storage.clear()
  __resetVaultSessionForTests()
})

describe('with no vault, on browser', () => {
  test('a credential write refuses rather than landing unencrypted', async () => {
    setVaultRecord(null, { broadcast: false })
    // vault-policy already gates this at the store, so reaching here means the
    // gate was bypassed. Writing plaintext anyway is the exact outcome the
    // policy exists to prevent — say so instead, and let the caller open
    // enrollment and retry (accounts-page does).
    await expect(
      saveCredential('cred:okx', 'sk-live-1'),
    ).rejects.toBeInstanceOf(VaultEnrollmentRequiredError)
    expect(storage.getItem(`${SLOT}cred:okx`)).toBeNull()
  })

  test('an absent key is null, which is the one honest null', async () => {
    setVaultRecord(null, { broadcast: false })
    expect(await getCredential('cred:nothing')).toBeNull()
  })

  test('an un-prefixed value was not written by us and is not trusted', async () => {
    setVaultRecord(null, { broadcast: false })
    // Anyone who can write localStorage could otherwise plant a credential
    // here and have a connector pick it up as real.
    storage.setItem(`${SLOT}cred:planted`, 'sk-attacker')
    expect(await getCredential('cred:planted')).toBeNull()
  })

  test('the lock verifier round-trips as plaintext', async () => {
    setVaultRecord(null, { broadcast: false })
    await saveCredential(LOCK_VERIFIER_KEY, '{"v":1}')
    expect(storage.getItem(`${SLOT}${LOCK_VERIFIER_KEY}`)).toBe('{"v":1}')
    expect(await getCredential(LOCK_VERIFIER_KEY)).toBe('{"v":1}')
  })

  test('delete removes the verifier', async () => {
    setVaultRecord(null, { broadcast: false })
    await saveCredential(LOCK_VERIFIER_KEY, '{"v":1}')
    await deleteCredential(LOCK_VERIFIER_KEY)
    expect(await getCredential(LOCK_VERIFIER_KEY)).toBeNull()
  })
})

describe('with an enrolled vault', () => {
  test('writes enc.v2 and reads it back while unlocked', async () => {
    await enrollAndUnlock()
    await saveCredential('cred:okx', 'sk-live-1')

    const stored = storage.getItem(`${SLOT}cred:okx`)!
    expect(stored.startsWith(CIPHER_V2)).toBe(true)
    expect(stored).not.toContain('sk-live-1')
    expect(await getCredential('cred:okx')).toBe('sk-live-1')
  })

  test('a sealed read THROWS — it must never look like an empty account list', async () => {
    await enrollAndUnlock()
    await saveCredential('cred:okx', 'sk-live-1')

    sealVault({ broadcast: false })
    // Spelled out because this is the assertion that protects the user: a
    // resolved null here sends someone to re-enter API keys over a vault they
    // still cannot open.
    await expect(getCredential('cred:okx')).rejects.toBeInstanceOf(
      VaultSealedError,
    )
  })

  test('a sealed write throws rather than downgrading the format', async () => {
    await enrollAndUnlock()
    sealVault({ broadcast: false })
    await expect(
      saveCredential('cred:new', 'sk-live-2'),
    ).rejects.toBeInstanceOf(VaultSealedError)
    expect(storage.getItem(`${SLOT}cred:new`)).toBeNull()
  })

  test('ciphertext without a record still throws, never resolves null', async () => {
    await enrollAndUnlock()
    await saveCredential('cred:okx', 'sk-live-1')
    // The record went missing while its ciphertext stayed — storage damage,
    // not an empty vault.
    __resetVaultSessionForTests()
    setVaultRecord(null, { broadcast: false })
    await expect(getCredential('cred:okx')).rejects.toBeInstanceOf(
      VaultSealedError,
    )
  })

  test('an absent key is still null, even while sealed', async () => {
    await enrollAndUnlock()
    sealVault({ broadcast: false })
    // Nothing stored is nothing stored. Only ciphertext we cannot open throws.
    expect(await getCredential('cred:nothing')).toBeNull()
  })

  test('the lock verifier is exempt and stays answerable while sealed', async () => {
    await enrollAndUnlock()
    await saveCredential(LOCK_VERIFIER_KEY, '{"v":1}')
    // Stored as-is, in the clear, on every platform: the lock screen has to be
    // able to check a password precisely when the vault is closed, and the
    // verifier is a salted PBKDF2 digest with nothing secret in it. This is
    // the assertion that catches an "encrypt everything" refactor turning the
    // lock screen into a prompt that can never be answered.
    expect(storage.getItem(`${SLOT}${LOCK_VERIFIER_KEY}`)).toBe('{"v":1}')

    sealVault({ broadcast: false })
    expect(await getCredential(LOCK_VERIFIER_KEY)).toBe('{"v":1}')
    await saveCredential(LOCK_VERIFIER_KEY, '{"v":1,"rotated":true}')
    expect(await getCredential(LOCK_VERIFIER_KEY)).toBe(
      '{"v":1,"rotated":true}',
    )
  })

  test('values are bound to their slot', async () => {
    await enrollAndUnlock()
    await saveCredential('cred:okx', 'sk-live-1')
    // Someone with write access to storage copies the ciphertext onto another
    // account's slot; the read must fail rather than hand a connector the
    // wrong key.
    storage.setItem(`${SLOT}cred:binance`, storage.getItem(`${SLOT}cred:okx`)!)
    await expect(getCredential('cred:binance')).rejects.toThrow()
  })

  test('undecryptable enc.v2 ciphertext throws instead of reading as absent', async () => {
    await enrollAndUnlock()
    storage.setItem(`${SLOT}cred:broken`, `${CIPHER_V2}notbase64.alsonot`)
    await expect(getCredential('cred:broken')).rejects.toThrow()
  })
})
