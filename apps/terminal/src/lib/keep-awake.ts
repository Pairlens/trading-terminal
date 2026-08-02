// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Idle-sleep inhibition, used while trading bots are armed.
 *
 * Bots run on this machine and nowhere else — no server is watching the market
 * on the user's behalf — so a laptop that suspends mid-position simply stops
 * managing it. Holding a power assertion for as long as bots are armed closes
 * the most common way that happens by accident.
 *
 * Desktop only. In a browser build there is no assertion to take (the Wake Lock
 * API only keeps the *screen* on, which is not the same promise), so the caller
 * gets `false` back and the UI says plainly that sleep can't be held here.
 */
import { isStandalone } from './platform'

let held = false
/** Serializes acquire/release so a rapid toggle can't leave the two swapped. */
let chain: Promise<unknown> = Promise.resolve()

export type KeepAwakeResult =
  /** The assertion is held (or released, per the request). */
  | { ok: true; active: boolean }
  /** The platform can't hold one, or the OS refused. */
  | {
      ok: false
      active: false
      reason: 'unsupported' | 'failed'
      error?: string
    }

/**
 * Ask the OS to stay awake, or stop asking.
 *
 * Only idle sleep is inhibited: closing the lid or picking Sleep from the menu
 * still suspends the machine. We hold the system open; we don't fight the user.
 */
export function setSleepBlocked(
  blocked: boolean,
  reason = 'Pairlens trading bots are armed',
): Promise<KeepAwakeResult> {
  const run = chain.then(async (): Promise<KeepAwakeResult> => {
    if (!isStandalone) {
      return { ok: false, active: false, reason: 'unsupported' }
    }
    if (blocked === held) return { ok: true, active: held }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const active = await invoke<boolean>('sleep_block_set', {
        blocked,
        reason,
      })
      held = active
      return { ok: true, active }
    } catch (err) {
      return {
        ok: false,
        active: false,
        reason: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
  chain = run.catch(() => undefined)
  return run
}

/** Whether this build can hold the machine awake at all. */
export const canBlockSleep = isStandalone

// ── User preference ─────────────────────────────────────────────────────────
//
// Holding someone's machine open is a real imposition — a laptop that won't
// idle is a laptop burning battery — so it is a setting the user can see and
// switch off, not something the runtime does behind their back.
//
// Device-local by design: whether THIS computer should stay awake is not a fact
// about the user's account, and syncing it to a desktop that is always plugged
// in would be meaningless. Hence localStorage with no sync channel.

const PREFERENCE_KEY = 'pairlens:bots-keep-awake'

/**
 * Defaults to on.
 *
 * The alternative — bots armed, machine free to sleep — is precisely the
 * failure the bots page warns about, and it would arrive silently. Defaulting
 * on and showing a switch that says so is the honest arrangement: the
 * imposition is visible and one click from being undone.
 */
const DEFAULT_ENABLED = true

let enabled: boolean | null = null
const preferenceListeners = new Set<(enabled: boolean) => void>()

/** Whether the user wants this machine kept awake while bots are armed. */
export function isKeepAwakeEnabled(): boolean {
  if (enabled !== null) return enabled
  if (typeof localStorage === 'undefined') return DEFAULT_ENABLED
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY)
    enabled = raw === null ? DEFAULT_ENABLED : raw === 'true'
  } catch {
    enabled = DEFAULT_ENABLED
  }
  return enabled
}

export function setKeepAwakeEnabled(next: boolean): void {
  if (isKeepAwakeEnabled() === next) return
  enabled = next
  try {
    localStorage.setItem(PREFERENCE_KEY, String(next))
  } catch {
    // Ignore quota errors — the in-memory value still governs this session
  }
  for (const listener of preferenceListeners) listener(next)
}

/** Notified when the preference changes, so the runtime can re-sync. */
export function subscribeKeepAwake(
  listener: (enabled: boolean) => void,
): () => void {
  preferenceListeners.add(listener)
  return () => preferenceListeners.delete(listener)
}

/**
 * Re-read the assertion from the Rust side. The webview can reload without the
 * process restarting, which would otherwise leave this module's cached flag
 * disagreeing with reality.
 */
export async function refreshSleepBlocked(): Promise<boolean> {
  if (!isStandalone) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    held = await invoke<boolean>('sleep_block_active')
  } catch {
    held = false
  }
  return held
}
