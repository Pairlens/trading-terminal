// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'

import type { CloudSyncPreferences } from '@/lib/sync/sync-preferences'
import type { SyncStatus } from '@/lib/sync/sync-coordinator'
import {
  cloudSyncVersion,
  getCloudSyncPreferences,
  subscribeCloudSyncPreferences,
} from '@/lib/sync/sync-preferences'
import {
  currentSyncStatus,
  onSyncStatusChange,
} from '@/lib/sync/sync-coordinator'

/**
 * React bindings over the cloud-sync switches. Everything reads the same
 * version counter, so flipping a switch in one window re-renders the section
 * in the next one too.
 */

const subscribePreferences = (onChange: () => void) =>
  subscribeCloudSyncPreferences(onChange)
const getVersion = () => cloudSyncVersion()
// The server render has no localStorage; keep the snapshot stable there.
const getServerVersion = () => 0

export function useCloudSyncVersion(): number {
  return useSyncExternalStore(
    subscribePreferences,
    getVersion,
    getServerVersion,
  )
}

export function useCloudSyncPreferences(): CloudSyncPreferences {
  useCloudSyncVersion()
  return getCloudSyncPreferences()
}

// Bound to the module-level status bus, not to whatever coordinator happened
// to exist at subscribe time: `useSyncExternalStore` only re-subscribes when
// the subscribe function's identity changes, and a coordinator can be
// destroyed and replaced underneath an open Cloud Sync section.
const subscribeStatus = (onChange: () => void) => onSyncStatusChange(onChange)
const getStatus = (): SyncStatus => currentSyncStatus()
const getServerStatus = (): SyncStatus => 'idle'

/** Live transport status — 'idle' in builds with no App Server configured. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, getStatus, getServerStatus)
}
