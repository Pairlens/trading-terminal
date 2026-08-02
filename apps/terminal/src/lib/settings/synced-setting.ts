// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { emitWrite, onHydrate, onWrite } from '@/lib/sync/sync-channel'

/**
 * Framework-agnostic accessor for a `usePersistedState`-backed setting.
 *
 * The desktop OS menu lives outside the React tree, so it can't use the
 * `usePersistedState` hook. This mirrors that hook's storage + sync-channel
 * contract exactly: it reads straight from localStorage, writes through the
 * same `emitWrite` bus so every hook instance (and every sibling window)
 * sharing the key updates, and lets non-React callers subscribe to changes made
 * anywhere — including the settings dialog and cloud hydration.
 *
 * Both UI layers therefore stay in lockstep from a single `key`/`defaultValue`
 * pair — the same source of truth the hook consumes. See
 * `@/lib/recent-tickers` for the original hand-rolled version this generalizes.
 */
export type SyncedSetting<T> = {
  readonly key: string
  /** Read the current value, falling back to `defaultValue`. */
  get: () => T
  /** Persist a value and broadcast it to every other reader of this key. */
  set: (value: T) => void
  /** Observe changes from any source. Returns an unsubscribe function. */
  subscribe: (listener: (value: T) => void) => () => void
}

export function createSyncedSetting<T>(
  key: string,
  defaultValue: T,
): SyncedSetting<T> {
  const storageKey = `${STORAGE_PREFIX}${key}`

  const get = (): T => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) return JSON.parse(stored) as T
    } catch {
      // Ignore storage/parse errors, fall through to the default.
    }
    return defaultValue
  }

  const set = (value: T): void => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Ignore storage errors (quota, private browsing).
    }
    // Callers are menu clicks / event handlers, never React render, so the
    // synchronous emit is safe here (unlike usePersistedState, which defers it).
    emitWrite(key, value)
  }

  const subscribe = (listener: (value: T) => void): (() => void) => {
    const offWrite = onWrite((writtenKey, value) => {
      if (writtenKey === key) listener(value as T)
    })
    const offHydrate = onHydrate((hydratedKey, value) => {
      if (hydratedKey === key) listener(value as T)
    })
    return () => {
      offWrite()
      offHydrate()
    }
  }

  return { key, get, set, subscribe }
}
