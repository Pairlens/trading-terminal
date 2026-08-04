// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * WebAuthn cannot run headless, so everything that touches
 * `navigator.credentials` sits behind `PasskeyPrfPort` and this file drives a
 * fake authenticator instead. The fake is an HMAC over (credential key, salt)
 * — which is what PRF actually is — so the derivation, the credential
 * matching and the per-authenticator secret separation are all real; only the
 * platform prompt is not.
 */
import { describe, expect, test } from 'bun:test'

import {
  derivePasskeyKek,
  enrollPasskeyProtector,
  newVaultIdentity,
  recoverRawDekWithPasskey,
  unlockWithPasskey,
} from '../vault-passkey'
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
import type {
  PasskeyAssertRequest,
  PasskeyCreateRequest,
  PasskeyPrfPort,
  VaultIdentity,
} from '../vault-passkey'
import type { VaultProtector, VaultRecord } from '../vault-record'

/**
 * A fake authenticator. Each credential owns a random HMAC key; the PRF
 * output is HMAC(credentialKey, salt), which is exactly the shape the real
 * extension guarantees — deterministic per (credential, salt), and different
 * across credentials for the same salt.
 */
class FakeAuthenticator implements PasskeyPrfPort {
  private keys = new Map<string, Uint8Array<ArrayBuffer>>()
  /** Credentials this authenticator will answer for. */
  present = new Set<string>()
  cancelOnAssert = false
  prfUnsupported = false
  /** The last allowlist it was handed, so tests can assert on it. */
  lastAllowList: Array<string> = []

  /**
   * Note the contract this encodes: `create` returns the PRF output evaluated
   * at the vault's own salt, because the real port always follows the
   * registration with an assertion to get it (several Chrome versions report
   * `prf.enabled` at create time but return no results there).
   */
  async create(request: PasskeyCreateRequest): Promise<{
    credentialId: Uint8Array<ArrayBuffer>
    prfSecret: Uint8Array<ArrayBuffer>
    transports?: Array<string>
  }> {
    if (this.prfUnsupported) {
      throw new VaultProtectorError('no prf', 'prf-unsupported')
    }
    const credentialId = randomBytes(16)
    const id = toBase64(credentialId)
    this.keys.set(id, randomBytes(32))
    this.present.add(id)
    return {
      credentialId,
      prfSecret: await this.prf(id, fromBase64(request.prfSalt)),
      transports: ['internal'],
    }
  }

  async assert(request: PasskeyAssertRequest) {
    this.lastAllowList = request.allowCredentialIds
    if (this.cancelOnAssert) {
      throw new VaultProtectorError('dismissed', 'cancelled')
    }
    const id = request.allowCredentialIds.find((c) => this.present.has(c))
    if (!id) throw new VaultProtectorError('no credential', 'cancelled')
    return {
      credentialId: fromBase64(id),
      prfSecret: await this.prf(id, fromBase64(request.prfSalt)),
    }
  }

  private async prf(
    id: string,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const material = this.keys.get(id)
    if (!material) throw new Error('unknown credential')
    const key = await crypto.subtle.importKey(
      'raw',
      material,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, salt))
  }
}

function record(
  identity: VaultIdentity,
  protectors: Array<VaultProtector>,
): VaultRecord {
  return {
    v: 1,
    state: 'ready',
    revision: 1,
    prfSalt: identity.prfSalt,
    webauthnUserId: identity.webauthnUserId,
    createdAt: Date.now(),
    protectors,
  }
}

const opts = {
  label: 'Passkey',
  userName: 'Pairlens vault',
  userDisplayName: 'Pairlens vault',
}

describe('derivePasskeyKek', () => {
  test('is deterministic for a fixed secret and salt', async () => {
    // Fixed vectors: the real PRF output is opaque, but the derivation over
    // it must be reproducible or an unlock could never work twice.
    const secret = fromBase64('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=')
    const salt = fromBase64('ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=')
    const first = await derivePasskeyKek(secret, salt)
    const second = await derivePasskeyKek(secret, salt)

    const raw = generateRawDek()
    const aad = protectorAad(1, { id: 'p', type: 'passkey' })
    const { iv, wrapped } = await wrapDek(first, raw, aad)
    expect([...(await unwrapRawDek(second, iv, wrapped, aad))]).toEqual([
      ...raw,
    ])
  })

  test('a different salt is a different key', async () => {
    const secret = randomBytes(32)
    const a = await derivePasskeyKek(secret, randomBytes(32))
    const b = await derivePasskeyKek(secret, randomBytes(32))
    const aad = protectorAad(1, { id: 'p', type: 'passkey' })
    const { iv, wrapped } = await wrapDek(a, generateRawDek(), aad)
    expect(unwrapRawDek(b, iv, wrapped, aad)).rejects.toThrow()
  })
})

