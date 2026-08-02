// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useRef, useSyncExternalStore } from 'react'

import { usePluginHost } from './use-plugin-host'

// In-process emitter for same-tab storage reactivity.
// The `storage` event only fires in other tabs; this fills the gap.
const storageListeners = new Map<string, Set<() => void>>()

function emitStorageChange(fullKey: string): void {
  const listeners = storageListeners.get(fullKey)
  if (listeners) {
    for (const fn of listeners) fn()
  }
}

export function usePluginStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const host = usePluginHost()
  const fullKey = `plugin:${host.pluginId}:${key}`

  // Stabilize defaultValue to prevent infinite re-render loops
  // when callers pass object/array literals (e.g. usePluginStorage('key', {}))
  const defaultRef = useRef(defaultValue)

  const value = useSyncExternalStore(
    (onStoreChange) => {
      // Same-tab listener
      let set = storageListeners.get(fullKey)
      if (!set) {
        set = new Set()
        storageListeners.set(fullKey, set)
      }
      set.add(onStoreChange)

      // Cross-tab listener
      const handler = (e: StorageEvent) => {
        if (e.key === fullKey) onStoreChange()
      }
      window.addEventListener('storage', handler)

      return () => {
        set.delete(onStoreChange)
        if (set.size === 0) storageListeners.delete(fullKey)
        window.removeEventListener('storage', handler)
      }
    },
    () => host.getStorage(key, defaultRef.current),
  )

  const setValue = useCallback(
    (newValue: T) => {
      host.setStorage(key, newValue)
      emitStorageChange(fullKey)
    },
    [host, key, fullKey],
  )

  return [value, setValue]
}
