// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `lib/keychain.ts` with the vault layer in front of it, against the real
 * module and real storage (a fake localStorage + a fake IndexedDB wide enough
 * for the pre-vault format).
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
 * the same code either way.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals, installFakeIndexedDb } from './test-globals'

const storage = installBrowserGlobals()
installFakeIndexedDb()

const { deleteCredential, getCredential, saveCredential } =
  await import('@/lib/keychain')
const { CIPHER_V2, generateRawDek, importDek, randomBytes, toBase64 } =
  await import('../vault-crypto')
const { VaultSealedError } = await import('../vault-errors')
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

describe('with no vault', () => {
  test('uses the pre-vault format, unchanged', async () => {
    setVaultRecord(null, { broadcast: false })
    await saveCredential('cred:okx', 'sk-live-1')

    const stored = storage.getItem(`${SLOT}cred:okx`)!
    expect(stored.startsWith('enc.v1.')).toBe(true)
    expect(stored).not.toContain('sk-live-1')
    expect(await getCredential('cred:okx')).toBe('sk-live-1')
  })

  test('an absent key is null, which is the one honest null', async () => {
    setVaultRecord(null, { broadcast: false })
    expect(await getCredential('cred:nothing')).toBeNull()
  })

  test('a value with no prefix predates encryption and reads as absent', async () => {
    setVaultRecord(null, { broadcast: false })
    storage.setItem(`${SLOT}cred:ancient`, 'plaintext-from-2024')
    expect(await getCredential('cred:ancient')).toBeNull()
  })

  test('delete removes it', async () => {
    setVaultRecord(null, { broadcast: false })
    await saveCredential('cred:okx', 'sk-live-1')
    await deleteCredential('cred:okx')
    expect(await getCredential('cred:okx')).toBeNull()
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
    // Not vault-encrypted: the lock screen has to be able to check a password
    // precisely when the vault is closed.
    expect(
      storage.getItem(`${SLOT}${LOCK_VERIFIER_KEY}`)?.startsWith(CIPHER_V2),
    ).toBe(false)

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

  test('legacy values stay readable — an interrupted migration is survivable', async () => {
    // Write one value before enrolling, then enroll without migrating it.
    setVaultRecord(null, { broadcast: false })
    await saveCredential('cred:old', 'sk-from-before')

    await enrollAndUnlock()
    await saveCredential('cred:new', 'sk-from-after')

    expect(storage.getItem(`${SLOT}cred:old`)?.startsWith('enc.v1.')).toBe(true)
    expect(storage.getItem(`${SLOT}cred:new`)?.startsWith(CIPHER_V2)).toBe(true)
    // Both formats read. Deleting the v1 branch later would brick exactly this
    // user.
    expect(await getCredential('cred:old')).toBe('sk-from-before')
    expect(await getCredential('cred:new')).toBe('sk-from-after')
  })

  test('undecryptable legacy ciphertext throws instead of reading as absent', async () => {
    setVaultRecord(null, { broadcast: false })
    storage.setItem(`${SLOT}cred:broken`, 'enc.v1.notbase64.alsonot')
    await expect(getCredential('cred:broken')).rejects.toThrow()
  })
})
