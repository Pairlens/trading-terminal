// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { isUrlAllowed } from '../sandbox/network-guard'

describe('isUrlAllowed', () => {
  test('exact hostname match', () => {
    expect(isUrlAllowed('https://api.okx.com/v5', ['api.okx.com'])).toBe(true)
    expect(isUrlAllowed('wss://ws.okx.com/public', ['ws.okx.com'])).toBe(true)
  })

  test('rejects host not in list', () => {
    expect(isUrlAllowed('https://evil.com/steal', ['api.okx.com'])).toBe(false)
    expect(isUrlAllowed('https://api.binance.com', ['api.okx.com'])).toBe(false)
  })

  test('wildcard matches subdomains but not the apex or a sibling', () => {
    expect(isUrlAllowed('https://api.okx.com', ['*.okx.com'])).toBe(true)
    expect(isUrlAllowed('https://ws.okx.com', ['*.okx.com'])).toBe(true)
    // apex is not matched by *.
    expect(isUrlAllowed('https://okx.com', ['*.okx.com'])).toBe(false)
    // suffix confusion attack
    expect(isUrlAllowed('https://okx.com.evil.com', ['*.okx.com'])).toBe(false)
    expect(isUrlAllowed('https://notokx.com', ['*.okx.com'])).toBe(false)
  })

  test('rejects disallowed protocols even for an allowed host', () => {
    expect(isUrlAllowed('file:///etc/passwd', ['api.okx.com'])).toBe(false)
    expect(isUrlAllowed('data:text/html,x', ['api.okx.com'])).toBe(false)
    expect(isUrlAllowed('blob:https://api.okx.com/abc', ['api.okx.com'])).toBe(
      false,
    )
  })

  test('empty allowlist denies everything', () => {
    expect(isUrlAllowed('https://api.okx.com', [])).toBe(false)
  })

  test('malformed url is denied', () => {
    expect(isUrlAllowed('not a url', ['api.okx.com'])).toBe(false)
    expect(isUrlAllowed('', ['api.okx.com'])).toBe(false)
  })

  test('hostname match is case-insensitive', () => {
    expect(isUrlAllowed('https://API.OKX.com', ['api.okx.com'])).toBe(true)
    expect(isUrlAllowed('https://api.okx.com', ['API.OKX.COM'])).toBe(true)
  })

  test('credentials/port in url do not bypass the check', () => {
    expect(isUrlAllowed('https://api.okx.com@evil.com', ['api.okx.com'])).toBe(
      false,
    )
    expect(isUrlAllowed('https://api.okx.com:8443', ['api.okx.com'])).toBe(true)
  })
})
