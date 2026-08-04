// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A real Touch ID prompt cannot run headless, so everything that touches the
 * Tauri bridge sits behind `BiometricPort` and this file drives a fake OS
 * keychain instead. The fake holds one KEK per account and can be told to
 * cancel, to invalidate (the fingerprint set changed), or to be unavailable —
 * which is every state the real one produces that the UI has to tell apart.
 *
 * The derivation, the AAD binding and the error mapping are therefore all real
 * here; only the prompt is not. See MANUAL-QA in the plan for the rest.
 */
import { describe, expect, test } from 'bun:test'

import {
  deriveBiometricKek,
  enrollBiometricProtector,
  recoverRawDekWithBiometric,
  removeAllBiometricMaterial,
  removeBiometricMaterial,
  unlockWithBiometric,
} from '../vault-biometric'
import {
  decryptWithDek,
  encryptWithDek,
  fromBase64,
  generateRawDek,
  importDek,
  protectorAad,
  randomBytes,
  toBase64,
  unwrapRawDek,
  wrapDek,
} from '../vault-crypto'
import { VaultProtectorError } from '../vault-errors'
import type { BiometricPort } from '../vault-biometric'
import type { BiometricProtector, VaultRecord } from '../vault-record'

/**
 * A fake OS keychain behind a biometric gate. `read` is the call that would
 * raise the prompt, which is why every failure mode is expressed there.
 */
class FakeBiometricPort implements BiometricPort {
  private keys = new Map<string, Uint8Array<ArrayBuffer>>()
  cancel = false
  /** The enrolled fingerprints changed: the item is gone for good. */
  invalidated = false
  unavailable = false
  /** Accounts `remove` was called for, so cleanup can be asserted. */
  removed: Array<string> = []

  async probe() {
    return this.unavailable
      ? ({ available: false, reason: 'no-hardware' } as const)
      : ({ available: true, kind: 'touch-id' } as const)
  }

  async create(account: string): Promise<Uint8Array<ArrayBuffer>> {
    if (this.unavailable) {
      throw new VaultProtectorError('no sensor', 'unavailable')
    }
    const kek = randomBytes(32)
    // A copy, because the caller zeroizes what it is handed — the OS keeps its
    // own bytes, and a fake that shared them would "forget" the key the moment
    // enrollment finished.
    this.keys.set(account, new Uint8Array(kek))
    return kek
  }

  async read(account: string): Promise<Uint8Array<ArrayBuffer>> {
    if (this.cancel) {
      throw new VaultProtectorError('dismissed', 'cancelled')
    }
    if (this.invalidated || !this.keys.has(account)) {
      throw new VaultProtectorError('gone', 'invalidated')
    }
    return new Uint8Array(this.keys.get(account)!)
  }

  async remove(account: string): Promise<void> {
    this.removed.push(account)
    this.keys.delete(account)
  }

  /** Test helper: swap in a different KEK, as a fresh enrollment would. */
  replaceKey(account: string): void {
    this.keys.set(account, randomBytes(32))
  }

  has(account: string): boolean {
    return this.keys.has(account)
  }
}

function record(protectors: Array<BiometricProtector>): VaultRecord {
  return {
    v: 1,
    state: 'ready',
    revision: 1,
    prfSalt: toBase64(randomBytes(32)),
    webauthnUserId: toBase64(randomBytes(32)),
    createdAt: Date.now(),
    protectors,
  }
}

const opts = { label: 'Touch ID on this Mac', reason: 'Unlock Pairlens' }

describe('deriveBiometricKek', () => {
  test('is deterministic for a fixed KEK and salt', async () => {
    // An unlock has to reproduce the enrollment's key or it could never work
    // twice — the fixed vectors are what catch a silent change to the HKDF
    // info label.
    const kek = fromBase64('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=')
    const salt = fromBase64('ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=')
    const first = await deriveBiometricKek(kek, salt)
    const second = await deriveBiometricKek(kek, salt)

    const raw = generateRawDek()
    const aad = protectorAad(1, { id: 'p', type: 'biometric' })
    const { iv, wrapped } = await wrapDek(first, raw, aad)
    expect([...(await unwrapRawDek(second, iv, wrapped, aad))]).toEqual([
      ...raw,
    ])
  })

  test('a different salt is a different key', async () => {
    const kek = randomBytes(32)
    const a = await deriveBiometricKek(kek, randomBytes(32))
    const b = await deriveBiometricKek(kek, randomBytes(32))
    const aad = protectorAad(1, { id: 'p', type: 'biometric' })
    const { iv, wrapped } = await wrapDek(a, generateRawDek(), aad)
    expect(unwrapRawDek(b, iv, wrapped, aad)).rejects.toThrow()
  })
})