describe('enroll / unlock', () => {
  test('round trips the data key through the authenticator', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const raw = generateRawDek()

    const protector = await enrollPasskeyProtector(identity, raw, opts, port)
    expect(protector.type).toBe('passkey')
    expect(protector.transports).toEqual(['internal'])

    const recovered = await recoverRawDekWithPasskey(
      record(identity, [protector]),
      port,
    )
    expect([...recovered]).toEqual([...raw])
  })

  test('unlockWithPasskey yields the working, non-extractable key', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const raw = generateRawDek()
    const protector = await enrollPasskeyProtector(identity, raw, opts, port)
    const stored = await encryptWithDek(await importDek(raw), 'cred:a', 'sk')

    const dek = await unlockWithPasskey(record(identity, [protector]), port)
    expect(dek.extractable).toBe(false)
    expect(await decryptWithDek(dek, 'cred:a', stored)).toBe('sk')
  })

  test('every enrolled credential is offered, so a roaming key can answer', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const raw = generateRawDek()
    const first = await enrollPasskeyProtector(identity, raw, opts, port)
    const second = await enrollPasskeyProtector(identity, raw, opts, port)

    // Only the second one is plugged in. An `allowCredentials` list that held
    // just the first would silently fail for exactly the user who bought
    // hardware to be safer.
    port.present = new Set([second.credentialId])
    const recovered = await recoverRawDekWithPasskey(
      record(identity, [first, second]),
      port,
    )
    expect([...recovered]).toEqual([...raw])
    expect(port.lastAllowList).toEqual([
      first.credentialId,
      second.credentialId,
    ])
  })

  test('two passkeys wrap the same data key under different secrets', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const raw = generateRawDek()
    const first = await enrollPasskeyProtector(identity, raw, opts, port)
    const second = await enrollPasskeyProtector(identity, raw, opts, port)

    // Same vault-wide PRF salt, different authenticator credentials: the
    // wrapped blobs must not match, or one leaked secret opens both.
    expect(first.wrapped).not.toBe(second.wrapped)
    expect(first.salt).not.toBe(second.salt)
  })

  test('an unknown credential is a no-match, not an unlock', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const raw = generateRawDek()
    const enrolled = await enrollPasskeyProtector(identity, raw, opts, port)
    // A second credential exists on the authenticator but was never enrolled
    // here; force it to answer with that one.
    const stranger = await port.create({ ...identity, ...opts })
    const hijacked: PasskeyPrfPort = {
      create: (request) => port.create(request),
      assert: async (request) => {
        port.lastAllowList = request.allowCredentialIds
        return {
          credentialId: stranger.credentialId,
          prfSecret: stranger.prfSecret,
        }
      },
    }
    const promise = recoverRawDekWithPasskey(
      record(identity, [enrolled]),
      hijacked,
    )
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('no-match')
    })
  })

  test('a tampered blob is a no-match rather than a crash', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const protector = await enrollPasskeyProtector(
      identity,
      generateRawDek(),
      opts,
      port,
    )
    const wrapped = fromBase64(protector.wrapped)
    wrapped[0] ^= 0xff
    const promise = recoverRawDekWithPasskey(
      record(identity, [{ ...protector, wrapped: toBase64(wrapped) }]),
      port,
    )
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('no-match')
    })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
  })

  test('a dismissed prompt is cancelled, which must never count as a guess', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const protector = await enrollPasskeyProtector(
      identity,
      generateRawDek(),
      opts,
      port,
    )
    port.cancelOnAssert = true
    const promise = recoverRawDekWithPasskey(
      record(identity, [protector]),
      port,
    )
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('cancelled')
    })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
  })

  test('a vault with no passkey says so instead of prompting', async () => {
    const port = new FakeAuthenticator()
    const identity = newVaultIdentity()
    const promise = recoverRawDekWithPasskey(record(identity, []), port)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('unavailable')
    })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    expect(port.lastAllowList).toEqual([])
  })

  test('an authenticator without PRF surfaces as prf-unsupported', async () => {
    const port = new FakeAuthenticator()
    port.prfUnsupported = true
    const promise = enrollPasskeyProtector(
      newVaultIdentity(),
      generateRawDek(),
      opts,
      port,
    )
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('prf-unsupported')
    })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
  })
})

describe('newVaultIdentity', () => {
  test('generates fresh 32-byte salts', () => {
    const a = newVaultIdentity()
    const b = newVaultIdentity()
    expect(fromBase64(a.prfSalt)).toHaveLength(32)
    expect(fromBase64(a.webauthnUserId)).toHaveLength(32)
    expect(a.prfSalt).not.toBe(b.prfSalt)
    expect(a.webauthnUserId).not.toBe(b.webauthnUserId)
  })
})
