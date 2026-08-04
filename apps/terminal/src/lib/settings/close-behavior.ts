// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "When you close the last window" — the desktop app's close behavior.
 *
 * Everything the terminal keeps running for you — armed bots, alert rules,
 * workflow steps that still owe a stop-loss — lives in this webview. Closing
 * the last window used to take all of it down without a word. Now it is a
 * choice, and the choice lives in Rust: it has to be readable from a native
 * window-close callback and correct before any webview exists, so localStorage
 * could never be the source of truth here.
 *
 * That is also why this deliberately is NOT a `createSyncedSetting` — that
 * helper treats localStorage as truth. What we borrow is its *shape* (get /
 * set / subscribe) and its cross-window bus, so sibling Tauri windows update
 * instantly. The key is on the SyncCoordinator's blocklist: which behavior a
 * machine should have is a fact about the machine, not the account.
 *
 * Every export no-ops in a browser build.
 */
import { emitWrite, onHydrate, onWrite } from '@/lib/sync/sync-channel'
import { isStandalone } from '@/lib/platform'

export type CloseBehavior = 'quit' | 'background'

export type CloseBehaviorInfo = {
  behavior: CloseBehavior
  /** Whether a way back to a hidden window exists on this machine. */
  trayAvailable: boolean
  /** Whether this OS needs a tray icon for background mode at all. */
  trayRequired: boolean
}

/** Cross-window broadcast key. Never written to localStorage. */
export const CLOSE_BEHAVIOR_KEY = 'desktop.closeBehavior'

export function isCloseBehavior(value: unknown): value is CloseBehavior {
  return value === 'quit' || value === 'background'
}

/**
 * Validate a payload that crossed the IPC (or the cross-window bus) before it
 * reaches the UI. Pure, so it is the part worth testing: a malformed payload
 * must degrade to "we don't know" rather than render a radio group that lies
 * about what the app will do.
 */
export function parseCloseBehaviorInfo(raw: unknown): CloseBehaviorInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isCloseBehavior(record.behavior)) return null
  return {
    behavior: record.behavior,
    // Absent flags are read conservatively: a tray we cannot confirm is a tray
    // we should not promise.
    trayAvailable: record.trayAvailable === true,
    trayRequired: record.trayRequired === true,
  }
}

let snapshot: CloseBehaviorInfo | null = null
const listeners = new Set<(info: CloseBehaviorInfo) => void>()

function publish(info: CloseBehaviorInfo): void {
  snapshot = info
  for (const listener of listeners) listener(info)
}

// Sibling windows (and this one) stay in lockstep over the sync-channel
// bridge. The coordinator ignores the key, so this never reaches the cloud.
let bridged = false
function ensureBridge(): void {
  if (bridged) return
  bridged = true
  const receive = (key: string, value: unknown) => {
    if (key !== CLOSE_BEHAVIOR_KEY) return
    const info = parseCloseBehaviorInfo(value)
    if (info) publish(info)
  }
  onWrite(receive)
  onHydrate(receive)
}

/** Last known value, or `null` before the first load (and in the browser). */
export function getCloseBehaviorSnapshot(): CloseBehaviorInfo | null {
  return snapshot
}

async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // Dynamic import so nothing Tauri-shaped lands in the browser bundle.
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/** Read the behavior from Rust. `null` off desktop. */
export async function loadCloseBehavior(): Promise<CloseBehaviorInfo | null> {
  if (!isStandalone) return null
  ensureBridge()
  const info = parseCloseBehaviorInfo(await invokeTauri('close_behavior_get'))
  if (info) publish(info)
  return info
}

/**
 * Ask for a behavior and report what was **actually** applied.
 *
 * Rust may refuse: on a Linux desktop with no usable system tray, background
 * mode would hide the app somewhere the user cannot reach, so it comes back as
 * `quit` with `trayAvailable: false` and the UI says why.
 */
export async function setCloseBehavior(
  next: CloseBehavior,
): Promise<CloseBehaviorInfo | null> {
  if (!isStandalone) return null
  ensureBridge()
  const info = parseCloseBehaviorInfo(
    await invokeTauri('close_behavior_set', { behavior: next }),
  )
  if (info) {
    publish(info)
    emitWrite(CLOSE_BEHAVIOR_KEY, info)
  }
  return info
}

/** Observe changes from any window. Returns unsubscribe. */
export function subscribeCloseBehavior(
  listener: (info: CloseBehaviorInfo) => void,
): () => void {
  ensureBridge()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Quit for real, in either mode. Routed through Rust rather than
 * `window.close()` so the close handler can tell a deliberate quit from a
 * closed window and never turns this into a hide.
 */
export async function quitApp(): Promise<void> {
  if (!isStandalone) return
  await invokeTauri('app_quit')
}

// ── Confirmed quit ───────────────────────────────────────────────────

let confirmQuit: (() => void) | null = null

/**
 * Register the surface that asks before quitting. Set by the global
 * `<QuitConfirm />`; cleared on unmount.
 */
export function setQuitConfirmHandler(handler: (() => void) | null): void {
  confirmQuit = handler
}

/**
 * The entry point every quit affordance uses — the Desktop settings button and
 * the Ctrl+Q accelerator alike.
 *
 * Quitting stops armed bots dead, mid-position, and abandons a workflow `wait`
 * step that still owes a stop-loss. The button always meant that deliberately;
 * Ctrl+Q from the accelerator runner fires regardless of focus, so a stray
 * chord typed into a chat box or a bot script used to end the process outright.
 * Routing both through one handler means the confirmation cannot be true of one
 * path and not the other.
 */
export function requestQuitApp(): void {
  if (!isStandalone) return
  if (confirmQuit) {
    confirmQuit()
    return
  }
  void quitApp()
}

/**
 * Push the tray menu's labels over in the user's language. Rust builds the
 * tray in English before the webview exists, so this is how it gets localized
 * — on boot and again on every language change. No-op on macOS (no tray) and
 * in the browser.
 */
export async function setTrayLabels(show: string, quit: string): Promise<void> {
  if (!isStandalone) return
  try {
    await invokeTauri('tray_set_labels', { show, quit })
  } catch {
    // Cosmetic: an English tray beats a failed boot.
  }
}
