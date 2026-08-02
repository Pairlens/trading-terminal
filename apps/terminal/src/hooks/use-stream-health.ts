// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'

import type { StreamHealth } from '@/lib/stream-health'
import { streamHealth } from '@/lib/stream-health'

/**
 * Whether the market-data streams the app holds are actually delivering.
 * See lib/stream-health for why this is an external store rather than context.
 */
export function useStreamHealth(): StreamHealth {
  return useSyncExternalStore(
    streamHealth.subscribe,
    streamHealth.getSnapshot,
    // No streams exist during SSR/prerender, and `idle` renders identically to
    // the plugin status alone — so hydration can't mismatch.
    () => 'idle' as StreamHealth,
  )
}
