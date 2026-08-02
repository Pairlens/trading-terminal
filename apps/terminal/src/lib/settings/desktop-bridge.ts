// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { ColorMode } from './color-mode'

/**
 * Bridge between the OS menu (which lives outside React) and the handful of
 * settings actions that can only be performed from inside the React tree:
 *
 * - **Color mode** is owned by `next-themes`, whose `setTheme` only exists on
 *   the `useTheme()` hook, and whose in-window state doesn't react to raw
 *   localStorage writes.
 * - **Sign in / out** needs the live session, the auth client, and the router.
 *
 * A single React component (`DesktopMenuBridge`) publishes the current values
 * and callbacks here; the menu reads the latest snapshot and re-renders its
 * check/enabled state whenever it changes. Everything else the menu drives goes
 * straight through the sync-channel or a zustand store, no bridge required.
 */
export type DesktopBridgeState = {
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  /** Whether a user session is currently active. */
  hasSession: boolean
  /** Whether an App Server is configured (sign-in is meaningless without one). */
  hasAppServer: boolean
  signIn: () => void
  signOut: () => void
}

let snapshot: DesktopBridgeState | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Called by the React bridge component whenever its inputs change. */
export function publishDesktopBridge(next: DesktopBridgeState): void {
  snapshot = next
  notify()
}

/**
 * Merge a partial update into the snapshot and notify listeners.
 *
 * Used by `setColorMode` so the menu's checkmark is re-asserted on every click,
 * even when the click is a no-op for next-themes (re-selecting the active mode):
 * a no-op `setTheme` never re-runs the bridge effect, so without this the muda
 * check state — cleared optimistically on click — would never be restored.
 */
export function patchDesktopBridge(partial: Partial<DesktopBridgeState>): void {
  if (!snapshot) return
  snapshot = { ...snapshot, ...partial }
  notify()
}

/** Latest published state, or null before the bridge component mounts. */
export function getDesktopBridge(): DesktopBridgeState | null {
  return snapshot
}

/** Subscribe to bridge updates (session change, color-mode change). */
export function onDesktopBridgeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
