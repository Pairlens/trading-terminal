// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Is there anything in the vault?" — the question that stands between a user
 * and throwing away the only way into their own API keys.
 *
 * The bias is the point: this answers `true` whenever it cannot be sure. A
 * false `true` costs someone one extra protector they did not need to keep. A
 * false `false` costs them every key they own, with no recovery path, and the
 * app would have handed them the button.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

const { hasVaultedValues } = await import('../vault-values')

const SLOT = 'pairlens:keychain:'

beforeEach(() => {
  storage.clear()
})

describe('hasVaultedValues (browser)', () => {
  test('an empty store holds nothing', async () => {
    expect(await hasVaultedValues()).toBe(false)
  })

  test('finds an enc.v2 value', async () => {
    storage.setItem(`${SLOT}cred:okx`, 'enc.v2.aXY=.ZGF0YQ==')
    expect(await hasVaultedValues()).toBe(true)
  })

  test('legacy values do not count — they are not what a protector opens', async () => {
    storage.setItem(`${SLOT}cred:okx`, 'enc.v1.aXY=.ZGF0YQ==')
    expect(await hasVaultedValues()).toBe(false)
  })

  test('ignores everything outside the credential prefix', async () => {
    storage.setItem('pairlens:security.vault', 'enc.v2.not-a-credential')
    storage.setItem('some-other-app', 'enc.v2.also-not')
    expect(await hasVaultedValues()).toBe(false)
  })

  test('one vaulted value among many is enough', async () => {
    storage.setItem(`${SLOT}cred:a`, 'enc.v1.aXY=.ZGF0YQ==')
    storage.setItem(`${SLOT}cred:b`, 'plaintext-from-2024')
    storage.setItem(`${SLOT}wallet:sol:secret`, 'enc.v2.aXY=.ZGF0YQ==')
    expect(await hasVaultedValues()).toBe(true)
  })
})
