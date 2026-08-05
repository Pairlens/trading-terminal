// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { isNewer } from '@/lib/web-updater'

describe('isNewer', () => {
  test('detects a strictly newer release', () => {
    expect(isNewer('0.1.5', '0.1.4')).toBe(true)
    expect(isNewer('0.2.0', '0.1.9')).toBe(true)
    expect(isNewer('1.0.0', '0.9.9')).toBe(true)
    // Numeric compare, not lexicographic.
    expect(isNewer('0.1.10', '0.1.9')).toBe(true)
  })

  test('same or older never prompts', () => {
    expect(isNewer('0.1.4', '0.1.4')).toBe(false)
    // A rollback deploy must not nag tabs already on the pulled version.
    expect(isNewer('0.1.3', '0.1.4')).toBe(false)
    expect(isNewer('0.9.9', '1.0.0')).toBe(false)
  })

  test('anything that is not plain x.y.z compares as not-newer', () => {
    expect(isNewer('1.2', '0.1.4')).toBe(false)
    expect(isNewer('1.2.3.4', '0.1.4')).toBe(false)
    expect(isNewer('9.9.9', '0.0.0-dev')).toBe(false)
    expect(isNewer('0.1.5-beta', '0.1.4')).toBe(false)
    // SPA fallback HTML that slipped through as a "version".
    expect(isNewer('<!doctype html>', '0.1.4')).toBe(false)
  })
})
