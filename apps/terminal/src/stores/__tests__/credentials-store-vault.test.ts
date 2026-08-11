// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The single highest-consequence integration rule: a sealed vault is NOT an
 * empty account list.
 *
 * Both stores used to swallow every load failure into `loaded: true`, which
 * would render the Accounts first-run hero in front of a user who already has
 * keys, halt their live bots with "no live credential", and invite them to
 * re-enter API keys on top of a vault they cannot open. These tests exist to
 * make that regression impossible to reintroduce quietly.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'

import { installBrowserGlobals } from '@/lib/security/vault/__tests__/test-globals'
import {
  VaultEnrollmentRequiredError,
  VaultSealedError,
} from '@/lib/security/vault/vault-errors'

installBrowserGlobals()

// The stores talk to the keychain and the policy; both are stubbed so these
// tests are about the STORES' reaction, not about crypto.
let getCredentialImpl: (key: string) => Promise<string | null> = async () =>
  null
let saved: Array<{ key: string; value: string }> = []
let mustEnroll = false
/** Set to make the next write fail — a sealed vault throws exactly this way. */
let saveFailure: Error | null = null

// `mock.module` is process-global in bun. Capture the real modules first and
// put them back in `afterAll`, spreading the namespace — handing the namespace
// object straight back silently does nothing, and the leaked stub then makes
// every later file's security assertions pass vacuously.
const realKeychain = { ...(await import('@/lib/keychain')) }
const realPolicy = { ...(await import('@/lib/security/vault/vault-policy')) }

afterAll(() => {
  mock.module('@/lib/keychain', () => realKeychain)
  mock.module('@/lib/security/vault/vault-policy', () => realPolicy)
})

mock.module('@/lib/keychain', () => ({
  ...realKeychain,
  getCredential: (key: string) => getCredentialImpl(key),
  saveCredential: async (key: string, value: string) => {
    if (saveFailure) throw saveFailure
    saved.push({ key, value })
  },
  deleteCredential: async () => undefined,
}))

mock.module('@/lib/security/vault/vault-policy', () => ({
  ...realPolicy,
  assertCanAddCredential: async () => {
    if (mustEnroll) throw new VaultEnrollmentRequiredError()
  },
  mustEnrollFirst: async () => mustEnroll,
}))

const { useCredentialsStore, CREDENTIALS_INDEX_KEY } =
  await import('@/stores/credentials-store')
const { useWalletsStore } = await import('@/stores/wallets-store')

function resetStores(): void {
  useCredentialsStore.setState({
    credentials: [],
    loaded: false,
    status: 'idle',
    sealed: false,
  })
  useWalletsStore.setState({
    wallets: [],
    loaded: false,
    status: 'idle',
    sealed: false,
  })
}

beforeEach(() => {
  saved = []
  mustEnroll = false
  saveFailure = null
  getCredentialImpl = async () => null
  resetStores()
})

afterEach(() => {
  resetStores()
})

