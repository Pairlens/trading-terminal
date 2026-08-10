// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The biometric door to the lock screen.
 *
 * WebAuthn cannot run headless, so what is worth testing is everything either
 * side of the prompt — and one thing in particular: an assertion for a
 * credential this device did not enroll must NOT open the screen. That check is
 * the entire security value of the module, it is unreachable through the real
 * API (`allowCredentials` confines the browser to the enrolled id), and if it
 * ever regresses it regresses silently as a bypass.
 *
 * The outcome vocabulary is load-bearing too. `'cancelled'` is a change of mind
 * and must never read as a failure, `'missing'` sends the caller back to the
 * password, and only a real refusal is an error the user is shown.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

// Stand-in keychain — the real one branches on Tauri vs browser storage,
// neither of which exists in a test process. Restored in afterAll because
// `mock.module` is process-global and bun runs test files in one process.
const store = new Map<string, string>()
let failNext = false

const realKeychain = { ...(await import('@/lib/keychain')) }
afterAll(() => {
  void mock.module('@/lib/keychain', () => realKeychain)
})

void mock.module('@/lib/keychain', () => ({
  saveCredential: async (key: string, value: string) => {
    if (failNext) throw new Error('keychain unavailable')
    store.set(key, value)
  },
  getCredential: async (key: string) => {
    if (failNext) throw new Error('keychain unavailable')
    return store.get(key) ?? null
  },
  deleteCredential: async (key: string) => {
    if (failNext) throw new Error('keychain unavailable')
    store.delete(key)
  },
}))

const {
  LOCK_BIOMETRIC_KEY,
  LockBiometricError,
  clearLockBiometric,
  enrollLockBiometric,
  getLockBiometricEnrolled,
  isLockBiometricCancellation,
  loadLockBiometric,
  parseLockBiometric,
  refreshLockBiometric,
  verifyLockBiometric,
} = await import('../lock-biometric')

type Port = Parameters<typeof verifyLockBiometric>[0]

const CRED_A = new Uint8Array([1, 2, 3, 4])
const CRED_B = new Uint8Array([9, 9, 9, 9])

/** A port that always succeeds, handing back whichever id it was built with. */
function fakePort(
  asserts: Uint8Array<ArrayBuffer> = CRED_A,
): NonNullable<Port> {
  return {
    create: async () => ({ credentialId: CRED_A }),
    assert: async () => ({ credentialId: asserts }),
  }
}

function throwingPort(err: unknown): NonNullable<Port> {
  return {
    create: async () => {
      throw err
    },
    assert: async () => {
      throw err
    },
  }
}

const ENROLL = {
  label: 'Biometric unlock on this device',
  userName: 'Pairlens terminal lock',
  userDisplayName: 'Pairlens',
}

beforeEach(async () => {
  store.clear()
  failNext = false
  await refreshLockBiometric()
})

describe('enroll / verify', () => {
  test('a credential enrolled here opens the screen', async () => {
    await enrollLockBiometric(ENROLL, fakePort())
    expect(await verifyLockBiometric(fakePort())).toBe('ok')
  })

  test('an assertion for a DIFFERENT credential is refused', async () => {
    // The bypass this module exists to not have. `allowCredentials` should make
    // it unreachable; the id comparison is what makes "should" irrelevant.
    await enrollLockBiometric(ENROLL, fakePort())
    expect(await verifyLockBiometric(fakePort(CRED_B))).toBe('no-match')
  })

  test('nothing enrolled reports missing, not a failure', async () => {
    // 'missing' sends the caller back to the password field; anything else
    // would show an error to someone who never turned the feature on.
    expect(await verifyLockBiometric(fakePort())).toBe('missing')
  })

  test('no key material is stored — only the credential id', async () => {
    await enrollLockBiometric(ENROLL, fakePort())
    const raw = store.get(LOCK_BIOMETRIC_KEY)
    expect(raw).toBeDefined()
    const record = JSON.parse(raw as string) as Record<string, unknown>
    expect(Object.keys(record).sort()).toEqual([
      'createdAt',
      'credentialId',
      'label',
      'v',
    ])
  })

  test('transports ride along when the authenticator reports them', async () => {
    await enrollLockBiometric(ENROLL, {
      create: async () => ({
        credentialId: CRED_A,
        transports: ['internal', 'hybrid'],
      }),
      assert: async () => ({ credentialId: CRED_A }),
    })
    expect((await loadLockBiometric())?.transports).toEqual([
      'internal',
      'hybrid',
    ])
  })
})