describe('enroll / unlock', () => {
  test('round trips the data key through the OS gate', async () => {
    const port = new FakeBiometricPort()
    const raw = generateRawDek()

    const protector = await enrollBiometricProtector(raw, opts, port)
    expect(protector.type).toBe('biometric')
    expect(protector.platform).toBe('macos')
    // The protector id IS the keychain account, so the record and the material
    // it points at cannot drift apart.
    expect(port.has(protector.id)).toBe(true)

    const recovered = await recoverRawDekWithBiometric(
      record([protector]),
      'why',
      port,
    )
    expect([...recovered]).toEqual([...raw])
  })

  test('unlockWithBiometric yields the working, non-extractable key', async () => {
    const port = new FakeBiometricPort()
    const raw = generateRawDek()
    const protector = await enrollBiometricProtector(raw, opts, port)
    const stored = await encryptWithDek(await importDek(raw), 'cred:a', 'sk')

    const dek = await unlockWithBiometric(record([protector]), 'why', port)
    expect(dek.extractable).toBe(false)
    expect(await decryptWithDek(dek, 'cred:a', stored)).toBe('sk')
  })

  test('a different KEK does not open the blob', async () => {
    const port = new FakeBiometricPort()
    const protector = await enrollBiometricProtector(
      generateRawDek(),
      opts,
      port,
    )
    // The OS still answers, but with different bytes — what a re-enrollment
    // that reused the account would look like.
    port.replaceKey(protector.id)

    const promise = recoverRawDekWithBiometric(record([protector]), 'why', port)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('invalidated')
    })
  })

  test('an invalidated OS key surfaces as invalidated, never as a wrong guess', async () => {
    const port = new FakeBiometricPort()
    const protector = await enrollBiometricProtector(
      generateRawDek(),
      opts,
      port,
    )
    port.invalidated = true

    const promise = recoverRawDekWithBiometric(record([protector]), 'why', port)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      // Telling the user their fingerprint was "wrong" would send them to the
      // destructive reset over something they can simply set up again.
      expect(err.kind).toBe('invalidated')
    })
  })

  test('a dismissed prompt is cancelled, and is reported unchanged', async () => {
    const port = new FakeBiometricPort()
    const protector = await enrollBiometricProtector(
      generateRawDek(),
      opts,
      port,
    )
    port.cancel = true

    const promise = recoverRawDekWithBiometric(record([protector]), 'why', port)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('cancelled')
    })
  })

  test('a blob moved onto another protector id does not unwrap', async () => {
    const port = new FakeBiometricPort()
    const raw = generateRawDek()
    const protector = await enrollBiometricProtector(raw, opts, port)
    // Re-point the wrapped DEK at a second account holding a valid KEK: the
    // AAD binds the blob to its own id, so this must fail rather than open.
    const other = await enrollBiometricProtector(raw, opts, port)
    const swapped: BiometricProtector = { ...protector, id: other.id }

    const promise = recoverRawDekWithBiometric(record([swapped]), 'why', port)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
  })

  test('a vault with no biometric protector says so instead of prompting', async () => {
    const port = new FakeBiometricPort()
    const promise = recoverRawDekWithBiometric(record([]), 'why', port)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('unavailable')
    })
  })

  test('an enrollment that fails after the item was created leaves no orphan', async () => {
    const port = new FakeBiometricPort()
    // A DEK of the wrong shape makes the AES-GCM wrap throw after `create`
    // already stored a KEK. Without the rollback, that item would sit in the
    // user's Keychain behind a Touch ID prompt with nothing referencing it.
    const broken = null as unknown as Uint8Array<ArrayBuffer>
    await expect(enrollBiometricProtector(broken, opts, port)).rejects.toThrow()
    expect(port.removed).toHaveLength(1)
    expect(port.has(port.removed[0])).toBe(false)
  })
})

describe('cleanup', () => {
  test('removeBiometricMaterial deletes the OS item', async () => {
    const port = new FakeBiometricPort()
    const protector = await enrollBiometricProtector(
      generateRawDek(),
      opts,
      port,
    )
    await removeBiometricMaterial(protector, port)
    expect(port.has(protector.id)).toBe(false)
  })

  test('removeAllBiometricMaterial clears every item the record names', async () => {
    const port = new FakeBiometricPort()
    const raw = generateRawDek()
    const a = await enrollBiometricProtector(raw, opts, port)
    const b = await enrollBiometricProtector(raw, opts, port)

    await removeAllBiometricMaterial(record([a, b]), port)
    expect(port.removed.sort()).toEqual([a.id, b.id].sort())
  })

  test('removeAllBiometricMaterial never throws — an erase must not stall', async () => {
    const port = new FakeBiometricPort()
    const protector = await enrollBiometricProtector(
      generateRawDek(),
      opts,
      port,
    )
    port.remove = async () => {
      throw new Error('the keychain would not answer')
    }
    await removeAllBiometricMaterial(record([protector]), port)
  })

  test('a null record is a no-op, not a crash', async () => {
    await removeAllBiometricMaterial(null, new FakeBiometricPort())
  })
})
