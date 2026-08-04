// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Sync Channel — typed event bus connecting usePersistedState hooks
 * to the SyncCoordinator without React context.
 *
 * - Outbound (write): hooks notify the coordinator when a value changes
 * - Inbound (hydrate): coordinator pushes cloud-merged values to hooks
 * - Cross-window: writes are broadcast to sibling windows (Tauri
 *   multi-window / browser tabs) and re-emitted there as hydrate events.
 *   The writer already persisted to the shared localStorage, so receivers
 *   only refresh in-memory state — hydrate never triggers a write, which
 *   keeps the SyncCoordinator from double-syncing and prevents loops.
 */

type Listener = (key: string, value: unknown) => void

const writeListeners = new Set<Listener>()
const hydrateListeners = new Set<Listener>()

// Keys that never cross window boundaries: secrets stay in their storage
// backends, and the cached theme CSS is large and re-derived per window.
function isBridgeBlocked(key: string): boolean {
  if (key === 'theme.cachedCss') return true
  // The terminal lock has its own cross-window channel; keeping its keys off
  // this one means a hydrate event can never move lock state.
  if (key.startsWith('security.')) return true
  if (key.startsWith('credentials-store:')) return true
  if (key.startsWith('keychain:')) return true
  if (key.startsWith('pairlens:keychain:')) return true
  return false
}

type BridgeMessage = { key: string; value: unknown }

const bridge: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('pairlens:sync')
    : null

if (bridge) {
  bridge.onmessage = (event: MessageEvent<BridgeMessage>) => {
    const { key, value } = event.data
    for (const fn of hydrateListeners) fn(key, value)
  }
} else if (typeof window !== 'undefined') {
  // Older webviews without BroadcastChannel: the `storage` event fires in
  // sibling windows on any localStorage write, carrying the same payload.
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith('pairlens:') || event.newValue === null) return
    if (event.key.startsWith('pairlens:sync-ts:')) return
    const key = event.key.slice('pairlens:'.length)
    if (isBridgeBlocked(key)) return
    try {
      const value: unknown = JSON.parse(event.newValue)
      for (const fn of hydrateListeners) fn(key, value)
    } catch {
      // Non-JSON payloads (raw caches) aren't sync-channel values
    }
  })
}

/** Called by usePersistedState on every write. */
export function emitWrite(key: string, value: unknown): void {
  for (const fn of writeListeners) fn(key, value)
  if (bridge && !isBridgeBlocked(key)) {
    try {
      bridge.postMessage({ key, value } satisfies BridgeMessage)
    } catch {
      // Value not structured-cloneable — skip broadcast, local state is fine
    }
  }
}

/** Subscribe to writes from hooks. Returns unsubscribe. */
export function onWrite(listener: Listener): () => void {
  writeListeners.add(listener)
  return () => writeListeners.delete(listener)
}

/** Called by SyncCoordinator to push cloud-merged values to hooks. */
export function emitHydrate(key: string, value: unknown): void {
  for (const fn of hydrateListeners) fn(key, value)
}

/** Subscribe to hydration events. Returns unsubscribe. */
export function onHydrate(listener: Listener): () => void {
  hydrateListeners.add(listener)
  return () => hydrateListeners.delete(listener)
}
