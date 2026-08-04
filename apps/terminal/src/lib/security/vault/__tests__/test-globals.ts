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