describe('credentials store: sealed is not empty', () => {
  test('a sealed load reports sealed, never ready', async () => {
    getCredentialImpl = async () => {
      throw new VaultSealedError()
    }

    await useCredentialsStore.getState().load()

    const state = useCredentialsStore.getState()
    expect(state.status).toBe('sealed')
    expect(state.sealed).toBe(true)
    expect(state.credentials).toEqual([])
    // The regression that matters. `ready` here is what makes the UI say
    // "you have no accounts".
    expect(state.status).not.toBe('ready')
    // Still "settled", so the page paints its answer instead of spinning.
    expect(state.loaded).toBe(true)
  })

  test('an empty keychain is ready, not sealed — the two must not blur', async () => {
    await useCredentialsStore.getState().load()
    const state = useCredentialsStore.getState()
    expect(state.status).toBe('ready')
    expect(state.sealed).toBe(false)
  })

  test('load() retries after a seal instead of latching', async () => {
    getCredentialImpl = async () => {
      throw new VaultSealedError()
    }
    await useCredentialsStore.getState().load()
    expect(useCredentialsStore.getState().status).toBe('sealed')

    // Unlocked in another window; the store must be willing to look again.
    getCredentialImpl = async (key) => {
      if (key === CREDENTIALS_INDEX_KEY) return JSON.stringify(['abc'])
      if (key === 'cred:abc') {
        return JSON.stringify({
          id: 'abc',
          market: 'okx',
          label: 'OKX Live',
          mode: 'live',
          apiKey: 'k',
          apiSecret: 's',
          createdAt: 1,
        })
      }
      return null
    }
    await useCredentialsStore.getState().load()

    const state = useCredentialsStore.getState()
    expect(state.status).toBe('ready')
    expect(state.sealed).toBe(false)
    expect(state.credentials).toHaveLength(1)
  })

  test('reload() re-reads even from a settled ready state', async () => {
    await useCredentialsStore.getState().load()
    expect(useCredentialsStore.getState().credentials).toEqual([])

    getCredentialImpl = async (key) =>
      key === CREDENTIALS_INDEX_KEY ? JSON.stringify([]) : null
    let calls = 0
    const inner = getCredentialImpl
    getCredentialImpl = async (key) => {
      calls++
      return inner(key)
    }
    await useCredentialsStore.getState().reload()
    expect(calls).toBeGreaterThan(0)
  })

  test('load() resolves only once the credentials are in memory', async () => {
    // The contract the bot runtime arms live bots off: `.then()` after
    // `load()` means "they are there". A second caller must not be handed a
    // resolved promise while the first read is still going — the store would
    // then look empty, `liveCredentialId()` would return null, and every armed
    // live bot would be disabled for it.
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    getCredentialImpl = async (key) => {
      await gate
      if (key === CREDENTIALS_INDEX_KEY) return JSON.stringify(['abc'])
      if (key === 'cred:abc') {
        return JSON.stringify({
          id: 'abc',
          market: 'okx',
          label: 'OKX Live',
          mode: 'live',
          apiKey: 'k',
          apiSecret: 's',
          createdAt: 1,
        })
      }
      return null
    }

    const first = useCredentialsStore.getState().load()
    // The second caller arrives while the read is in flight — the state is
    // already `loading`, which is exactly what the old guard short-circuited
    // on. What it sees WHEN ITS OWN promise resolves is the whole test.
    const second = useCredentialsStore
      .getState()
      .load()
      .then(() => useCredentialsStore.getState().credentials.length)

    release!()
    expect(await second).toBe(1)
    await first
  })

  test('a non-vault failure is `error`, still not `ready`', async () => {
    getCredentialImpl = async () => {
      throw new Error('keychain backend is unavailable')
    }
    await useCredentialsStore.getState().load()
    const state = useCredentialsStore.getState()
    expect(state.status).toBe('error')
    expect(state.sealed).toBe(false)
    expect(state.status).not.toBe('ready')
  })
})

describe('renaming a credential', () => {
  const stored = {
    id: 'abc',
    market: 'okx',
    label: 'OKX Live',
    mode: 'live' as const,
    apiKey: 'k',
    apiSecret: 's',
    createdAt: 1,
  }

  function seed(): void {
    useCredentialsStore.setState({
      credentials: [{ ...stored }],
      loaded: true,
      status: 'ready',
      sealed: false,
    })
  }

  test('writes the whole record back to the same slot, then publishes', async () => {
    seed()
    await useCredentialsStore.getState().renameCredential('abc', 'Desk key')

    expect(useCredentialsStore.getState().credentials[0].label).toBe('Desk key')
    // One write, to the credential's own slot. The index holds ids, and the id
    // did not change, so it must NOT be rewritten.
    expect(saved).toHaveLength(1)
    expect(saved[0].key).toBe('cred:abc')
    const written = JSON.parse(saved[0].value)
    expect(written.label).toBe('Desk key')
    // Nothing else moved — a rename is not a re-issue.
    expect(written.apiKey).toBe('k')
    expect(written.apiSecret).toBe('s')
    expect(written.createdAt).toBe(1)
  })

  test('trims the label', async () => {
    seed()
    await useCredentialsStore.getState().renameCredential('abc', '  Desk key  ')
    expect(useCredentialsStore.getState().credentials[0].label).toBe('Desk key')
    expect(JSON.parse(saved[0].value).label).toBe('Desk key')
  })

  test('an empty or whitespace label is a no-op, not a blank name', async () => {
    seed()
    await useCredentialsStore.getState().renameCredential('abc', '')
    await useCredentialsStore.getState().renameCredential('abc', '   ')

    expect(useCredentialsStore.getState().credentials[0].label).toBe('OKX Live')
    expect(saved).toEqual([])
  })

  test('renaming to the same name writes nothing', async () => {
    seed()
    await useCredentialsStore.getState().renameCredential('abc', 'OKX Live')
    expect(saved).toEqual([])
  })

  test('an unknown id writes nothing', async () => {
    seed()
    await useCredentialsStore.getState().renameCredential('nope', 'Desk key')
    expect(saved).toEqual([])
  })

  test('a failed write rejects and leaves the name alone', async () => {
    // The reason this action persists BEFORE it publishes. On a sealed vault
    // `saveCredential` throws; a store that had already swapped the label would
    // leave the UI showing a name that is on no disk anywhere.
    seed()
    saveFailure = new VaultSealedError()

    await expect(
      useCredentialsStore.getState().renameCredential('abc', 'Desk key'),
    ).rejects.toBeInstanceOf(VaultSealedError)

    expect(useCredentialsStore.getState().credentials[0].label).toBe('OKX Live')
  })
})

