// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The order path's failure taxonomy.
 *
 * `orderFailReason` is what the trade funnel is read from, so a sealed vault
 * landing in `auth` would say "the venue rejected their key" about a user
 * whose key was never sent. It gets its own bucket, decided by TYPE rather
 * than by string matching, because the message is localized and the analytics
 * are not.
 */

import { describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from '@/lib/security/vault/__tests__/test-globals'

installBrowserGlobals()

const { orderFailReason } = await import('@/lib/market-data-provider')
const { VaultSealedError } = await import('@/lib/security/vault/vault-errors')

describe('orderFailReason', () => {
  test('a sealed vault gets its own bucket, not `auth`', () => {
    expect(orderFailReason(new VaultSealedError())).toBe('vault-sealed')
  })

  test('the typed check wins over the message text', () => {
    // The sealed message mentions "unlock", which the guardrail matcher would
    // otherwise claim via its "locked" substring.
    const err = new VaultSealedError(
      'Your credential vault is locked — unlock Pairlens to place live orders.',
    )
    expect(orderFailReason(err)).toBe('vault-sealed')
  })

  test('a real risk-guard lock is still a guardrail', () => {
    expect(
      orderFailReason(new Error('Orders are locked by a risk limit')),
    ).toBe('guardrail')
  })

  test('a venue auth failure is still auth', () => {
    expect(orderFailReason(new Error('invalid signature'))).toBe('auth')
  })

  test('non-Error throws still classify', () => {
    expect(orderFailReason('network timeout')).toBe('network')
    expect(orderFailReason(undefined)).toBe('unknown')
  })
})
