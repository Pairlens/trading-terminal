// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Hard lock — the only action that drops the data key, and therefore the only
 * one that stops live automations.
 *
 * Run against the real lock store rather than a stub, because the interesting
 * case is the interaction: `lockNow` is a no-op when the screen lock is turned
 * off, and the vault still has to end up sealed. A user who reaches for this
 * because someone walked up behind them does not also have the terminal lock
 * configured, and "nothing happened" would be the worst possible answer.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

const { hardLock } = await import('../vault-hard-lock')
const { __resetVaultSessionForTests, isVaultUnlocked, setDek } =
  await import('../vault-session')
const { generateRawDek, importDek } = await import('../vault-crypto')
const { getLockState, isTerminalLocked, unlockNow, clearLockState } =
  await import('../../lock-store')
const { setLockEnabled, clearLockConfig } = await import('../../lock-config')

beforeEach(() => {
  storage.clear()
  __resetVaultSessionForTests()
  clearLockConfig()
  clearLockState()
  unlockNow()
})

async function openVault(): Promise<void> {
  setDek(await importDek(generateRawDek()), { broadcast: false })
}

describe('hardLock', () => {
  test('seals the vault and covers the screen', async () => {
    setLockEnabled(true)
    await openVault()
    expect(isVaultUnlocked()).toBe(true)

    hardLock()

    expect(isVaultUnlocked()).toBe(false)
    expect(isTerminalLocked()).toBe(true)
    // The overlay reads `security.lock.reason.${reason}`, and 'hard' is the
    // only reason whose copy may promise that automations stopped.
    expect(getLockState().reason).toBe('hard')
  })

  test('still seals when the screen lock is switched off', async () => {
    setLockEnabled(false)
    await openVault()

    hardLock()

    // `lockNow` did nothing — the lock is disabled — and the key is gone
    // anyway. Sealing first is what makes that true.
    expect(isVaultUnlocked()).toBe(false)
    expect(isTerminalLocked()).toBe(false)
  })

  test('is safe on an already-sealed vault', () => {
    setLockEnabled(true)
    expect(isVaultUnlocked()).toBe(false)
    expect(() => {
      hardLock()
    }).not.toThrow()
    expect(isVaultUnlocked()).toBe(false)
  })

  test('an ordinary lock leaves the key alone, so bots keep trading', async () => {
    setLockEnabled(true)
    await openVault()

    const { lockNow } = await import('../../lock-store')
    lockNow('manual')

    // The whole automations policy in one assertion: the screen is covered,
    // the vault is not. Breaking this turns "my laptop locked" into "my
    // stop-loss stopped running".
    expect(isTerminalLocked()).toBe(true)
    expect(isVaultUnlocked()).toBe(true)
  })
})
