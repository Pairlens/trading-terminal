// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Enrollment, unlock and protector management end to end, against real
 * storage (a fake localStorage) and real crypto.
 *
 * Two rules here have no second chance if they are wrong:
 *
 *   - removing the last protector while vaulted values exist must be
 *     refused, because there is no recovery path afterwards;
 *   - a wrong password must reach the shared attempt backoff, and a dismissed
 *     passkey prompt must not.
 *
 * The lock store is mocked so the backoff is observable and so the test does
 * not drag the settings dialog and analytics into a crypto test.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

let blockedMs = 0
const backoff = { failures: 0, clears: 0 }

// The vault's own re-export of the lock's counter, mocked rather than
// `lock-store` itself so nothing else in the run sees a partial module.
void mock.module('../vault-attempts', () => ({
  blockedForMs: () => blockedMs,
  recordFailedAttempt: () => {
    backoff.failures++
    return { fails: backoff.failures, blockedUntil: 0 }
  },
  clearAttempts: () => {
    backoff.clears++
  },
}))

const {
  addProtector,
  changeVaultPassword,
  createVault,
  removeProtector,
  unlockVault,
} = await import('../vault-protectors')
const {
  __resetVaultSessionForTests,
  ensureVaultLoaded,
  getDekOrThrow,
  isVaultUnlocked,
  sealVault,
} = await import('../vault-session')
const { VaultConflictError, VaultProtectorError, VaultSealedError } =
  await import('../vault-errors')
const {
  CIPHER_V2,
  decryptWithDek,
  encryptWithDek,
  fromBase64,
  randomBytes,
  toBase64,
} = await import('../vault-crypto')
const { saveCredential, getCredential } = await import('@/lib/keychain')

const RECORD_KEY = 'pairlens:security.vault'
const FAST = 1_000

const pw = (password: string, label?: string) =>
  ({
    kind: 'password',
    password,
    iterations: FAST,
    ...(label ? { label } : {}),
  }) as const

beforeEach(() => {
  storage.clear()
  __resetVaultSessionForTests()
  blockedMs = 0
  backoff.failures = 0
  backoff.clears = 0
})

describe('createVault', () => {
  test('persists a record and leaves the vault open', async () => {
    const record = await createVault(pw('correct horse'))

    expect(record.state).toBe('ready')
    expect(record.protectors).toHaveLength(1)
    expect(isVaultUnlocked()).toBe(true)
    // Persisted where the ciphertext lives, so the two die together.
    expect(JSON.parse(storage.getItem(RECORD_KEY)!).revision).toBe(
      record.revision,
    )
  })

  test('refuses to create a second vault over an existing one', async () => {
    await createVault(pw('first'))
    __resetVaultSessionForTests()
    await expect(createVault(pw('second'))).rejects.toBeInstanceOf(
      VaultConflictError,
    )
  })

  test('credentials written afterwards are vaulted', async () => {
    await createVault(pw('pw'))
    await saveCredential('cred:okx', 'sk-live')
    expect(
      storage.getItem('pairlens:keychain:cred:okx')?.startsWith(CIPHER_V2),
    ).toBe(true)
    expect(await getCredential('cred:okx')).toBe('sk-live')
  })
})

describe('unlockVault', () => {
  test('the right password reopens a sealed vault', async () => {
    await createVault(pw('correct horse'))
    const stored = await encryptWithDek(getDekOrThrow(), 'cred:a', 'sk')

    sealVault({ broadcast: false })
    __resetVaultSessionForTests()
    expect(isVaultUnlocked()).toBe(false)

    await unlockVault({ kind: 'password', password: 'correct horse' })
    expect(isVaultUnlocked()).toBe(true)
    // Same data key, so what was written before the seal still reads.
    expect(await decryptWithDek(getDekOrThrow(), 'cred:a', stored)).toBe('sk')
    expect(backoff.clears).toBeGreaterThan(0)
  })

  test('a wrong password counts against the shared backoff', async () => {
    await createVault(pw('correct horse'))
    __resetVaultSessionForTests()

    await expect(
      unlockVault({ kind: 'password', password: 'wrong' }),
    ).rejects.toBeInstanceOf(VaultProtectorError)
    expect(backoff.failures).toBe(1)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('an active lockout refuses before doing any work', async () => {
    await createVault(pw('correct horse'))
    __resetVaultSessionForTests()
    blockedMs = 42_000

    const promise = unlockVault({
      kind: 'password',
      password: 'correct horse',
    })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: InstanceType<typeof VaultProtectorError>) => {
      expect(err.kind).toBe('unavailable')
      expect(err.message).toContain('42s')
    })
    // Even the correct password must not slip through the penalty.
    expect(isVaultUnlocked()).toBe(false)
    expect(backoff.failures).toBe(0)
  })

  test('with no vault it says so instead of prompting', async () => {
    await expect(
      unlockVault({ kind: 'password', password: 'anything' }),
    ).rejects.toBeInstanceOf(VaultProtectorError)
  })
})

