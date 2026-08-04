// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the record lives, and the compare-and-set that keeps two windows from
 * silently eating each other's protectors.
 *
 * The storage key is asserted literally on purpose. `pairlens:security.vault`
 * earns two invariants by its exact spelling — the destructive reset sweeps
 * every `pairlens:` key, and the sync blocklist refuses anything starting
 * `security.` — and a rename that looked cosmetic would quietly cost both: a
 * record outliving its ciphertext is unopenable data, and a record on the sync
 * bus is a server-reachable list of wrapped keys.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'
import type { VaultRecord } from '../vault-record'

const storage = installBrowserGlobals()

const {
  clearUiMirror,
  deleteVaultRecord,
  readUiMirror,
  readVaultRecord,
  readVaultRecordRaw,
  writeVaultRecord,
} = await import('../vault-storage')
const { VaultConflictError } = await import('../vault-errors')
const { randomBytes, toBase64 } = await import('../vault-crypto')

const RECORD_KEY = 'pairlens:security.vault'
const MIRROR_KEY = 'pairlens:security.vault-ui'

function record(revision: number, extra?: Partial<VaultRecord>): VaultRecord {
  return {
    v: 1,
    state: 'ready',
    revision,
    prfSalt: toBase64(randomBytes(32)),
    webauthnUserId: toBase64(randomBytes(32)),
    createdAt: 1,
    protectors: [
      {
        id: `p${revision}`,
        type: 'password',
        createdAt: 1,
        label: 'Password',
        kdf: 'PBKDF2-SHA256',
        iterations: 1_000,
        salt: 'c2FsdA==',
        iv: 'aXY=',
        wrapped: 'dw==',
      },
    ],
    ...extra,
  }
}

beforeEach(() => {
  storage.clear()
})

describe('storage location', () => {
  test('the browser record lives beside the ciphertext it belongs to', async () => {
    await writeVaultRecord(record(1), null)
    expect(storage.getItem(RECORD_KEY)).not.toBeNull()
    expect(JSON.parse((await readVaultRecordRaw())!).revision).toBe(1)
  })

  test('delete removes both the record and its UI mirror', async () => {
    await writeVaultRecord(record(1), null)
    expect(storage.getItem(MIRROR_KEY)).not.toBeNull()

    await deleteVaultRecord()
    expect(storage.getItem(RECORD_KEY)).toBeNull()
    expect(storage.getItem(MIRROR_KEY)).toBeNull()
    expect(await readVaultRecord()).toBeNull()
  })
})

describe('compare-and-set', () => {
  test('a create refuses to land on an existing vault', async () => {
    await writeVaultRecord(record(1), null)
    await expect(writeVaultRecord(record(1), null)).rejects.toBeInstanceOf(
      VaultConflictError,
    )
  })

  test('a stale revision loses instead of clobbering', async () => {
    await writeVaultRecord(record(1), null)
    // Another window landed revision 2 while this one was still holding 1.
    await writeVaultRecord(record(2), 1)

    await expect(writeVaultRecord(record(2), 1)).rejects.toBeInstanceOf(
      VaultConflictError,
    )
    // The winner's record survived: dropping a protector here is the failure
    // that surfaces later as "my passkey stopped working", with no trace.
    expect(JSON.parse(storage.getItem(RECORD_KEY)!).protectors[0].id).toBe('p2')
  })

  test('an update against a missing record is a conflict, not a create', async () => {
    await expect(writeVaultRecord(record(2), 1)).rejects.toBeInstanceOf(
      VaultConflictError,
    )
    expect(storage.getItem(RECORD_KEY)).toBeNull()
  })
})

describe('the UI mirror', () => {
  test('tracks the record it was written from', async () => {
    await writeVaultRecord(
      {
        ...record(1),
        protectors: [
          ...record(1).protectors,
          {
            id: 'k1',
            type: 'passkey',
            createdAt: 1,
            label: 'Passkey',
            credentialId: 'Y3Jl',
            salt: 'c2FsdA==',
            iv: 'aXY=',
            wrapped: 'dw==',
          },
        ],
      },
      null,
    )
    expect(readUiMirror()).toEqual({
      enrolled: true,
      protectors: 2,
      hasPasskey: true,
      hasPassword: true,
      state: 'ready',
    })
  })

  test('is a hint, not a source of truth', async () => {
    await writeVaultRecord(record(1), null)
    // Someone edits localStorage by hand. The mirror lies; the record does not.
    storage.setItem(
      MIRROR_KEY,
      JSON.stringify({ enrolled: false, protectors: 0, hasPasskey: false }),
    )
    expect(readUiMirror()?.enrolled).toBe(false)
    expect((await readVaultRecord())?.protectors).toHaveLength(1)
  })

  test('garbage reads as absent rather than throwing at first paint', () => {
    storage.setItem(MIRROR_KEY, '{not json')
    expect(readUiMirror()).toBeNull()
    clearUiMirror()
    expect(readUiMirror()).toBeNull()
  })
})
