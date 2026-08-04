// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'

import { isWindowHidden, subscribeWindowHidden } from '@/lib/window-visibility'

function subscribe(onChange: () => void): () => void {
  return subscribeWindowHidden(() => onChange())
}

/**
 * Whether this window is hidden in the background (desktop background mode).
 * Always `false` in the browser.
 *
 * `useSyncExternalStore` on purpose: the value changes at most twice per hide,
 * so this costs nothing per render and never schedules work of its own.
 */
export function useWindowHidden(): boolean {
  return useSyncExternalStore(subscribe, isWindowHidden, () => false)
}