describe('addProtector', () => {
  test('a second password is added under the same data key', async () => {
    const first = await createVault(pw('alpha'))
    const stored = await encryptWithDek(getDekOrThrow(), 'cred:a', 'sk')

    const next = await addProtector(
      { kind: 'password', password: 'alpha' },
      pw('beta', 'Backup'),
    )
    expect(next.protectors).toHaveLength(2)
    expect(next.revision).toBe(first.revision + 1)
    expect(JSON.parse(storage.getItem(RECORD_KEY)!).protectors).toHaveLength(2)

    // Either password now opens the same vault.
    __resetVaultSessionForTests()
    await unlockVault({ kind: 'password', password: 'beta' })
    expect(await decryptWithDek(getDekOrThrow(), 'cred:a', stored)).toBe('sk')
  })

  test('requires proving an existing protector, not just an open vault', async () => {
    await createVault(pw('alpha'))
    // The vault is unlocked in this window, and it still is not enough:
    // someone walking up to an open laptop must not be able to add their own
    // way in.
    expect(isVaultUnlocked()).toBe(true)
    await expect(
      addProtector({ kind: 'password', password: 'wrong' }, pw('mine')),
    ).rejects.toBeInstanceOf(VaultProtectorError)
    expect(backoff.failures).toBe(1)
    expect((await ensureVaultLoaded())?.protectors).toHaveLength(1)
  })

  test('a sealed vault can still enroll, because the proof unlocks it', async () => {
    await createVault(pw('alpha'))
    sealVault({ broadcast: false })
    __resetVaultSessionForTests()

    await addProtector({ kind: 'password', password: 'alpha' }, pw('beta'))
    expect(isVaultUnlocked()).toBe(true)
  })
})

describe('removeProtector', () => {
  test('drops one blob and leaves the others working', async () => {
    await createVault(pw('alpha'))
    const two = await addProtector(
      { kind: 'password', password: 'alpha' },
      pw('beta'),
    )
    const removedId = two.protectors[0].id

    const after = await removeProtector(removedId)
    expect(after?.protectors).toHaveLength(1)

    __resetVaultSessionForTests()
    // The removed password is gone; the remaining one still opens the vault.
    await expect(
      unlockVault({ kind: 'password', password: 'alpha' }),
    ).rejects.toBeInstanceOf(VaultProtectorError)
    await unlockVault({ kind: 'password', password: 'beta' })
    expect(isVaultUnlocked()).toBe(true)
  })

  test('refuses to remove the last way into a vault holding secrets', async () => {
    const record = await createVault(pw('alpha'))
    await saveCredential('cred:okx', 'sk-live')

    const promise = removeProtector(record.protectors[0].id)
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: InstanceType<typeof VaultProtectorError>) => {
      expect(err.kind).toBe('unavailable')
    })
    // Still readable — nothing was stranded.
    expect(await getCredential('cred:okx')).toBe('sk-live')
  })

  test('removing the last protector of an empty vault ends the vault', async () => {
    const record = await createVault(pw('alpha'))
    expect(await removeProtector(record.protectors[0].id)).toBeNull()
    // The record is deleted rather than left as a husk that parses as null
    // and silently downgrades the next write.
    expect(storage.getItem(RECORD_KEY)).toBeNull()
    expect(isVaultUnlocked()).toBe(false)
  })

  test('requires an unlocked vault', async () => {
    const record = await createVault(pw('alpha'))
    sealVault({ broadcast: false })
    await expect(
      removeProtector(record.protectors[0].id),
    ).rejects.toBeInstanceOf(VaultSealedError)
  })

  test('an unknown id is a no-match', async () => {
    await createVault(pw('alpha'))
    const promise = removeProtector('not-a-protector')
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: InstanceType<typeof VaultProtectorError>) => {
      expect(err.kind).toBe('no-match')
    })
  })

  test('the has-values check can be injected and is honoured', async () => {
    const record = await createVault(pw('alpha'))
    await expect(
      removeProtector(record.protectors[0].id, {
        hasValues: async () => true,
      }),
    ).rejects.toBeInstanceOf(VaultProtectorError)
  })
})

