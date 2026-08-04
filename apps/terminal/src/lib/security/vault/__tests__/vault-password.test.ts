// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The password protector, including the one property that is invisible until
 * it is gone: the vault KEK is NOT the lock verifier's digest. Same password,
 * same salt, and the two must still produce different keys — otherwise a
 * verifier read off disk would be a vault key, and the lock screen's own
 * stored hash would open every credential behind it.
 *
 * Iterations are a token 1k here. What is under test is the round trip, not
 * the KDF's price.
 */
import { describe, expect, test } from 'bun:test'

import {
  enrollPasswordProtector,
  recoverRawDekWithPassword,
  rewrapPasswordProtectors,
  unlockWithPassword,
} from '../vault-password'
import {
  decryptWithDek,
  encryptWithDek,
  fromBase64,
  generateRawDek,
  importDek,
  randomBytes,
  toBase64,
} from '../vault-crypto'
import { passwordProtectors } from '../vault-record'
import { VaultProtectorError } from '../vault-errors'
import { deriveHash } from '../../lock-verifier'
import type { VaultProtector, VaultRecord } from '../vault-record'

const FAST = 1_000

function record(protectors: Array<VaultProtector>): VaultRecord {
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

describe('enroll / unlock', () => {
  test('the right password recovers the data key', async () => {
    const raw = generateRawDek()
    const protector = await enrollPasswordProtector(raw, 'correct horse', {
      label: 'Password',
      iterations: FAST,
    })
    const recovered = await recoverRawDekWithPassword(
      record([protector]),
      'correct horse',
    )
    expect([...recovered]).toEqual([...raw])
  })

  test('a wrong password is a typed error, not a silent miss', async () => {
    const protector = await enrollPasswordProtector(
      generateRawDek(),
      'correct horse',
      { label: 'Password', iterations: FAST },
    )
    const promise = recoverRawDekWithPassword(
      record([protector]),
      'Correct horse',
    )
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('wrong-password')
    })
  })

  test('unlockWithPassword hands back a non-extractable key', async () => {
    const raw = generateRawDek()
    const protector = await enrollPasswordProtector(raw, 'pw', {
      label: 'Password',
      iterations: FAST,
    })
    const dek = await unlockWithPassword(record([protector]), 'pw')
    expect(dek.extractable).toBe(false)
    // And it is genuinely the same key: a value encrypted under the original
    // bytes reads back through the unlocked one.
    const stored = await encryptWithDek(await importDek(raw), 'cred:a', 'sk')
    expect(await decryptWithDek(dek, 'cred:a', stored)).toBe('sk')
  })

  test('either of two password protectors opens the vault', async () => {
    const raw = generateRawDek()
    const first = await enrollPasswordProtector(raw, 'alpha', {
      label: 'Laptop',
      iterations: FAST,
    })
    const second = await enrollPasswordProtector(raw, 'beta', {
      label: 'Desktop',
      iterations: FAST,
    })
    const both = record([first, second])
    expect([...(await recoverRawDekWithPassword(both, 'alpha'))]).toEqual([
      ...raw,
    ])
    expect([...(await recoverRawDekWithPassword(both, 'beta'))]).toEqual([
      ...raw,
    ])
  })

  test('a vault with no password protector says so', async () => {
    const promise = recoverRawDekWithPassword(record([]), 'pw')
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: VaultProtectorError) => {
      expect(err.kind).toBe('unavailable')
    })
  })

  test('a tampered blob reads as a wrong password, never as success', async () => {
    const protector = await enrollPasswordProtector(generateRawDek(), 'pw', {
      label: 'Password',
      iterations: FAST,
    })
    const wrapped = fromBase64(protector.wrapped)
    wrapped[0] ^= 0xff
    const tampered = { ...protector, wrapped: toBase64(wrapped) }
    expect(
      recoverRawDekWithPassword(record([tampered]), 'pw'),
    ).rejects.toBeInstanceOf(VaultProtectorError)
  })

  test('the password never appears in what is stored', async () => {
    const protector = await enrollPasswordProtector(
      generateRawDek(),
      'hunter2',
      { label: 'Password', iterations: FAST },
    )
    expect(JSON.stringify(protector)).not.toContain('hunter2')
  })

  test('iterations travel with the blob so the cost can be raised', async () => {
    const raw = generateRawDek()
    const cheap = await enrollPasswordProtector(raw, 'pw', {
      label: 'Password',
      iterations: FAST,
    })
    expect(cheap.iterations).toBe(FAST)
    // Verification must use the STORED count, not today's constant.
    expect([
      ...(await recoverRawDekWithPassword(record([cheap]), 'pw')),
    ]).toEqual([...raw])
  })
})