describe('outcomes', () => {
  test('a dismissed prompt is cancelled, never a refusal', async () => {
    // The caller must not count this against the brute-force backoff, so it
    // cannot be allowed to share an outcome with a real failure.
    await enrollLockBiometric(ENROLL, fakePort())
    const dismissed = Object.assign(new Error('nope'), {
      name: 'NotAllowedError',
    })
    expect(await verifyLockBiometric(throwingPort(dismissed))).toBe('cancelled')
  })

  test('anything else is unavailable', async () => {
    await enrollLockBiometric(ENROLL, fakePort())
    expect(await verifyLockBiometric(throwingPort(new Error('boom')))).toBe(
      'unavailable',
    )
  })

  test('a dismissed creation throws a typed cancellation', async () => {
    const dismissed = Object.assign(new Error('nope'), {
      name: 'NotAllowedError',
    })
    expect(
      enrollLockBiometric(ENROLL, throwingPort(dismissed)),
    ).rejects.toThrow(LockBiometricError)
    // And nothing is written: a record naming a credential that was never
    // created would put a button on the lock screen that no finger can answer.
    expect(store.has(LOCK_BIOMETRIC_KEY)).toBe(false)
  })
})

describe('isLockBiometricCancellation', () => {
  test('only a dismissed prompt counts', () => {
    // The settings toggle shows a red line for everything this says no to, so
    // a false positive hides a real failure and a false negative shouts at
    // someone who just changed their mind.
    expect(
      isLockBiometricCancellation(
        new LockBiometricError('dismissed', 'cancelled'),
      ),
    ).toBe(true)
    expect(
      isLockBiometricCancellation(
        new LockBiometricError('dead', 'unavailable'),
      ),
    ).toBe(false)
    // A look-alike from the vault layer: same `kind`, different class.
    expect(
      isLockBiometricCancellation(
        Object.assign(new Error('x'), { kind: 'cancelled' }),
      ),
    ).toBe(false)
    expect(isLockBiometricCancellation(null)).toBe(false)
  })
})

describe('clear', () => {
  test('removing it takes the door with it', async () => {
    await enrollLockBiometric(ENROLL, fakePort())
    expect(getLockBiometricEnrolled()).toBe(true)
    await clearLockBiometric()
    expect(getLockBiometricEnrolled()).toBe(false)
    expect(await verifyLockBiometric(fakePort())).toBe('missing')
  })

  test('a keychain that refuses the delete still drops the flag', async () => {
    // Otherwise the toggle sticks on over a door the user just turned off.
    await enrollLockBiometric(ENROLL, fakePort())
    failNext = true
    expect(clearLockBiometric()).rejects.toThrow()
    expect(getLockBiometricEnrolled()).toBe(false)
  })
})

describe('parseLockBiometric', () => {
  test('rejects anything that is not a v1 record with an id', () => {
    expect(parseLockBiometric(null)).toBeNull()
    expect(parseLockBiometric('{not json')).toBeNull()
    expect(parseLockBiometric('{}')).toBeNull()
    expect(
      parseLockBiometric(JSON.stringify({ v: 2, credentialId: 'a' })),
    ).toBeNull()
    expect(
      parseLockBiometric(JSON.stringify({ v: 1, credentialId: '' })),
    ).toBeNull()
  })

  test('a corrupt record reads as no record at all', async () => {
    store.set(LOCK_BIOMETRIC_KEY, '{not json')
    expect(await verifyLockBiometric(fakePort())).toBe('missing')
    expect(await refreshLockBiometric()).toBe(false)
  })
})

describe('refreshLockBiometric', () => {
  test('a keychain failure answers false rather than throwing', async () => {
    // The fallback is the password field already on screen; a throw here would
    // take the whole lock overlay down with it.
    await enrollLockBiometric(ENROLL, fakePort())
    failNext = true
    expect(await refreshLockBiometric()).toBe(false)
  })
})
