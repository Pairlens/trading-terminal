// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The record parser is strict for the same reason `parseVerifier` is: a
 * record we cannot read is a record that isn't there. What makes that safe is
 * that nothing deletes on a failed parse — so these cases pin both halves,
 * the rejection AND the fact that a single damaged protector does not cost
 * the user the working ones next to it.
 */
import { describe, expect, test } from 'bun:test'

import {
  assertRevision,
  bumpRevision,
  parseVaultRecord,
  passkeyProtectors,
  passwordProtectors,
  serializeVaultRecord,
  withProtector,
  withoutProtector,
} from '../vault-record'
import { VaultConflictError } from '../vault-errors'
import type { PasswordProtector, VaultRecord } from '../vault-record'

const password = (id: string): PasswordProtector => ({
  id,
  type: 'password',
  createdAt: 1,
  label: 'Password',
  kdf: 'PBKDF2-SHA256',
  iterations: 600_000,
  salt: 'c2FsdA==',
  iv: 'aXYtYnl0ZXM=',
  wrapped: 'd3JhcHBlZA==',
})

const record = (patch: Partial<VaultRecord> = {}): VaultRecord => ({
  v: 1,
  state: 'ready',
  revision: 3,
  prfSalt: 'cHJmU2FsdA==',
  webauthnUserId: 'dXNlcklk',
  createdAt: 10,
  protectors: [password('a')],
  ...patch,
})

describe('parseVaultRecord', () => {
  test('round trips a real record', () => {
    const original = record()
    expect(parseVaultRecord(serializeVaultRecord(original))).toEqual(original)
  })

  test('rejects anything that is not a v1 record with a way in', () => {
    expect(parseVaultRecord(null)).toBeNull()
    expect(parseVaultRecord('')).toBeNull()
    expect(parseVaultRecord('{not json')).toBeNull()
    expect(parseVaultRecord('{}')).toBeNull()
    expect(
      parseVaultRecord(serializeVaultRecord({ ...record(), v: 2 as 1 })),
    ).toBeNull()
    // No PRF salt: a passkey could never be enrolled and any existing one
    // could never be evaluated.
    expect(
      parseVaultRecord(JSON.stringify({ ...record(), prfSalt: '' })),
    ).toBeNull()
    expect(
      parseVaultRecord(JSON.stringify({ ...record(), webauthnUserId: '' })),
    ).toBeNull()
    // No protectors is indistinguishable from no vault.
    expect(
      parseVaultRecord(JSON.stringify({ ...record(), protectors: [] })),
    ).toBeNull()
    expect(
      parseVaultRecord(JSON.stringify({ ...record(), protectors: 'nope' })),
    ).toBeNull()
  })

  test('drops a damaged protector but keeps the rest', () => {
    const raw = JSON.stringify({
      ...record(),
      protectors: [
        password('good'),
        { id: 'broken', type: 'password', kdf: 'md5', salt: 'x' },
        { id: 'alien', type: 'fingerprint', salt: 'x', iv: 'y', wrapped: 'z' },
      ],
    })
    const parsed = parseVaultRecord(raw)
    expect(parsed?.protectors.map((p) => p.id)).toEqual(['good'])
  })

  test('rejects a password protector with a nonsense cost', () => {
    const raw = JSON.stringify({
      ...record(),
      protectors: [{ ...password('a'), iterations: 0 }],
    })
    expect(parseVaultRecord(raw)).toBeNull()
  })

  test('keeps passkey transports when present and omits them when not', () => {
    const withTransports = JSON.stringify({
      ...record(),
      protectors: [
        {
          id: 'k',
          type: 'passkey',
          createdAt: 2,
          label: 'Key',
          credentialId: 'Y3JlZA==',
          transports: ['usb', 42],
          salt: 'c2FsdA==',
          iv: 'aXY=',
          wrapped: 'dw==',
        },
      ],
    })
    const parsed = parseVaultRecord(withTransports)
    expect(passkeyProtectors(parsed!)[0]?.transports).toEqual(['usb'])
  })

  test('an unknown state falls back to ready rather than failing', () => {
    const raw = JSON.stringify({ ...record(), state: 'weird' })
    expect(parseVaultRecord(raw)?.state).toBe('ready')
    expect(
      parseVaultRecord(JSON.stringify({ ...record(), state: 'migrating' }))
        ?.state,
    ).toBe('migrating')
  })
})

describe('revisions', () => {
  test('every mutation bumps, so a concurrent write is detectable', () => {
    const base = record()
    expect(bumpRevision(base).revision).toBe(4)
    expect(withProtector(base, password('b')).revision).toBe(4)
    expect(withoutProtector(base, 'a').revision).toBe(4)
  })

  test('withProtector / withoutProtector edit only the list', () => {
    const base = record()
    const added = withProtector(base, password('b'))
    expect(added.protectors.map((p) => p.id)).toEqual(['a', 'b'])
    expect(withoutProtector(added, 'a').protectors.map((p) => p.id)).toEqual([
      'b',
    ])
    // Removing something that isn't there is a no-op, not a throw.
    expect(withoutProtector(base, 'zzz').protectors).toHaveLength(1)
  })

  test('assertRevision is a compare-and-set gate', () => {
    const current = record({ revision: 7 })
    expect(() => assertRevision(current, 7)).not.toThrow()
    expect(() => assertRevision(current, 6)).toThrow(VaultConflictError)
    expect(() => assertRevision(null, 7)).toThrow(VaultConflictError)
    // `null` means "there must be nothing here yet" — the create path.
    expect(() => assertRevision(null, null)).not.toThrow()
    expect(() => assertRevision(current, null)).toThrow(VaultConflictError)
  })
})

describe('selectors', () => {
  test('split protectors by kind', () => {
    const mixed = record({
      protectors: [
        password('a'),
        {
          id: 'k',
          type: 'passkey',
          createdAt: 2,
          label: 'Key',
          credentialId: 'Y3JlZA==',
          salt: 'c2FsdA==',
          iv: 'aXY=',
          wrapped: 'dw==',
        },
      ],
    })
    expect(passwordProtectors(mixed).map((p) => p.id)).toEqual(['a'])
    expect(passkeyProtectors(mixed).map((p) => p.id)).toEqual(['k'])
  })
})