describe('domain separation from the lock verifier', () => {
  test('the verifier digest is not the vault KEK', async () => {
    // Force the worst case: identical password, identical salt bytes, same
    // iteration count. Only the HKDF step and its info label differ.
    const raw = generateRawDek()
    const protector = await enrollPasswordProtector(raw, 'shared password', {
      label: 'Password',
      iterations: FAST,
    })
    const digest = await deriveHash(
      'shared password',
      fromBase64(protector.salt),
      protector.iterations,
    )
    // Someone who read the verifier off disk holds exactly these bytes. Used
    // directly as an AES key they must not open the wrapped DEK.
    const asKey = await crypto.subtle.importKey(
      'raw',
      digest,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    )
    expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(protector.iv) },
        asKey,
        fromBase64(protector.wrapped),
      ),
    ).rejects.toThrow()
    // ...and the real protector still works.
    expect([
      ...(await recoverRawDekWithPassword(
        record([protector]),
        'shared password',
      )),
    ]).toEqual([...raw])
  })
})

describe('rewrapPasswordProtectors', () => {
  test('rotates the password without changing the data key', async () => {
    const raw = generateRawDek()
    const protector = await enrollPasswordProtector(raw, 'old pw', {
      label: 'Password',
      iterations: FAST,
    })
    const before = record([protector])
    const stored = await encryptWithDek(await importDek(raw), 'cred:a', 'sk')

    const after = await rewrapPasswordProtectors(before, 'old pw', 'new pw')

    expect(after.revision).toBe(before.revision + 1)
    expect(passwordProtectors(after)).toHaveLength(1)
    // The old password is dead, the new one works, and the value encrypted
    // before the rotation still reads.
    expect(recoverRawDekWithPassword(after, 'old pw')).rejects.toThrow()
    const dek = await unlockWithPassword(after, 'new pw')
    expect(await decryptWithDek(dek, 'cred:a', stored)).toBe('sk')
  })

  test('a wrong old password changes nothing', async () => {
    const protector = await enrollPasswordProtector(generateRawDek(), 'old', {
      label: 'Password',
      iterations: FAST,
    })
    const before = record([protector])
    expect(
      rewrapPasswordProtectors(before, 'wrong', 'new'),
    ).rejects.toBeInstanceOf(VaultProtectorError)
    // Pure function: the caller's record is untouched, so there is nothing to
    // roll back if it throws.
    expect(before.protectors[0]).toBe(protector)
  })

  test('leaves non-password protectors alone', async () => {
    const raw = generateRawDek()
    const pw = await enrollPasswordProtector(raw, 'old', {
      label: 'Password',
      iterations: FAST,
    })
    const passkey: VaultProtector = {
      id: 'k',
      type: 'passkey',
      createdAt: 1,
      label: 'Key',
      credentialId: 'Y3JlZA==',
      salt: toBase64(randomBytes(32)),
      iv: toBase64(randomBytes(12)),
      wrapped: toBase64(randomBytes(48)),
    }
    const after = await rewrapPasswordProtectors(
      record([pw, passkey]),
      'old',
      'new',
    )
    expect(after.protectors.find((p) => p.id === 'k')).toEqual(passkey)
  })
})
