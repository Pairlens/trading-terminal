// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'
import { getLocalIndexVersion, subscribeLocalIndex } from './local-index'

/** Re-render when the local instrument index (re)builds. */
export function useLocalIndexVersion(): number {
  return useSyncExternalStore(
    subscribeLocalIndex,
    getLocalIndexVersion,
    getLocalIndexVersion,
  )
}
