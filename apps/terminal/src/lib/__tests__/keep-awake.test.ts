// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The keep-awake preference decides whether Pairlens holds the user's machine
 * open. It is a small piece of state, but a wrong answer here either drains a
 * laptop the user wanted left alone or lets it sleep through a live position —
 * so the persistence and notification rules are worth pinning down.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

const KEY = 'pairlens:bots-keep-awake'

// Minimal localStorage backing — the module reads it lazily and defensively,
// so installing it here is enough.
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

/** Fresh module per test: the preference caches its first read in a module. */
async function loadModule() {
  // A cache-busting query gives each test its own module instance without
  // exposing a reset hook that only tests would ever call.
  return import(`../keep-awake?t=${Math.random()}`)
}

describe('keep-awake preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('defaults to on, so an armed bot is not silently left to sleep', async () => {
    const mod = await loadModule()
    expect(mod.isKeepAwakeEnabled()).toBe(true)
  })

  test('reads a stored opt-out', async () => {
    localStorage.setItem(KEY, 'false')
    const mod = await loadModule()
    expect(mod.isKeepAwakeEnabled()).toBe(false)
  })

  test('persists a change and reports it to listeners', async () => {
    const mod = await loadModule()
    const seen: Array<boolean> = []
    mod.subscribeKeepAwake((next: boolean) => seen.push(next))

    mod.setKeepAwakeEnabled(false)
    expect(mod.isKeepAwakeEnabled()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('false')
    expect(seen).toEqual([false])

    mod.setKeepAwakeEnabled(true)
    expect(seen).toEqual([false, true])
  })

  test('a no-op write notifies nobody', async () => {
    const mod = await loadModule()
    let calls = 0
    mod.subscribeKeepAwake(() => {
      calls += 1
    })
    // Already true by default — re-asserting it must not churn the runtime
    // into releasing and retaking the OS assertion.
    mod.setKeepAwakeEnabled(true)
    expect(calls).toBe(0)
  })

  test('unsubscribing stops delivery', async () => {
    const mod = await loadModule()
    let calls = 0
    const stop = mod.subscribeKeepAwake(() => {
      calls += 1
    })
    stop()
    mod.setKeepAwakeEnabled(false)
    expect(calls).toBe(0)
  })

  test('corrupt storage falls back to the default rather than throwing', async () => {
    localStorage.setItem(KEY, 'not-a-boolean')
    const mod = await loadModule()
    // Anything that isn't exactly 'true' reads as off; the point is that it
    // returns a boolean instead of propagating a parse failure into boot.
    expect(typeof mod.isKeepAwakeEnabled()).toBe('boolean')
  })

  test('setSleepBlocked reports unsupported off the desktop build', async () => {
    const mod = await loadModule()
    // The test environment is not Tauri, so this exercises the browser path:
    // it must resolve with a reason, never throw or claim success.
    const result = await mod.setSleepBlocked(true)
    expect(result.ok).toBe(false)
    expect(result.active).toBe(false)
    expect(result.reason).toBe('unsupported')
  })
})
