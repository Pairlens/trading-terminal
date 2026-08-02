// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import { allowRequest, clientIpOf, resetRateLimiter } from '../rate-limit'

function reqFrom(ip: string): Request {
  return new Request('http://registry.local/api/plugins/x/module', {
    headers: { 'x-forwarded-for': ip },
  })
}

describe('clientIpOf', () => {
  test('takes the first hop of x-forwarded-for', () => {
    const req = new Request('http://registry.local/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(clientIpOf(req)).toBe('203.0.113.7')
  })

  test('falls back to a shared bucket without a forwarded header', () => {
    expect(clientIpOf(new Request('http://registry.local/'))).toBe('unknown')
  })
})

describe('allowRequest', () => {
  beforeEach(() => {
    resetRateLimiter()
  })

  test('admits requests under the per-minute limit', () => {
    const now = 1_000_000
    for (let i = 0; i < 120; i++) {
      expect(allowRequest(reqFrom('198.51.100.1'), now + i)).toBe(true)
    }
  })

  test('rejects once the window budget is exhausted', () => {
    const now = 1_000_000
    for (let i = 0; i < 120; i++) allowRequest(reqFrom('198.51.100.2'), now)
    expect(allowRequest(reqFrom('198.51.100.2'), now + 1)).toBe(false)
  })

  test('tracks IPs independently', () => {
    const now = 1_000_000
    for (let i = 0; i < 121; i++) allowRequest(reqFrom('198.51.100.3'), now)
    expect(allowRequest(reqFrom('198.51.100.3'), now)).toBe(false)
    expect(allowRequest(reqFrom('198.51.100.4'), now)).toBe(true)
  })

  test('resets after the window elapses', () => {
    const now = 1_000_000
    for (let i = 0; i < 121; i++) allowRequest(reqFrom('198.51.100.5'), now)
    expect(allowRequest(reqFrom('198.51.100.5'), now)).toBe(false)
    expect(allowRequest(reqFrom('198.51.100.5'), now + 60_001)).toBe(true)
  })
})