describe('changing a credential account entity', () => {
  const stored = {
    id: 'abc',
    market: 'okx',
    label: 'OKX Live',
    mode: 'live' as const,
    apiKey: 'k',
    apiSecret: 's',
    createdAt: 1,
  }

  function seed(entity?: string): void {
    useCredentialsStore.setState({
      credentials: [{ ...stored, ...(entity ? { entity } : {}) }],
      loaded: true,
      status: 'ready',
      sealed: false,
    })
  }

  test('writes the whole record to the same slot, then publishes', async () => {
    seed()
    await useCredentialsStore.getState().updateCredentialEntity('abc', 'eea')

    expect(useCredentialsStore.getState().credentials[0].entity).toBe('eea')
    expect(saved).toHaveLength(1)
    expect(saved[0].key).toBe('cred:abc')
    const written = JSON.parse(saved[0].value)
    expect(written.entity).toBe('eea')
    // Routing moved; the key did not.
    expect(written.apiKey).toBe('k')
    expect(written.apiSecret).toBe('s')
    expect(written.label).toBe('OKX Live')
  })

  test('back to auto drops the field rather than storing an empty string', async () => {
    seed('eea')
    await useCredentialsStore.getState().updateCredentialEntity('abc', '')

    expect(useCredentialsStore.getState().credentials[0].entity).toBeUndefined()
    expect('entity' in JSON.parse(saved[0].value)).toBe(false)
  })

  test('auto on a credential that never had one writes nothing', async () => {
    seed()
    await useCredentialsStore.getState().updateCredentialEntity('abc', '')
    expect(saved).toEqual([])
  })

  test('picking the current entity writes nothing', async () => {
    seed('eea')
    await useCredentialsStore.getState().updateCredentialEntity('abc', 'eea')
    expect(saved).toEqual([])
  })

  test('an unknown id writes nothing', async () => {
    seed()
    await useCredentialsStore.getState().updateCredentialEntity('nope', 'us')
    expect(saved).toEqual([])
  })

  test('a failed write rejects and leaves routing alone', async () => {
    // Same reason as rename: a sealed vault must not leave the card showing an
    // entity that no disk agrees with, while orders still sign for the old one.
    seed()
    saveFailure = new VaultSealedError()

    await expect(
      useCredentialsStore.getState().updateCredentialEntity('abc', 'us'),
    ).rejects.toBeInstanceOf(VaultSealedError)

    expect(useCredentialsStore.getState().credentials[0].entity).toBeUndefined()
  })
})

describe('wallets store: same rule', () => {
  test('a sealed load reports sealed, never ready', async () => {
    getCredentialImpl = async () => {
      throw new VaultSealedError()
    }
    await useWalletsStore.getState().load()
    const state = useWalletsStore.getState()
    expect(state.status).toBe('sealed')
    expect(state.sealed).toBe(true)
    expect(state.wallets).toEqual([])
  })
})

describe('the enrollment gate lives in the stores', () => {
  test('addCredential refuses before any protector exists', async () => {
    mustEnroll = true
    await expect(
      useCredentialsStore.getState().addCredential({
        market: 'okx',
        label: 'OKX',
        mode: 'live',
        apiKey: 'k',
        apiSecret: 's',
      }),
    ).rejects.toBeInstanceOf(VaultEnrollmentRequiredError)
    // And nothing reached storage — the whole point of gating before the write.
    expect(saved).toEqual([])
  })

  test('addWallet refuses too — one rule, both entry points', async () => {
    mustEnroll = true
    await expect(
      useWalletsStore
        .getState()
        .addWallet(
          { chain: 'solana', address: 'So1...', label: 'Main' },
          'secret',
        ),
    ).rejects.toBeInstanceOf(VaultEnrollmentRequiredError)
    expect(saved).toEqual([])
  })

  test('with a vault in place the write goes through', async () => {
    mustEnroll = false
    await useCredentialsStore.getState().addCredential({
      market: 'okx',
      label: 'OKX',
      mode: 'live',
      apiKey: 'k',
      apiSecret: 's',
    })
    expect(saved.map((s) => s.key)).toContain(CREDENTIALS_INDEX_KEY)
  })
})
