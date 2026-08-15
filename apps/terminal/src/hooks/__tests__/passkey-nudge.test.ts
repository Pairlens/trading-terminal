// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The offer is only worth making under four conditions at once, and each one
 * removed turns it into a security prompt with no problem behind it:
 *
 *   a vault exists          desktop keeps keys in the OS keychain, nothing seals
 *   no passkey yet          the one-tap unlock already exists
 *   PRF is supported        `tauri://localhost` is no WebAuthn origin
 *   the venue needs a key   every other venue streams fine while sealed
 *
 * There is no hook renderer in this app, so these are source-shape assertions
 * over the one place the decision lives. They are what stops the guard being
 * loosened by accident — a nudge that fires on every venue is the kind of
 * prompt users learn to dismiss without reading, which costs the real one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const SRC = join(import.meta.dir, '..', '..')
const wizard = readFileSync(
  join(SRC, 'hooks/use-connect-wizard-state.ts'),
  'utf8',
)

describe('the nudge guard', () => {
  test('every condition is on one early return', () => {
    expect(wizard).toMatch(
      /if \(!vault\.enrolled \|\| vault\.hasPasskey \|\| !passkeySupported\) return/,
    )
    expect(wizard).toMatch(/if \(!venue\?\.credentialedMarketData\) return/)
  })

  test('it fires after the credential is stored, never before', () => {
    const saved = wizard.indexOf("track('venue_connected'")
    const offered = wizard.indexOf('maybeOfferPasskey(resolvedMarket)')
    expect(saved).toBeGreaterThan(-1)
    expect(offered).toBeGreaterThan(saved)
    // Inside the try, so a save that threw never reaches it.
    expect(wizard.indexOf('} catch (error) {')).toBeGreaterThan(offered)
  })

  test('it is not offered for a wallet, which has no vault story here', () => {
    // `handleAddCryptoWallet` is a separate submit path; the nudge belongs to
    // the credential path alone until a DEX venue needs a key to read prices.
    // `const maybeOfferPasskey = useCallback(` does not match, so this counts
    // call sites only. Exactly one, on the credential submit.
    expect(wizard.match(/maybeOfferPasskey\(/g)).toHaveLength(1)
  })
})

describe('both shells mount the dialog', () => {
  const SHELLS = [
    'components/accounts/accounts-page.tsx',
    'mobile/screens/connect-account-sheet.tsx',
  ]

  for (const shell of SHELLS) {
    test(shell, () => {
      const src = readFileSync(join(SRC, shell), 'utf8')
      expect(src).toContain('VaultPasskeyNudgeDialog')
      expect(src).toContain('passkeyNudgeVenue')
    })
  }
})

/**
 * The probes moved out of the Security panel so the nudge could share them.
 * A second copy is how one surface offers a button the other has proven dead.
 */
describe('the support probes have one home', () => {
  test('the settings panel imports them rather than declaring them', () => {
    const src = readFileSync(
      join(SRC, 'components/settings/security-section.tsx'),
      'utf8',
    )
    expect(src).toContain("from '@/hooks/use-protector-support'")
    expect(src).not.toMatch(/function usePasskeySupported/)
    expect(src).not.toMatch(/function useBiometricSupported/)
  })
})
