// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The startup sweep runs before anything reads a credential, on every browser
 * boot, and it deletes. So the two things worth proving are that it removes
 * exactly the unreadable pre-vault format and that it leaves everything else
 * — vault ciphertext above all — untouched.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

const { sweepLegacyBrowserStorage } = await import('../legacy-sweep')

const SLOT = 'pairlens:keychain:'
/** `lock-config.ts`'s own storage slot — deliberately off the sync bus. */
const LOCK_CONFIG_SLOT = 'pairlens:security.lock'

beforeEach(() => {
  storage.clear()
})

describe('sweepLegacyBrowserStorage', () => {
  test('removes enc.v1 values, which no reader can open any more', () => {
    storage.setItem(`${SLOT}cred:okx`, 'enc.v1.aXY=.ZGF0YQ==')
    storage.setItem(`${SLOT}wallet:sol:secret`, 'enc.v1.aXY=.ZGF0YQ==')

    sweepLegacyBrowserStorage()

    expect(storage.getItem(`${SLOT}cred:okx`)).toBeNull()
    expect(storage.getItem(`${SLOT}wallet:sol:secret`)).toBeNull()
  })

  test('leaves vault ciphertext alone — that is live data', () => {
    storage.setItem(`${SLOT}cred:okx`, 'enc.v2.aXY=.ZGF0YQ==')
    sweepLegacyBrowserStorage()
    expect(storage.getItem(`${SLOT}cred:okx`)).toBe('enc.v2.aXY=.ZGF0YQ==')
  })

  test('leaves the plaintext lock verifier alone', () => {
    // Post-change profiles store it unencrypted, and deleting it would turn
    // the lock screen off underneath somebody who still has a password.
    storage.setItem(`${SLOT}security:lock-verifier`, '{"v":1}')
    sweepLegacyBrowserStorage()
    expect(storage.getItem(`${SLOT}security:lock-verifier`)).toBe('{"v":1}')
  })

  test('turns the terminal lock off when it takes the verifier with it', () => {
    // The pre-change browser build wrote the verifier as enc.v1 whether or not
    // a vault existed, so this profile shape is the common one.
    storage.setItem(`${SLOT}security:lock-verifier`, 'enc.v1.aXY=.ZGF0YQ==')
    storage.setItem(
      LOCK_CONFIG_SLOT,
      JSON.stringify({ version: 1, enabled: true }),
    )

    sweepLegacyBrowserStorage()

    expect(storage.getItem(`${SLOT}security:lock-verifier`)).toBeNull()
    // Left enabled, the overlay would still render on every lock event with
    // nothing to check a password against — and `verifyPassword` answering
    // 'missing' lets any non-empty string through it.
    const config = JSON.parse(storage.getItem(LOCK_CONFIG_SLOT)!) as {
      enabled: boolean
    }
    expect(config.enabled).toBe(false)
  })

  test('ignores everything outside the credential prefix', () => {
    storage.setItem('pairlens:settings', 'enc.v1.not-a-credential')
    storage.setItem('some-other-app', 'enc.v1.also-not')
    sweepLegacyBrowserStorage()
    expect(storage.getItem('pairlens:settings')).toBe('enc.v1.not-a-credential')
    expect(storage.getItem('some-other-app')).toBe('enc.v1.also-not')
  })

  test('is idempotent and safe on an empty profile', () => {
    sweepLegacyBrowserStorage()
    sweepLegacyBrowserStorage()
    expect(storage.snapshot()).toEqual({})
  })
})
