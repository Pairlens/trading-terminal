// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The lock config comes back from localStorage as `unknown` — an older
 * build wrote it, or a hand edit did. A bad payload must cost one field,
 * never the whole lock, and must never widen a window (an out-of-range idle
 * timeout that resolves to "never" would silently disable the trigger the
 * user thinks is on).
 */
import { describe, expect, test } from 'bun:test'

import { DEFAULT_LOCK_CONFIG, sanitizeLockConfig } from '../lock-config'

describe('sanitizeLockConfig', () => {
  test('empty / corrupt input yields the shipped defaults', () => {
    expect(sanitizeLockConfig(null)).toEqual(DEFAULT_LOCK_CONFIG)
    expect(sanitizeLockConfig(undefined)).toEqual(DEFAULT_LOCK_CONFIG)
    expect(sanitizeLockConfig('nonsense')).toEqual(DEFAULT_LOCK_CONFIG)
    expect(sanitizeLockConfig(42)).toEqual(DEFAULT_LOCK_CONFIG)
    expect(sanitizeLockConfig({})).toEqual(DEFAULT_LOCK_CONFIG)
  })

  test('ships inert: the default is disabled', () => {
    expect(DEFAULT_LOCK_CONFIG.enabled).toBe(false)
  })

  test('keeps every recognized field', () => {
    const config = sanitizeLockConfig({
      version: 1,
      enabled: true,
      triggers: {
        onStartup: false,
        onIdle: { enabled: true, minutes: 30 },
        periodic: { enabled: true, minutes: 720 },
        onWake: false,
        beforeTrade: { enabled: true, graceMinutes: 5 },
      },
    })
    expect(config.enabled).toBe(true)
    expect(config.triggers.onStartup).toBe(false)
    expect(config.triggers.onIdle).toEqual({ enabled: true, minutes: 30 })
    expect(config.triggers.periodic).toEqual({ enabled: true, minutes: 720 })
    expect(config.triggers.onWake).toBe(false)
    expect(config.triggers.beforeTrade).toEqual({
      enabled: true,
      graceMinutes: 5,
    })
  })

  test('out-of-range durations fall back to the default, not to zero', () => {
    const config = sanitizeLockConfig({
      enabled: true,
      triggers: {
        onIdle: { enabled: true, minutes: 999 },
        periodic: { enabled: true, minutes: 7 },
        beforeTrade: { enabled: true, graceMinutes: 60 },
      },
    })
    expect(config.triggers.onIdle.minutes).toBe(
      DEFAULT_LOCK_CONFIG.triggers.onIdle.minutes,
    )
    expect(config.triggers.periodic.minutes).toBe(
      DEFAULT_LOCK_CONFIG.triggers.periodic.minutes,
    )
    expect(config.triggers.beforeTrade.graceMinutes).toBe(
      DEFAULT_LOCK_CONFIG.triggers.beforeTrade.graceMinutes,
    )
    // The enabled flags the user actually set survive the clamp.
    expect(config.triggers.onIdle.enabled).toBe(true)
  })

  test('wrong types per field cost only that field', () => {
    const config = sanitizeLockConfig({
      enabled: 'yes',
      triggers: {
        onStartup: 1,
        onIdle: 'never',
        onWake: false,
      },
    })
    expect(config.enabled).toBe(DEFAULT_LOCK_CONFIG.enabled)
    expect(config.triggers.onStartup).toBe(
      DEFAULT_LOCK_CONFIG.triggers.onStartup,
    )
    expect(config.triggers.onIdle).toEqual(DEFAULT_LOCK_CONFIG.triggers.onIdle)
    expect(config.triggers.onWake).toBe(false)
  })

  test('drops unknown fields and always reports version 1', () => {
    const config = sanitizeLockConfig({
      version: 7,
      enabled: true,
      unlockToken: 'from-the-server',
      triggers: { somethingElse: true },
    })
    expect(config.version).toBe(1)
    expect(Object.keys(config).sort()).toEqual([
      'enabled',
      'triggers',
      'version',
    ])
    expect(Object.keys(config.triggers).sort()).toEqual([
      'beforeTrade',
      'onIdle',
      'onStartup',
      'onWake',
      'periodic',
    ])
  })
})
