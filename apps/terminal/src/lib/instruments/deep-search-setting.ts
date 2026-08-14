// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The deep-search consent flag: whether typed search text may leave the
 * device for Pairlens Cloud. A PRIVACY choice, not a performance one (local
 * search is faster), which is why it lives in the settings privacy group
 * next to the analytics consent — and, like that flag, it is deliberately
 * device-local, never synced.
 *
 * One choke point: this module gates BOTH the wave-3 fan-out branch in
 * useInstrumentSearch and the pairlens-intelligence plugin's server-bound
 * discovery paths (handed in as `discoverySearchAllowed` at activation). A
 * toggle that only gated the new call while the old plugin path still
 * shipped queries would be a false promise.
 *
 * Default on: matches the lean-in cloud posture. Hidden entirely (not
 * disabled) in standalone builds — with no server URL there is nothing to
 * consent to, and `isDeepSearchAllowed` is false regardless of the flag.
 */
import { usePersistedState } from '@/hooks/use-persisted-state'
import { createSyncedSetting } from '@/lib/settings/synced-setting'
import { appServerUrl } from '@/lib/api'

export const DEEP_SEARCH_KEY = 'discovery.deep-search'
export const DEEP_SEARCH_DEFAULT = true

export const deepSearchSetting = createSyncedSetting<boolean>(
  DEEP_SEARCH_KEY,
  DEEP_SEARCH_DEFAULT,
)

export function useDeepSearchEnabled(): [boolean, (value: boolean) => void] {
  return usePersistedState<boolean>(DEEP_SEARCH_KEY, DEEP_SEARCH_DEFAULT)
}

/** The single predicate every server-bound search path must pass. */
export function isDeepSearchAllowed(): boolean {
  return Boolean(appServerUrl) && deepSearchSetting.get()
}
