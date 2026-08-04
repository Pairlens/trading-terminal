// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Terminal-lock configuration — device-local, and deliberately off every
 * sync path.
 *
 * A lock that the App Server can reconfigure is not a lock. The sync
 * coordinator's pull step writes back *any* key the server returns and
 * re-emits it as a hydrate event, so anything routed through
 * `usePersistedState` / `createSyncedSetting` is settable from the server by
 * construction. This module therefore owns its own storage slot and its own
 * broadcast channel: no `emitWrite`, no `emitHydrate`, no coordinator.
 * The `security.` prefix is additionally on both blocklists so a later
 * refactor can't quietly put it back on the bus.
 *
 * Everything ships inert: `enabled` is false until the user sets a password,
 * and the trigger defaults below only matter from that moment on.
 */

import { onLockMessage, postLock } from './lock-channel'

/**
 * `'hard'` is the credential vault's own lock: it drops the data key as well
 * as covering the screen, which stops live bots and automations. Every other
 * reason leaves them running.
 */
export type LockReason =
  | 'startup'
  | 'idle'
  | 'periodic'
  | 'wake'
  | 'manual'
  | 'hard'

export type LockTriggers = {
  onStartup: boolean
  onIdle: { enabled: boolean; minutes: number }
  periodic: { enabled: boolean; minutes: number }
  onWake: boolean
  beforeTrade: { enabled: boolean; graceMinutes: number }
}

export type LockConfig = {
  version: 1
  /** Master switch. Only ever true while a verifier exists in the keychain. */
  enabled: boolean
  triggers: LockTriggers
}

/** Cross-window / blocklist key. Storage slot is `pairlens:` + this. */
export const LOCK_CONFIG_KEY = 'security.lock'
const STORAGE_KEY = `pairlens:${LOCK_CONFIG_KEY}`

/** Minutes offered for "lock after inactivity". */
export const IDLE_MINUTE_OPTIONS = [1, 5, 15, 30, 60] as const
/** Minutes offered for "lock every…". */
export const PERIODIC_MINUTE_OPTIONS = [60, 240, 480, 720, 1440] as const
/** Minutes a trade confirmation stays valid. 0 = ask every time. */
export const TRADE_GRACE_OPTIONS = [0, 1, 5, 15] as const

export const DEFAULT_LOCK_CONFIG: LockConfig = {
  version: 1,
  enabled: false,
  triggers: {
    onStartup: true,
    onIdle: { enabled: true, minutes: 15 },
    periodic: { enabled: false, minutes: 240 },
    onWake: true,
    beforeTrade: { enabled: false, graceMinutes: 0 },
  },
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Clamp to one of the offered options; anything else falls back. */
function option(
  value: unknown,
  allowed: ReadonlyArray<number>,
  fallback: number,
): number {
  return typeof value === 'number' && allowed.includes(value) ? value : fallback
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Coerce whatever storage hands back into a usable config.
 *
 * The input really is `unknown` — an older build, a hand edit, or a corrupt
 * write. Each field falls back independently so a bad payload costs one
 * setting rather than disabling the lock wholesale.
 */
export function sanitizeLockConfig(raw: unknown): LockConfig {
  const source = record(raw)
  const triggers = record(source.triggers)
  const idle = record(triggers.onIdle)
  const periodic = record(triggers.periodic)
  const beforeTrade = record(triggers.beforeTrade)
  const defaults = DEFAULT_LOCK_CONFIG.triggers

  return {
    version: 1,
    enabled: bool(source.enabled, DEFAULT_LOCK_CONFIG.enabled),
    triggers: {
      onStartup: bool(triggers.onStartup, defaults.onStartup),
      onIdle: {
        enabled: bool(idle.enabled, defaults.onIdle.enabled),
        minutes: option(
          idle.minutes,
          IDLE_MINUTE_OPTIONS,
          defaults.onIdle.minutes,
        ),
      },
      periodic: {
        enabled: bool(periodic.enabled, defaults.periodic.enabled),
        minutes: option(
          periodic.minutes,
          PERIODIC_MINUTE_OPTIONS,
          defaults.periodic.minutes,
        ),
      },
      onWake: bool(triggers.onWake, defaults.onWake),
      beforeTrade: {
        enabled: bool(beforeTrade.enabled, defaults.beforeTrade.enabled),
        graceMinutes: option(
          beforeTrade.graceMinutes,
          TRADE_GRACE_OPTIONS,
          defaults.beforeTrade.graceMinutes,
        ),
      },
    },
  }
}

// ── Live value ───────────────────────────────────────────────────────

let cached: LockConfig | null = null
const listeners = new Set<() => void>()
let bridged = false

function readStored(): LockConfig {
  if (typeof window === 'undefined') return DEFAULT_LOCK_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return sanitizeLockConfig(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_LOCK_CONFIG
  }
}

/** Sibling windows keep the same config without a round trip through sync. */
function ensureBridge(): void {
  if (bridged || typeof window === 'undefined') return
  bridged = true
  onLockMessage((message) => {
    if (message.type !== 'config') return
    cached = sanitizeLockConfig(message.config)
    for (const listener of listeners) listener()
  })
}

export function getLockConfig(): LockConfig {
  ensureBridge()
  cached ??= readStored()
  return cached
}

export function subscribeLockConfig(listener: () => void): () => void {
  ensureBridge()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function write(next: LockConfig): void {
  cached = next
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Quota / private mode — the in-memory value still governs this session.
    }
  }
  postLock({ type: 'config', config: next })
  for (const listener of listeners) listener()
}

export function setLockEnabled(enabled: boolean): void {
  write({ ...getLockConfig(), enabled })
}

export function updateLockTriggers(patch: Partial<LockTriggers>): void {
  const current = getLockConfig()
  write({
    ...current,
    triggers: sanitizeLockConfig({
      ...current,
      triggers: { ...current.triggers, ...patch },
    }).triggers,
  })
}

/** Wipe the config entirely — used by the destructive reset. */
export function clearLockConfig(): void {
  cached = DEFAULT_LOCK_CONFIG
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the reset reloads the app immediately after.
  }
}
