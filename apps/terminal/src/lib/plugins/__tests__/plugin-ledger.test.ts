// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  clearTombstonesAndRemoteEntries,
  getInstallableEntries,
  getLedger,
  getLedgerEntry,
  isTombstoned,
  removeFromLedger,
  reviveBootstrapEntry,
  seedBootstrap,
  setLedgerConfig,
  setLedgerEnabled,
  upsertLedgerEntry,
} from '../plugin-ledger'

// In-memory localStorage shim for the test environment.
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage()
})

const BOOTSTRAP = [
  { pluginId: 'pairlens-core', version: '1.0.0' },
  { pluginId: 'theme-midnight', version: '1.0.0' },
]

describe('plugin-ledger', () => {
  describe('seedBootstrap', () => {
    it('adds bootstrap entries enabled on first run', () => {
      seedBootstrap(BOOTSTRAP)
      const ledger = getLedger()
      expect(ledger['pairlens-core']?.enabled).toBe(true)
      expect(ledger['pairlens-core']?.source).toBe('bootstrap')
      expect(ledger['theme-midnight']?.enabled).toBe(true)
    })

    it('preserves prior enable/disable on subsequent runs', () => {
      seedBootstrap(BOOTSTRAP)
      setLedgerEnabled('theme-midnight', false)
      seedBootstrap(BOOTSTRAP) // simulate next boot
      expect(getLedgerEntry('theme-midnight')?.enabled).toBe(false)
    })

    it('refreshes the shipped version of an existing bootstrap entry', () => {
      seedBootstrap(BOOTSTRAP)
      seedBootstrap([{ pluginId: 'pairlens-core', version: '2.0.0' }])
      expect(getLedgerEntry('pairlens-core')?.version).toBe('2.0.0')
    })
  })

  describe('tombstones', () => {
    it('tombstones a bootstrap plugin on uninstall and excludes it from installable', () => {
      seedBootstrap(BOOTSTRAP)
      removeFromLedger('theme-midnight')
      expect(isTombstoned('theme-midnight')).toBe(true)
      const ids = getInstallableEntries().map((e) => e.pluginId)
      expect(ids).not.toContain('theme-midnight')
      expect(ids).toContain('pairlens-core')
    })

    it('does not re-seed a tombstoned bootstrap plugin on next boot', () => {
      seedBootstrap(BOOTSTRAP)
      removeFromLedger('theme-midnight')
      seedBootstrap(BOOTSTRAP) // next boot
      expect(isTombstoned('theme-midnight')).toBe(true)
      expect(getInstallableEntries().map((e) => e.pluginId)).not.toContain(
        'theme-midnight',
      )
    })

    it('clearTombstonesAndRemoteEntries re-enables built-ins and drops remote', () => {
      seedBootstrap(BOOTSTRAP)
      removeFromLedger('theme-midnight')
      upsertLedgerEntry({
        pluginId: 'remote-x',
        source: 'registry',
        version: '0.1.0',
      })
      clearTombstonesAndRemoteEntries()
      expect(isTombstoned('theme-midnight')).toBe(false)
      expect(getLedgerEntry('theme-midnight')?.enabled).toBe(true)
      expect(getLedgerEntry('remote-x')).toBeNull()
    })
  })

  describe('reviveBootstrapEntry', () => {
    it('lifts the tombstone and switches the plugin back on', () => {
      seedBootstrap(BOOTSTRAP)
      removeFromLedger('theme-midnight')
      reviveBootstrapEntry('theme-midnight', '1.2.0')
      expect(isTombstoned('theme-midnight')).toBe(false)
      const entry = getLedgerEntry('theme-midnight')
      expect(entry?.enabled).toBe(true)
      expect(entry?.source).toBe('bootstrap')
      expect(entry?.version).toBe('1.2.0')
      expect(getInstallableEntries().map((e) => e.pluginId)).toContain(
        'theme-midnight',
      )
    })

    it('keeps the config the row already carried', () => {
      seedBootstrap(BOOTSTRAP)
      setLedgerConfig('theme-midnight', { accent: 'iris' })
      removeFromLedger('theme-midnight')
      reviveBootstrapEntry('theme-midnight', '1.0.0')
      expect(getLedgerEntry('theme-midnight')?.config).toEqual({
        accent: 'iris',
      })
    })

    it('seeds a row when none exists', () => {
      reviveBootstrapEntry('theme-later', '3.0.0')
      const entry = getLedgerEntry('theme-later')
      expect(entry?.source).toBe('bootstrap')
      expect(entry?.enabled).toBe(true)
      expect(entry?.tombstoned).toBe(false)
    })

    it('survives a boot: seedBootstrap leaves the revived row enabled', () => {
      seedBootstrap(BOOTSTRAP)
      removeFromLedger('theme-midnight')
      reviveBootstrapEntry('theme-midnight', '1.0.0')
      seedBootstrap(BOOTSTRAP) // next boot
      expect(getLedgerEntry('theme-midnight')?.enabled).toBe(true)
      expect(isTombstoned('theme-midnight')).toBe(false)
    })
  })

  describe('remote / url plugins', () => {
    it('upsert records source/version/config and is removed outright on uninstall', () => {
      upsertLedgerEntry({
        pluginId: 'remote-x',
        source: 'registry',
        version: '0.3.0',
        config: { apiKey: 'k' },
      })
      const e = getLedgerEntry('remote-x')
      expect(e?.source).toBe('registry')
      expect(e?.version).toBe('0.3.0')
      expect(e?.config).toEqual({ apiKey: 'k' })
      removeFromLedger('remote-x')
      expect(getLedgerEntry('remote-x')).toBeNull()
    })

    it('upsert clears a prior tombstone (reinstall)', () => {
      seedBootstrap([{ pluginId: 'theme-midnight', version: '1.0.0' }])
      removeFromLedger('theme-midnight')
      upsertLedgerEntry({
        pluginId: 'theme-midnight',
        source: 'bootstrap',
        version: '1.0.0',
      })
      expect(isTombstoned('theme-midnight')).toBe(false)
    })
  })

  describe('config + enabled mutations', () => {
    it('setLedgerEnabled / setLedgerConfig update an existing entry', () => {
      seedBootstrap(BOOTSTRAP)
      setLedgerEnabled('pairlens-core', false)
      setLedgerConfig('pairlens-core', { a: 1 })
      expect(getLedgerEntry('pairlens-core')?.enabled).toBe(false)
      expect(getLedgerEntry('pairlens-core')?.config).toEqual({ a: 1 })
    })

    it('mutations on a missing entry are no-ops', () => {
      setLedgerEnabled('nope', true)
      setLedgerConfig('nope', { a: 1 })
      expect(getLedgerEntry('nope')).toBeNull()
    })
  })
})
