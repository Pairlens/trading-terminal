// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bun's runtime has WebCrypto and BroadcastChannel but no `window` and no
 * `localStorage`, and `lib/platform.ts` decides `isStandalone` at import time.
 * So these have to be in place BEFORE the modules under test are imported —
 * every test file here calls `installBrowserGlobals()` and then `await
 * import(...)`s what it needs.
 *
 * The install is scoped to the CALLING FILE, not the process: an `afterAll`
 * registered here removes the globals once the file's tests finish. Connector
 * suites in other packages decide platform behavior from `typeof window` at
 * call time (packages/market-engine/src/platform.ts), so a `window` leaked
 * past this package's files made Kalshi think it was in a browser and refuse
 * with "needs the desktop app" whenever every workspace was globbed into one
 * bun process (`bun test src/` from the repo root). Per-file re-install is
 * already the norm — each file calls this helper itself — so the restore
 * costs nothing under `bun run test` and per-package runs.
 */
import { afterAll } from 'bun:test'

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

/** One restore per file: repeat installs in the same file reuse the hook. */
let restorePending = false

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
  const hadWindow = 'window' in globals
  const priorWindow = globals.window
  const hadStorage = 'localStorage' in globals
  const priorStorage = globals.localStorage
  const navBefore = globals.navigator as Record<string, unknown> | undefined
  const hadNavLanguage = typeof navBefore?.['language'] === 'string'
  if (!restorePending) {
    restorePending = true
    afterAll(() => {
      restorePending = false
      if (hadWindow) globals.window = priorWindow
      else delete globals.window
      if (hadStorage) globals.localStorage = priorStorage
      else delete globals.localStorage
      if (!hadNavLanguage) {
        const nav = globals.navigator as Record<string, unknown> | undefined
        try {
          if (nav) delete nav['language']
        } catch {
          // A frozen navigator was never modified in the first place.
        }
      }
    })
  }
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
