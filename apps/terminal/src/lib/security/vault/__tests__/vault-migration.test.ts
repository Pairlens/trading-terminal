// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Migration is where a mistake costs someone their live API keys, so the
 * ordering is tested as behaviour rather than trusted to a comment:
 *
 *   - a read failure must abort before ANY write, leaving storage
 *     byte-identical;
 *   - the vault record must land BEFORE the first re-encrypted value, or a
 *     crash in between orphans everything;
 *   - a write failure must leave `state: 'migrating'` and a re-runnable job,
 *     never a half-converted vault that reports itself finished.
 *
 * There is one collector now, `collectStoredPlaintexts`, and it walks the
 * credential and wallet indexes because the OS keychain has no `list`. On
 * desktop that walk finds real plaintext secrets; on browser it finds nothing,
 * because a protector is a precondition for the first credential — so the
 * fixtures below are shaped like a desktop device, which is the only place
 * this code has work to do.
 */
import { describe, expect, test } from 'bun:test'

import {
  collectStoredPlaintexts,
  finishMigration,
  migrateStoredValues,
} from '../vault-migration'
import {
  CIPHER_V2,
  decryptWithDek,
  encryptWithDek,
  generateRawDek,
  importDek,
  randomBytes,
  toBase64,
} from '../vault-crypto'
import { VaultMigrationError } from '../vault-errors'
import type { MigrationDeps } from '../vault-migration'
import type { VaultRecord } from '../vault-record'

const CRED_INDEX = 'pairlens:credentials-index'
const WALLET_INDEX = 'pairlens:wallets-index'

