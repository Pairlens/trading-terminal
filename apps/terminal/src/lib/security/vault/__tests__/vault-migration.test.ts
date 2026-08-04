// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Migration is where a mistake costs someone their live API keys, so the
 * ordering is tested as behaviour rather than trusted to a comment:
 *
 *   - a decrypt failure must abort before ANY write, leaving storage
 *     byte-identical;
 *   - the vault record must land BEFORE the first re-encrypted value, or a
 *     crash in between orphans everything;
 *   - a write failure must leave `state: 'migrating'` and a re-runnable job,
 *     never a half-converted vault that reports itself finished.
 */
import { describe, expect, test } from 'bun:test'

import {
  collectLegacyValues,
  collectStoredPlaintexts,
  finishMigration,
  migrateLegacyValues,
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

const LEGACY = 'enc.v1.'

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
  deps: Partial<MigrationDeps>
  values: Map<string, string>
  records: Array<{ record: VaultRecord; expected: number | null }>
  log: Array<string>
  failDecryptFor?: string
  failWriteFor?: string
}

function harness(initial: Record<string, string>): Harness {
  const values = new Map(Object.entries(initial))
  const records: Array<{ record: VaultRecord; expected: number | null }> = []
  const log: Array<string> = []
  const state: Harness = {
    values,
    records,
    log,
    deps: {
      // The real browser collector, over fake storage — so the abort-before-
      // any-write guarantee is tested where it actually lives.
      collect: (dek) =>
        collectLegacyValues(dek, {
          listLegacy: () =>
            [...values.entries()]
              .filter(([, stored]) => stored.startsWith(LEGACY))
              .map(([key, stored]) => ({ key, stored })),
          decryptLegacy: async (stored) => {
            const key = [...values.entries()].find(([, v]) => v === stored)?.[0]
            if (state.failDecryptFor && key === state.failDecryptFor) {
              throw new Error('IndexedDB key is gone')
            }
            return stored.slice(LEGACY.length)
          },
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

describe('migrateLegacyValues', () => {
  test('re-encrypts every legacy value and finishes ready', async () => {
    const h = harness({
      'cred:a': `${LEGACY}okx-secret`,
      'cred:b': `${LEGACY}binance-secret`,
      'pairlens:credentials-index': `${LEGACY}["a","b"]`,
    })
    const rawDek = generateRawDek()

    const result = await migrateLegacyValues(rawDek, draft(), null, h.deps)

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
    const h = harness({ 'cred:a': `${LEGACY}secret` })
    await migrateLegacyValues(generateRawDek(), draft(), null, h.deps)
    // A crash between the two would orphan every converted value.
    expect(h.log).toEqual(['record:migrating', 'value:cred:a', 'record:ready'])
  })

  test('compare-and-set tokens chain correctly', async () => {
    const h = harness({})
    await migrateLegacyValues(generateRawDek(), draft(), null, h.deps)
    expect(h.records.map((r) => [r.expected, r.record.revision])).toEqual([
      [null, 1],
      [1, 2],
    ])
  })

  test('an unreadable legacy value aborts before anything is written', async () => {
    const h = harness({
      'cred:a': `${LEGACY}fine`,
      'cred:b': `${LEGACY}doomed`,
    })
    h.failDecryptFor = 'cred:b'
    const before = Object.fromEntries(h.values)

    await expect(
      migrateLegacyValues(generateRawDek(), draft(), null, h.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // Byte-identical: no record, no converted values, nothing lost.
    expect(Object.fromEntries(h.values)).toEqual(before)
    expect(h.records).toHaveLength(0)
    expect(h.log).toEqual([])
  })

  test('a failed write leaves a migrating record and a re-runnable job', async () => {
    const h = harness({
      'cred:a': `${LEGACY}first`,
      'cred:b': `${LEGACY}second`,
    })
    h.failWriteFor = 'cred:b'
    const rawDek = generateRawDek()

    await expect(
      migrateLegacyValues(rawDek, draft(), null, h.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // Mixed state, exactly as designed: `getCredential` reads both formats.
    expect(h.values.get('cred:a')?.startsWith(CIPHER_V2)).toBe(true)
    expect(h.values.get('cred:b')?.startsWith(LEGACY)).toBe(true)
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
    const h = harness({})
    const result = await migrateLegacyValues(
      generateRawDek(),
      draft(),
      null,
      h.deps,
    )
    expect(result.migrated).toBe(0)
    expect(result.record.state).toBe('ready')
    expect(h.log).toEqual(['record:migrating', 'record:ready'])
  })

  test('already-vaulted values are left alone', async () => {
    const h = harness({ 'cred:a': `${CIPHER_V2}already.done` })
    const result = await migrateLegacyValues(
      generateRawDek(),
      draft(),
      null,
      h.deps,
    )
    expect(result.migrated).toBe(0)
    expect(h.values.get('cred:a')).toBe(`${CIPHER_V2}already.done`)
  })
})

/**
 * The desktop half, and the reason this file grew one.
 *
 * On desktop the values sitting there are PLAINTEXT in the OS keychain, and
 * the keychain has no `list` — so if enrollment does not walk the credential
 * and wallet indexes, it encrypts nothing that already exists while the
 * Security panel reports "protected". These cover the walk itself.
 */
describe('collectStoredPlaintexts (desktop enrollment)', () => {
  function desktop(initial: Record<string, string>) {
    const values = new Map(Object.entries(initial))
    const log: Array<string> = []
    const read = async (key: string) => values.get(key) ?? null
    return {
      values,
      log,
      deps: {
        collect: (dek: CryptoKey) => collectStoredPlaintexts(dek, read),
        writeValue: async (key: string, stored: string) => {
          log.push(`value:${key}`)
          values.set(key, stored)
        },
        readValue: read,
        writeRecord: async (record: VaultRecord) => {
          log.push(`record:${record.state}`)
          return record
        },
      } satisfies Partial<MigrationDeps>,
    }
  }

  const device = {
    'pairlens:credentials-index': '["abc"]',
    'cred:abc': '{"id":"abc","apiSecret":"SUPERSECRET"}',
    'pairlens:wallets-index': '["w1"]',
    'wallet:w1': '{"id":"w1"}',
    'wallet:w1:secret': 'PRIVATE-KEY',
  }

  test('enrollment encrypts the keys that were already there', async () => {
    const d = desktop(device)
    const rawDek = generateRawDek()

    const result = await migrateLegacyValues(rawDek, draft(), null, d.deps)

    expect(result.migrated).toBe(5)
    for (const [key, stored] of d.values) {
      // Every slot, named in the assertion so a miss says which one.
      expect(`${key}:${stored.startsWith(CIPHER_V2)}`).toBe(`${key}:true`)
    }
    const dek = await importDek(rawDek)
    expect(
      await decryptWithDek(
        dek,
        'wallet:w1:secret',
        d.values.get('wallet:w1:secret')!,
      ),
    ).toBe('PRIVATE-KEY')
  })

  test('a keychain that accepts a write and stores nothing is caught', async () => {
    const d = desktop(device)
    const dropped = d.deps.writeValue
    d.deps.writeValue = async (key, stored) => {
      if (key === 'wallet:w1:secret') return
      await dropped(key, stored)
    }

    await expect(
      migrateLegacyValues(generateRawDek(), draft(), null, d.deps),
    ).rejects.toBeInstanceOf(VaultMigrationError)

    // The record never reaches `ready`, so the panel cannot claim protection
    // over a value that is still plaintext on disk.
    expect(d.log.filter((entry) => entry === 'record:ready')).toHaveLength(0)
    expect(d.values.get('wallet:w1:secret')).toBe('PRIVATE-KEY')
  })

  test('a re-run converts only what is left', async () => {
    const d = desktop(device)
    const rawDek = generateRawDek()
    const dek = await importDek(rawDek)
    // As if an earlier attempt got through the first two slots.
    for (const key of ['pairlens:credentials-index', 'cred:abc']) {
      d.values.set(key, await encryptWithDek(dek, key, device[key as never]))
    }

    const result = await finishMigration(
      dek,
      draft({ state: 'migrating' }),
      d.deps,
    )

    expect(result.migrated).toBe(3)
    expect(result.record.state).toBe('ready')
    expect(
      await decryptWithDek(dek, 'cred:abc', d.values.get('cred:abc')!),
    ).toBe(device['cred:abc'])
  })

  test('nothing stored means nothing to walk', async () => {
    const d = desktop({})
    const result = await migrateLegacyValues(
      generateRawDek(),
      draft(),
      null,
      d.deps,
    )
    expect(result.migrated).toBe(0)
    expect(d.log).toEqual(['record:migrating', 'record:ready'])
  })
})

describe('finishMigration', () => {
  test('converts the stragglers and flips to ready', async () => {
    const h = harness({
      'cred:a': `${CIPHER_V2}done`,
      'cred:b': `${LEGACY}straggler`,
    })
    const rawDek = generateRawDek()
    const result = await finishMigration(
      await importDek(rawDek),
      draft({ state: 'migrating', revision: 4 }),
      h.deps,
    )
    expect(result.migrated).toBe(1)
    expect(result.record.revision).toBe(5)
    expect(h.records[0]?.expected).toBe(4)
    const dek = await importDek(rawDek)
    expect(await decryptWithDek(dek, 'cred:b', h.values.get('cred:b')!)).toBe(
      'straggler',
    )
  })
})
