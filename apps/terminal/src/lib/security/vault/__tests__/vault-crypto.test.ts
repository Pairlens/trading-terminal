// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The wrapping layer. Two properties here are the ones that would fail
 * silently if they broke: the runtime DEK must be non-extractable (an
 * extractable one is a key that can be read out and posted anywhere), and the
 * AAD must actually bind — a wrapped blob that can be moved between protector
 * entries, or ciphertext that can be renamed from one keychain slot onto
 * another, both look completely normal until someone abuses them.
 */
import { describe, expect, test } from 'bun:test'

import {
  CIPHER_V2,
  KEK_INFO_PASSKEY,
  KEK_INFO_PASSWORD,
  decryptWithDek,
  deriveKek,
  encryptWithDek,
  generateRawDek,
  importDek,
  protectorAad,
  randomBytes,
  unwrapDek,
  unwrapRawDek,
  valueAad,
  wrapDek,
  zero,
} from '../vault-crypto'

const A = { id: 'protector-a', type: 'password' as const }
const B = { id: 'protector-b', type: 'passkey' as const }

async function kek(): Promise<CryptoKey> {
  return deriveKek(randomBytes(32), randomBytes(32), KEK_INFO_PASSWORD)
}

describe('wrap / unwrap', () => {
  test('round trips the data key', async () => {
    const key = await kek()
    const raw = generateRawDek()
    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(key, raw, aad)

    const recovered = await unwrapRawDek(key, iv, wrapped, aad)
    expect([...recovered]).toEqual([...raw])
  })

  test('the unwrapped runtime key is non-extractable', async () => {
    const key = await kek()
    const raw = generateRawDek()
    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(key, raw, aad)

    const dek = await unwrapDek(key, iv, wrapped, aad)
    expect(dek.extractable).toBe(false)
    expect(await importDek(raw)).toHaveProperty('extractable', false)
  })

  test('a different KEK cannot open the blob', async () => {
    const raw = generateRawDek()
    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(await kek(), raw, aad)

    expect(unwrapRawDek(await kek(), iv, wrapped, aad)).rejects.toThrow()
  })

  test('a blob cannot be moved to another protector entry', async () => {
    const key = await kek()
    const raw = generateRawDek()
    const { iv, wrapped } = await wrapDek(key, raw, protectorAad(1, A))

    // Same key, same bytes on disk — only the entry it claims to belong to
    // changed. GCM must refuse.
    expect(unwrapRawDek(key, iv, wrapped, protectorAad(1, B))).rejects.toThrow()
    expect(unwrapRawDek(key, iv, wrapped, protectorAad(2, A))).rejects.toThrow()
  })

  test('a tampered blob fails rather than yielding garbage', async () => {
    const key = await kek()
    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(key, generateRawDek(), aad)
    wrapped[0] ^= 0xff
    expect(unwrapRawDek(key, iv, wrapped, aad)).rejects.toThrow()
  })
})

describe('KEK derivation', () => {
  test('is deterministic for the same secret and salt', async () => {
    const secret = randomBytes(32)
    const salt = randomBytes(32)
    const first = await deriveKek(secret, salt, KEK_INFO_PASSWORD)
    const second = await deriveKek(secret, salt, KEK_INFO_PASSWORD)

    const raw = generateRawDek()
    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(first, raw, aad)
    expect([...(await unwrapRawDek(second, iv, wrapped, aad))]).toEqual([
      ...raw,
    ])
  })

  test('the info label separates the two protector kinds', async () => {
    // Same secret, same salt: a password KEK and a passkey KEK must still be
    // different keys, or one protector kind could open the other's blob.
    const secret = randomBytes(32)
    const salt = randomBytes(32)
    const pw = await deriveKek(secret, salt, KEK_INFO_PASSWORD)
    const pk = await deriveKek(secret, salt, KEK_INFO_PASSKEY)

    const aad = protectorAad(1, A)
    const { iv, wrapped } = await wrapDek(pw, generateRawDek(), aad)
    expect(unwrapRawDek(pk, iv, wrapped, aad)).rejects.toThrow()
  })
})

describe('value encryption', () => {
  test('round trips and is tagged enc.v2', async () => {
    const dek = await importDek(generateRawDek())
    const stored = await encryptWithDek(dek, 'cred:abc', 'sk-secret')
    expect(stored.startsWith(CIPHER_V2)).toBe(true)
    expect(stored).not.toContain('sk-secret')
    expect(await decryptWithDek(dek, 'cred:abc', stored)).toBe('sk-secret')
  })

  test('ciphertext cannot be renamed onto another slot', async () => {
    const dek = await importDek(generateRawDek())
    const stored = await encryptWithDek(dek, 'cred:abc', 'sk-secret')
    // Copying the value onto `wallet:x:secret` would otherwise point a
    // connector at a key it was never given.
    expect(decryptWithDek(dek, 'wallet:x:secret', stored)).rejects.toThrow()
  })

  test('another DEK cannot read it', async () => {
    const dek = await importDek(generateRawDek())
    const other = await importDek(generateRawDek())
    const stored = await encryptWithDek(dek, 'cred:abc', 'sk-secret')
    expect(decryptWithDek(other, 'cred:abc', stored)).rejects.toThrow()
  })

  test('malformed input is rejected, never decoded', async () => {
    const dek = await importDek(generateRawDek())
    expect(decryptWithDek(dek, 'cred:abc', 'plain')).rejects.toThrow()
    expect(decryptWithDek(dek, 'cred:abc', 'enc.v1.aa.bb')).rejects.toThrow()
    expect(decryptWithDek(dek, 'cred:abc', 'enc.v2.')).rejects.toThrow()
    expect(decryptWithDek(dek, 'cred:abc', 'enc.v2.zz')).rejects.toThrow()
  })

  test('a flipped bit in the ciphertext fails authentication', async () => {
    const dek = await importDek(generateRawDek())
    const stored = await encryptWithDek(dek, 'cred:abc', 'sk-secret')
    const [prefixIv, data] = stored.slice(CIPHER_V2.length).split('.')
    const bytes = atob(data)
    const flipped = btoa(
      String.fromCharCode(bytes.charCodeAt(0) ^ 0xff) + bytes.slice(1),
    )
    expect(
      decryptWithDek(dek, 'cred:abc', `${CIPHER_V2}${prefixIv}.${flipped}`),
    ).rejects.toThrow()
  })
})

describe('aad helpers', () => {
  test('encode the values they claim to', () => {
    const decode = (b: Uint8Array) => new TextDecoder().decode(b)
    expect(decode(protectorAad(1, A))).toBe(
      'pairlens/vault/1/password/protector-a',
    )
    expect(decode(valueAad('cred:abc'))).toBe(
      'pairlens/vault/value/v2/cred:abc',
    )
  })
})

describe('zero', () => {
  test('overwrites the buffer in place', () => {
    const bytes = randomBytes(32)
    zero(bytes)
    expect([...bytes].every((b) => b === 0)).toBe(true)
  })
})
