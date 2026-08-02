// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

import { emitWrite, onHydrate, onWrite } from '@/lib/sync/sync-channel'

export const STORAGE_PREFIX = 'pairlens:'

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`

  const readStoredValue = useCallback((): T | null => {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        return JSON.parse(stored) as T
      }
    } catch {
      // Ignore parse errors, treat as missing.
    }

    return null
  }, [storageKey])

  const [state, setStateRaw] = useState<T>(() => {
    return readStoredValue() ?? defaultValue
  })

  // Mirror the latest state in a ref so the setter can resolve the functional
  // updater form WITHOUT running side effects inside the React updater. React
  // invokes updater functions during the render phase, so emitting a cross-
  // instance write from there synchronously calls setState on sibling instances
  // mid-render ("Cannot update a component while rendering a different one").
  const stateRef = useRef(state)
  stateRef.current = state

  // Hydrate from localStorage after mount as a fallback for environments where
  // the lazy initializer couldn't access browser storage during first render.
  useEffect(() => {
    const stored = readStoredValue()
    if (stored !== null) {
      setStateRaw(stored)
    }
  }, [readStoredValue])

  // Listen for cloud-hydrated values pushed by the SyncCoordinator after login.
  useEffect(() => {
    return onHydrate((hydratedKey, value) => {
      if (hydratedKey === key) {
        setStateRaw(value as T)
      }
    })
  }, [key])

  // Listen for writes from other hook instances sharing the same key.
  useEffect(() => {
    return onWrite((writtenKey, value) => {
      if (writtenKey === key) {
        setStateRaw(value as T)
      }
    })
  }, [key])

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      // Resolve the next value against the ref (kept current on every render and
      // updated synchronously below) so back-to-back updates in the same tick
      // still compose, all without a side-effecting updater.
      const next =
        typeof value === 'function'
          ? (value as (prev: T) => T)(stateRef.current)
          : value
      stateRef.current = next

      setStateRaw(next)

      // Persisting to localStorage is a pure browser API (no React update) so it
      // can stay synchronous. But emitWrite() synchronously calls setState on
      // every other instance sharing this key, so defer it to a microtask: that
      // keeps those sibling updates out of the current render phase.
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Ignore storage errors (quota, private browsing)
      }
      queueMicrotask(() => emitWrite(key, next))
    },
    [storageKey, key],
  )

  return [state, setState]
}