function draft(patch: Partial<VaultRecord> = {}): VaultRecord {
  return {
    v: 1,
    state: 'ready',
    revision: 1,
    prfSalt: toBase64(randomBytes(32)),
    webauthnUserId: toBase64(randomBytes(32)),
    createdAt: 1,
    protectors: [
      {
        id: 'p1',
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
    ...patch,
  }
}

type Harness = {
  deps: MigrationDeps
  values: Map<string, string>
  records: Array<{ record: VaultRecord; expected: number | null }>
  log: Array<string>
  failReadFor?: string
  failWriteFor?: string
}

/**
 * The real collector over a fake store, so the abort-before-any-write
 * guarantee is tested where it actually lives rather than against a stub that
 * cannot fail the same way.
 */
function harness(initial: Record<string, string>): Harness {
  const values = new Map(Object.entries(initial))
  const records: Array<{ record: VaultRecord; expected: number | null }> = []
  const log: Array<string> = []
  const state: Harness = {
    values,
    records,
    log,
    deps: {
      collect: (dek) =>
        collectStoredPlaintexts(dek, async (key) => {
          if (state.failReadFor && key === state.failReadFor) {
            throw new Error('the keychain would not answer')
          }
          return values.get(key) ?? null
        }),
      writeValue: async (key, stored) => {
        if (state.failWriteFor && key === state.failWriteFor) {
          throw new Error('quota exceeded')
        }
        log.push(`value:${key}`)
        values.set(key, stored)
      },
      readValue: async (key) => values.get(key) ?? null,
      writeRecord: async (record, expected) => {
        log.push(`record:${record.state}`)
        records.push({ record, expected })
        return record
      },
    },
  }
  return state
}

/** A device with one exchange credential and one wallet already stored. */
const device = {
  [CRED_INDEX]: '["abc"]',
  'cred:abc': '{"id":"abc","apiSecret":"SUPERSECRET"}',
  [WALLET_INDEX]: '["w1"]',
  'wallet:w1': '{"id":"w1"}',
  'wallet:w1:secret': 'PRIVATE-KEY',
}

describe('migrateStoredValues', () => {
  test('re-encrypts every value that was already there and finishes ready', async () => {
    const h = harness({
      [CRED_INDEX]: '["a","b"]',
      'cred:a': 'okx-secret',
      'cred:b': 'binance-secret',
    })
    const rawDek = generateRawDek()

    const result = await migrateStoredValues(rawDek, draft(), null, h.deps)

    expect(result.migrated).toBe(3)
    expect(result.record.state).toBe('ready')
    for (const stored of h.values.values()) {
      expect(stored.startsWith(CIPHER_V2)).toBe(true)
    }
    // And they are genuinely readable under the new key.
    const dek = await importDek(rawDek)
    expect(await decryptWithDek(dek, 'cred:a', h.values.get('cred:a')!)).toBe(
      'okx-secret',
    )
  })

  test('the record lands before the first re-encrypted value', async () => {
    const h = harness({ [CRED_INDEX]: '["a"]', 'cred:a': 'secret' })
    await migrateStoredValues(generateRawDek(), draft(), null, h.deps)
    // A crash between the two would orphan every converted value.
    expect(h.log[0]).toBe('record:migrating')
    expect(h.log.at(-1)).toBe('record:ready')
    expect(h.log.indexOf('value:cred:a')).toBeGreaterThan(0)
  })

  test('compare-and-set tokens chain correctly', async () => {
    const h = harness({})
    await migrateStoredValues(generateRawDek(), draft(), null, h.deps)
    expect(h.records.map((r) => [r.expected, r.record.revision])).toEqual([
      [null, 1],
      [1, 2],
    ])
  })

  test('an unreadable value aborts before anything is written', async () => {
    const h = harness({
      [CRED_INDEX]: '["a","b"]',
      'cred:a': 'fine',
      'cred:b': 'doomed',
    })
    h.failReadFor = 'cred:b'
    const before = Object.fromEntries(h.values)

    await expect(
      migrateStoredValues(generateRawDek(), draft(), null, h.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // Byte-identical: no record, no converted values, nothing lost.
    expect(Object.fromEntries(h.values)).toEqual(before)
    expect(h.records).toHaveLength(0)
    expect(h.log).toEqual([])
  })

  test('a failed write leaves a migrating record and a re-runnable job', async () => {
    const h = harness({
      [CRED_INDEX]: '["a","b"]',
      'cred:a': 'first',
      'cred:b': 'second',
    })
    h.failWriteFor = 'cred:b'
    const rawDek = generateRawDek()

    await expect(
      migrateStoredValues(rawDek, draft(), null, h.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // Mixed state, exactly as designed: on desktop `getCredential` reads both
    // plaintext and `enc.v2`, so nothing is stranded — it is just not yet
    // protected, which is why the record must NOT say `ready`.
    expect(h.values.get('cred:a')?.startsWith(CIPHER_V2)).toBe(true)
    expect(h.values.get('cred:b')).toBe('second')
    expect(h.records.at(-1)?.record.state).toBe('migrating')

    // Re-run and it completes.
    h.failWriteFor = undefined
    const finished = await finishMigration(
      await importDek(rawDek),
      h.records.at(-1)!.record,
      h.deps,
    )
    expect(finished.migrated).toBe(1)
    expect(finished.record.state).toBe('ready')
    expect(h.values.get('cred:b')?.startsWith(CIPHER_V2)).toBe(true)
  })

  test('nothing to migrate is a valid, complete migration', async () => {
    // A fresh profile: nothing stored yet, so enrollment is two record writes.
    // This is every browser enrollment, and a desktop one on a clean install.
    const h = harness({})
    const result = await migrateStoredValues(
      generateRawDek(),
      draft(),
      null,
      h.deps,
    )
    expect(result.migrated).toBe(0)
    expect(result.record.state).toBe('ready')
    expect(h.log).toEqual(['record:migrating', 'record:ready'])
  })

  test('an unrecognised ciphertext is never encrypted a second time', async () => {
    // Not `enc.v2`, not plaintext we wrote. Treating it as plaintext would
    // bury the real value under two layers, only one of which has a key.
    const h = harness({
      [CRED_INDEX]: '["a"]',
      'cred:a': 'enc.v9.something.opaque',
    })
    const result = await migrateStoredValues(
      generateRawDek(),
      draft(),
      null,
      h.deps,
    )
    expect(result.migrated).toBe(1) // the index only
    expect(h.values.get('cred:a')).toBe('enc.v9.something.opaque')
  })
})

/**
 * The desktop half, and the reason this walk exists at all.
 *
 * The values sitting there are PLAINTEXT in the OS keychain, and the keychain
 * has no `list` — so if enrollment does not walk the credential and wallet
 * indexes, it encrypts nothing that already exists while the Security panel
 * reports "protected".
 */
describe('collectStoredPlaintexts (desktop enrollment)', () => {
  test('enrollment encrypts the keys that were already there', async () => {
    const h = harness(device)
    const rawDek = generateRawDek()

    const result = await migrateStoredValues(rawDek, draft(), null, h.deps)

    expect(result.migrated).toBe(5)
    for (const [key, stored] of h.values) {
      // Every slot, named in the assertion so a miss says which one.
      expect(`${key}:${stored.startsWith(CIPHER_V2)}`).toBe(`${key}:true`)
    }
    const dek = await importDek(rawDek)
    expect(
      await decryptWithDek(
        dek,
        'wallet:w1:secret',
        h.values.get('wallet:w1:secret')!,
      ),
    ).toBe('PRIVATE-KEY')
  })

  test('a keychain that accepts a write and stores nothing is caught', async () => {
    const h = harness(device)
    const dropped = h.deps.writeValue
    h.deps.writeValue = async (key, stored) => {
      if (key === 'wallet:w1:secret') return
      await dropped(key, stored)
    }

    await expect(
      migrateStoredValues(generateRawDek(), draft(), null, h.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // The record never reaches `ready`, so the panel cannot claim protection
    // over a value that is still plaintext on disk.
    expect(h.log.filter((entry) => entry === 'record:ready')).toHaveLength(0)
    expect(h.values.get('wallet:w1:secret')).toBe('PRIVATE-KEY')
  })

  test('a re-run converts only what is left', async () => {
    const h = harness(device)
    const rawDek = generateRawDek()
    const dek = await importDek(rawDek)
    // As if an earlier attempt got through the first two slots.
    for (const key of [CRED_INDEX, 'cred:abc']) {
      h.values.set(key, await encryptWithDek(dek, key, device[key as never]))
    }

    const result = await finishMigration(
      dek,
      draft({ state: 'migrating' }),
      h.deps,
    )

    expect(result.migrated).toBe(3)
    expect(result.record.state).toBe('ready')
    expect(
      await decryptWithDek(dek, 'cred:abc', h.values.get('cred:abc')!),
    ).toBe(device['cred:abc'])
  })

  test('nothing stored means nothing to walk', async () => {
    const h = harness({})
    const result = await migrateStoredValues(
      generateRawDek(),
      draft(),
      null,
      h.deps,
    )
    expect(result.migrated).toBe(0)
    expect(h.log).toEqual(['record:migrating', 'record:ready'])
  })
})

describe('finishMigration', () => {
  test('converts the stragglers and flips to ready', async () => {
    const rawDek = generateRawDek()
    const dek = await importDek(rawDek)
    const h = harness({
      [CRED_INDEX]: '["a","b"]',
      'cred:a': await encryptWithDek(dek, 'cred:a', 'done'),
      'cred:b': 'straggler',
    })
    const result = await finishMigration(
      dek,
      draft({ state: 'migrating', revision: 4 }),
      h.deps,
    )
    expect(result.migrated).toBe(2) // cred:b and the still-plaintext index
    expect(result.record.revision).toBe(5)
    expect(h.records[0]?.expected).toBe(4)
    expect(await decryptWithDek(dek, 'cred:b', h.values.get('cred:b')!)).toBe(
      'straggler',
    )
  })
})
