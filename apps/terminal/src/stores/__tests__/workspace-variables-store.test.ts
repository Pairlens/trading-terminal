// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  destroyVarStore,
  ensureVarStoreRegistered,
  flushVarStorePersist,
  getOrCreateVarStore,
} from '../workspace-variables-store'
import type { WorkspaceVariableDefinition } from '@/lib/layout/types'

// Minimal localStorage backing for the store's persistence layer. Installing
// after the imports is safe — the store only touches localStorage lazily.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

const STORAGE_PREFIX = 'pairlens:workspace-vars:'

function readPersisted(id: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + id)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

let ids: Array<string> = []
let counter = 0
function freshId(): string {
  const id = `test-ws-${++counter}`
  ids.push(id)
  return id
}

beforeEach(() => {
  ids = []
})

afterEach(() => {
  for (const id of ids) {
    destroyVarStore(id)
    localStorage.removeItem(STORAGE_PREFIX + id)
  }
})

describe('workspace variables store', () => {
  it('returns the same store per workspace and isolates workspaces', () => {
    const a = freshId()
    const b = freshId()
    const storeA = getOrCreateVarStore(a)
    const storeB = getOrCreateVarStore(b)
    expect(getOrCreateVarStore(a)).toBe(storeA)
    expect(storeA).not.toBe(storeB)

    storeA.getState().setVariableValue('$x', '1h')
    expect(storeA.getState().values['$x']).toBe('1h')
    expect(storeB.getState().values['$x']).toBeUndefined()
  })

  it('loads persisted values on creation', () => {
    const id = freshId()
    localStorage.setItem(
      STORAGE_PREFIX + id,
      JSON.stringify({ $coin: { pairKey: 'BTC-USDT', market: 'okx' } }),
    )
    const store = getOrCreateVarStore(id)
    expect(store.getState().values['$coin']).toEqual({
      pairKey: 'BTC-USDT',
      market: 'okx',
    })
  })

  it('destroy flushes a pending debounced persist', () => {
    const id = freshId()
    const store = getOrCreateVarStore(id)
    store.getState().setVariableValue('$tf', '4h')
    // Not yet persisted — the write is debounced
    expect(readPersisted(id)).toBeNull()
    destroyVarStore(id)
    expect(readPersisted(id)).toEqual({ $tf: '4h' })
  })

  it('a write in one workspace does not cancel a pending persist in another', () => {
    const a = freshId()
    const b = freshId()
    getOrCreateVarStore(a).getState().setVariableValue('$x', 'a-value')
    getOrCreateVarStore(b).getState().setVariableValue('$y', 'b-value')
    flushVarStorePersist(a)
    flushVarStorePersist(b)
    expect(readPersisted(a)).toEqual({ $x: 'a-value' })
    expect(readPersisted(b)).toEqual({ $y: 'b-value' })
  })

  it('reconcile prunes removed variables, fixes stale shapes, and fills defaults', () => {
    const id = freshId()
    localStorage.setItem(
      STORAGE_PREFIX + id,
      JSON.stringify({
        $keep: { pairKey: 'BTC-USDT', market: 'okx' },
        $deleted: 'stale',
        $retyped: { pairKey: 'ETH-USDT', market: 'okx' },
      }),
    )
    const store = getOrCreateVarStore(id)
    const defs: Array<WorkspaceVariableDefinition> = [
      { name: '$keep', label: 'Keep', type: 'pair' },
      { name: '$retyped', label: 'Retyped', type: 'timeframe' },
      { name: '$new', label: 'New', type: 'string', defaultValue: 'hi' },
    ]
    store.getState().reconcile(defs)

    const values = store.getState().values
    expect(values['$keep']).toEqual({ pairKey: 'BTC-USDT', market: 'okx' })
    expect(values['$deleted']).toBeUndefined()
    expect(values['$retyped']).toBe('1h') // per-type default after retype
    expect(values['$new']).toBe('hi')

    // Reconcile persists (debounced) — flush and verify
    flushVarStorePersist(id)
    expect(readPersisted(id)).toEqual({
      $keep: { pairKey: 'BTC-USDT', market: 'okx' },
      $retyped: '1h',
      $new: 'hi',
    })
  })

  it('reconcile is a no-op when values already align', () => {
    const id = freshId()
    const store = getOrCreateVarStore(id)
    store.getState().setVariableValue('$tf', '4h')
    flushVarStorePersist(id)
    const before = store.getState().values
    store
      .getState()
      .reconcile([{ name: '$tf', label: 'TF', type: 'timeframe' }])
    expect(store.getState().values).toBe(before)
  })

  it('persists writes from a store the registry no longer holds (StrictMode cycle)', () => {
    const id = freshId()
    const store = getOrCreateVarStore(id)
    // StrictMode: effect cleanup destroys the registry entry while the
    // React tree keeps using the same store instance…
    destroyVarStore(id)
    store.getState().setVariableValue('$x', 'still-persisted')
    flushVarStorePersist(id)
    expect(readPersisted(id)).toEqual({ $x: 'still-persisted' })
    // …and the effect re-run re-registers the held instance
    ensureVarStoreRegistered(id, store)
    expect(getOrCreateVarStore(id)).toBe(store)
  })

  it('hydrateValues replaces in-memory state without persisting', () => {
    const id = freshId()
    const store = getOrCreateVarStore(id)
    store.getState().hydrateValues({ $x: 'from-other-window' })
    expect(store.getState().values['$x']).toBe('from-other-window')
    expect(readPersisted(id)).toBeNull()
  })
})
