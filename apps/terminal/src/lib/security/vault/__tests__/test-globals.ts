// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bun's runtime has WebCrypto and BroadcastChannel but no `window` and no
 * `localStorage`, and `lib/platform.ts` decides `isStandalone` at import time.
 * So these have to be in place BEFORE the modules under test are imported —
 * every test file here calls `installBrowserGlobals()` and then `await
 * import(...)`s what it needs.
 */

class MemoryStorage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  /** Test-only: the raw contents, for asserting that nothing was written. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map)
  }
}

export type TestStorage = MemoryStorage

const globals = globalThis as unknown as {
  window?: unknown
  localStorage?: unknown
  indexedDB?: unknown
  navigator?: unknown
}

/**
 * Install a browser-shaped environment. `window` deliberately has no
 * `__TAURI_INTERNALS__`, so `isStandalone` resolves to false.
 *
 * It does carry `BroadcastChannel` and the event-listener pair, because
 * modules pulled in transitively probe for both — `lib/sync/sync-channel.ts`
 * checks `'BroadcastChannel' in window` at import time and falls back to
 * `window.addEventListener('storage', …)`, which on a bare stub is a
 * TypeError thrown from an import, three modules away from anything under
 * test. Reused across files: `window` is process-global and the first file to
 * install it wins, so the shape has to satisfy every later one.
 */
export function installBrowserGlobals(): TestStorage {
  const storage = new MemoryStorage()
  globals.localStorage = storage
  const existing = (globals.window ?? {}) as Record<string, unknown>
  existing.isSecureContext ??= true
  existing.BroadcastChannel ??= BroadcastChannel
  existing.addEventListener ??= () => undefined
  existing.removeEventListener ??= () => undefined
  // `lock-store` reloads the page when a sibling window broadcasts a device
  // erase. Any test file that imports lock-store puts that handler on the same
  // process-global bus every other file here shares, so the stub has to answer
  // for it — otherwise a `reset` message thrown by one file surfaces as a
  // TypeError inside an unrelated one.
  existing.location ??= { replace: () => undefined, reload: () => undefined }
  globals.window = existing
  // `lib/i18n.ts` reads `navigator.language` at import time and Bun's
  // `navigator` has no `language`, so anything that transitively pulls i18n in
  // throws from the import rather than from the code under test.
  const nav = (globals.navigator ?? {}) as Record<string, unknown>
  if (typeof nav.language !== 'string') {
    try {
      Object.defineProperty(nav, 'language', {
        value: 'en-US',
        configurable: true,
      })
    } catch {
      // A frozen navigator: i18n will fall back to 'en' on its own.
    }
  }
  globals.navigator = nav
  return storage
}

// ── A fake IndexedDB, just wide enough for lib/keychain.ts ───────────
//
// The pre-vault browser format keeps its AES key in IndexedDB, which Bun does
// not provide. This covers exactly the four calls keychain.ts makes — open,
// transaction/objectStore, get, put — so the legacy path can be exercised for
// real rather than stubbed away.

type PendingRequest<T> = {
  result: T | undefined
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  onupgradeneeded: (() => void) | null
  error: unknown
}

function fireLater(request: PendingRequest<unknown>, fail: boolean): void {
  queueMicrotask(() => {
    if (fail) {
      request.error = new Error('IndexedDB is unavailable')
      request.onerror?.()
      return
    }
    request.onsuccess?.()
  })
}

class FakeIndexedDb {
  private stores = new Map<string, Map<string, unknown>>()
  /** Flip to make every subsequent operation fail, like a locked profile. */
  failing = false

  open(name: string, _version?: number): unknown {
    const request: PendingRequest<unknown> = {
      result: undefined,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      error: null,
    }
    const fresh = !this.stores.has(name)
    if (fresh) this.stores.set(name, new Map())
    const db = this.database(name)
    request.result = db
    queueMicrotask(() => {
      if (this.failing) {
        request.error = new Error('IndexedDB is unavailable')
        request.onerror?.()
        return
      }
      if (fresh) request.onupgradeneeded?.()
      request.onsuccess?.()
    })
    return request
  }

  deleteDatabase(name: string): unknown {
    this.stores.delete(name)
    const request: PendingRequest<unknown> = {
      result: undefined,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      error: null,
    }
    fireLater(request, false)
    return request
  }

  private database(name: string): unknown {
    const entries = () => {
      const store = this.stores.get(name)
      if (!store) throw new Error('missing store')
      return store
    }
    const self = this
    return {
      createObjectStore: () => undefined,
      close: () => undefined,
      transaction: () => ({
        objectStore: () => ({
          get(key: string) {
            const request: PendingRequest<unknown> = {
              result: entries().get(key),
              onsuccess: null,
              onerror: null,
              onupgradeneeded: null,
              error: null,
            }
            fireLater(request, self.failing)
            return request
          },
          put(value: unknown, key: string) {
            const request: PendingRequest<unknown> = {
              result: undefined,
              onsuccess: null,
              onerror: null,
              onupgradeneeded: null,
              error: null,
            }
            if (!self.failing) entries().set(key, value)
            fireLater(request, self.failing)
            return request
          },
        }),
      }),
    }
  }
}

export function installFakeIndexedDb(): FakeIndexedDb {
  const fake = new FakeIndexedDb()
  globals.indexedDB = fake
  return fake
}

export type TestIndexedDb = FakeIndexedDb