describe('passkeys through the orchestration layer', () => {
  /**
   * The same fake authenticator shape vault-passkey.test.ts uses: PRF is an
   * HMAC over (credential key, salt), which is what the extension actually
   * computes. Only the platform prompt is missing.
   */
  function authenticator() {
    const keys = new Map<string, Uint8Array<ArrayBuffer>>()
    const state = { cancel: false }
    const prf = async (id: string, salt: Uint8Array<ArrayBuffer>) => {
      const key = await crypto.subtle.importKey(
        'raw',
        keys.get(id)!,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      return new Uint8Array(await crypto.subtle.sign('HMAC', key, salt))
    }
    const port = {
      async create(request: { prfSalt: string }) {
        const credentialId = randomBytes(16)
        const id = toBase64(credentialId)
        keys.set(id, randomBytes(32))
        return {
          credentialId,
          prfSecret: await prf(id, fromBase64(request.prfSalt)),
        }
      },
      async assert(request: {
        prfSalt: string
        allowCredentialIds: Array<string>
      }) {
        if (state.cancel) {
          throw new VaultProtectorError('dismissed', 'cancelled')
        }
        const id = request.allowCredentialIds.find((c) => keys.has(c))!
        return {
          credentialId: fromBase64(id),
          prfSecret: await prf(id, fromBase64(request.prfSalt)),
        }
      },
    }
    return { port, state }
  }

  test('a passkey enrolled beside a password opens the same vault', async () => {
    const { port } = authenticator()
    await createVault(pw('alpha'))
    const stored = await encryptWithDek(getDekOrThrow(), 'cred:a', 'sk')

    const next = await addProtector(
      { kind: 'password', password: 'alpha' },
      { kind: 'passkey', port },
    )
    expect(next.protectors).toHaveLength(2)

    __resetVaultSessionForTests()
    await unlockVault({ kind: 'passkey', port })
    expect(await decryptWithDek(getDekOrThrow(), 'cred:a', stored)).toBe('sk')
  })

  test('a dismissed prompt is never counted as a guess', async () => {
    const { port, state } = authenticator()
    await createVault(pw('alpha'))
    await addProtector(
      { kind: 'password', password: 'alpha' },
      { kind: 'passkey', port },
    )
    __resetVaultSessionForTests()

    state.cancel = true
    const promise = unlockVault({ kind: 'passkey', port })
    await expect(promise).rejects.toBeInstanceOf(VaultProtectorError)
    await promise.catch((err: InstanceType<typeof VaultProtectorError>) => {
      expect(err.kind).toBe('cancelled')
    })
    // Cancelling a biometric prompt is not an attempt on the password. Letting
    // it reach the backoff would mean an accidental Escape locks the user out
    // of the screen unlock too, for up to five minutes.
    expect(backoff.failures).toBe(0)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('an active lockout still blocks the passkey path', async () => {
    const { port } = authenticator()
    await createVault(pw('alpha'))
    await addProtector(
      { kind: 'password', password: 'alpha' },
      { kind: 'passkey', port },
    )
    __resetVaultSessionForTests()
    blockedMs = 7_000

    await expect(unlockVault({ kind: 'passkey', port })).rejects.toBeInstanceOf(
      VaultProtectorError,
    )
  })
})

describe('changeVaultPassword', () => {
  test('rotates and persists in one write, keeping the data key', async () => {
    const before = await createVault(pw('old pw'))
    await saveCredential('cred:okx', 'sk-live')

    const after = await changeVaultPassword('old pw', 'new pw')
    expect(after.revision).toBe(before.revision + 1)

    __resetVaultSessionForTests()
    await unlockVault({ kind: 'password', password: 'new pw' })
    expect(await getCredential('cred:okx')).toBe('sk-live')
  })

  test('a wrong old password aborts before writing anything', async () => {
    const before = await createVault(pw('old pw'))

    await expect(changeVaultPassword('wrong', 'new pw')).rejects.toBeInstanceOf(
      VaultProtectorError,
    )
    expect(backoff.failures).toBe(1)
    // Nothing persisted: the caller writes the lock verifier only after this
    // resolves, so an aborted rotation leaves the two artifacts in agreement.
    expect(JSON.parse(storage.getItem(RECORD_KEY)!).revision).toBe(
      before.revision,
    )
  })

  test('an active lockout blocks rotation too', async () => {
    await createVault(pw('old pw'))
    blockedMs = 10_000
    await expect(
      changeVaultPassword('old pw', 'new pw'),
    ).rejects.toBeInstanceOf(VaultProtectorError)
  })
})
