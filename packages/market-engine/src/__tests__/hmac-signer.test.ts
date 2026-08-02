// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { hmacSign } from '../hmac-signer'

describe('hmacSign', () => {
  it('produces a base64-encoded HMAC-SHA256 signature', async () => {
    const sig = await hmacSign('secret', 'message')
    expect(typeof sig).toBe('string')
    expect(sig.length).toBeGreaterThan(0)
    // Base64 should decode cleanly
    expect(() => atob(sig)).not.toThrow()
  })

  it('produces consistent output for same input', async () => {
    const sig1 = await hmacSign('key', 'data')
    const sig2 = await hmacSign('key', 'data')
    expect(sig1).toBe(sig2)
  })

  it('produces different output for different messages', async () => {
    const sig1 = await hmacSign('key', 'message1')
    const sig2 = await hmacSign('key', 'message2')
    expect(sig1).not.toBe(sig2)
  })
})
