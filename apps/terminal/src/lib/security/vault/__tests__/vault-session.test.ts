// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The live vault: sealed-vs-unlocked, and the cross-window handshake.
 *
 * The handshake is request/offer rather than broadcast-on-unlock, and it has
 * to fail closed in three different ways — no sibling, a stale nonce, and a
 * webview that cannot structured-clone a CryptoKey. All three end the same
 * way: this window stays sealed and prompts. None of them may end with a
 * window that thinks it is unlocked.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { installBrowserGlobals } from './test-globals'

const storage = installBrowserGlobals()

const { generateRawDek, importDek, randomBytes, toBase64 } =
  await import('../vault-crypto')
const { VaultSealedError } = await import('../vault-errors')
const {
  __resetVaultSessionForTests,
  ensureVaultLoaded,
  getDek,
  getDekOrThrow,
  getVaultRecord,
  getVaultState,
  initVaultSession,
  isVaultEnrolled,
  isVaultUnlocked,
  requestDekFromSiblings,
  sealVault,
  setDek,
  setVaultRecord,
  subscribeVault,
} = await import('../vault-session')

const CHANNEL = 'pairlens:security-lock'
const RECORD_KEY = 'pairlens:security.vault'

const record = {
  v: 1 as const,
  state: 'ready' as const,
  revision: 1,
  prfSalt: toBase64(randomBytes(32)),
  webauthnUserId: toBase64(randomBytes(32)),
  createdAt: 1,
  protectors: [
    {
      id: 'p1',
      type: 'password' as const,
      createdAt: 1,
      label: 'Password',
      kdf: 'PBKDF2-SHA256' as const,
      iterations: 1_000,
      salt: 'c2FsdA==',
      iv: 'aXY=',
      wrapped: 'dw==',
    },
  ],
}

let siblings: Array<BroadcastChannel> = []

/**
 * A stand-in for another terminal window. Closed after every test — a leftover
 * peer still listening on the channel would answer the next test's key
 * request, which is a genuinely confusing failure to debug.
 */
function sibling(): BroadcastChannel {
  const channel = new BroadcastChannel(CHANNEL)
  siblings.push(channel)
  return channel
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

async function dek(): Promise<CryptoKey> {
  return importDek(generateRawDek())
}

beforeEach(() => {
  storage.clear()
  __resetVaultSessionForTests()
})

afterEach(async () => {
  for (const channel of siblings) {
    channel.onmessage = null
    channel.close()
  }
  siblings = []
  // Let any in-flight delivery land against the closed channels.
  await tick(5)
})

describe('sealed / unlocked', () => {
  test('starts sealed, and a sealed read throws instead of returning null', async () => {
    expect(isVaultUnlocked()).toBe(false)
    expect(getDek()).toBeNull()
    // The regression that matters: sealed must never look like "nothing is
    // stored", or every caller self-heals over live data.
    expect(() => getDekOrThrow()).toThrow(VaultSealedError)
  })

  test('setDek opens it and sealVault closes it', async () => {
    const key = await dek()
    setDek(key, { broadcast: false })
    expect(isVaultUnlocked()).toBe(true)
    expect(getDekOrThrow()).toBe(key)

    sealVault({ broadcast: false })
    expect(isVaultUnlocked()).toBe(false)
    expect(() => getDekOrThrow()).toThrow(VaultSealedError)
  })

  test('subscribers see every transition exactly once', async () => {
    let calls = 0
    const unsubscribe = subscribeVault(() => {
      calls++
    })
    setDek(await dek(), { broadcast: false })
    sealVault({ broadcast: false })
    // Sealing an already-sealed vault is a no-op, not another notification.
    sealVault({ broadcast: false })
    unsubscribe()
    setDek(await dek(), { broadcast: false })
    expect(calls).toBe(2)
  })

  test('the snapshot is referentially stable between changes', async () => {
    const first = getVaultState()
    expect(getVaultState()).toBe(first)
    setDek(await dek(), { broadcast: false })
    expect(getVaultState()).not.toBe(first)
    expect(getVaultState().unlocked).toBe(true)
  })
})

describe('the record', () => {
  test('is read once and cached', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    expect(isVaultEnrolled()).toBe(false) // not loaded yet — strict on purpose

    const loaded = await ensureVaultLoaded()
    expect(loaded?.revision).toBe(1)
    expect(isVaultEnrolled()).toBe(true)
    expect(getVaultRecord()?.protectors).toHaveLength(1)

    // Cached: deleting the backing store does not un-enroll a loaded vault.
    storage.removeItem(RECORD_KEY)
    expect(await ensureVaultLoaded()).toBe(loaded!)
  })

  test('an absent or unreadable record reads as unenrolled', async () => {
    expect(await ensureVaultLoaded()).toBeNull()
    __resetVaultSessionForTests()
    storage.setItem(RECORD_KEY, '{not json')
    expect(await ensureVaultLoaded()).toBeNull()
    expect(isVaultEnrolled()).toBe(false)
  })

  test('concurrent loads share one read', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    const [a, b] = await Promise.all([ensureVaultLoaded(), ensureVaultLoaded()])
    expect(a).toBe(b!)
  })

  test('setVaultRecord updates the UI mirror', async () => {
    setVaultRecord(record, { broadcast: false })
    expect(JSON.parse(storage.getItem('pairlens:security.vault-ui')!)).toEqual({
      enrolled: true,
      protectors: 1,
      hasPasskey: false,
      hasPassword: true,
      hasBiometric: false,
      state: 'ready',
    })
    expect(getVaultState().enrolled).toBe(true)
  })

  test('the snapshot reports which protector kinds are enrolled', async () => {
    // Every unlock surface renders its buttons off this — a wrong flag is
    // either a missing way in or a button that cannot raise a prompt.
    setVaultRecord(
      {
        ...record,
        protectors: [
          ...record.protectors,
          {
            id: 'b1',
            type: 'biometric' as const,
            createdAt: 1,
            label: 'Touch ID on this Mac',
            platform: 'macos' as const,
            salt: 'c2FsdA==',
            iv: 'aXY=',
            wrapped: 'dw==',
          },
        ],
      },
      { broadcast: false },
    )
    const state = getVaultState()
    expect(state.hasPassword).toBe(true)
    expect(state.hasBiometric).toBe(true)
    expect(state.hasPasskey).toBe(false)
    expect(state.protectors).toBe(2)
  })
})

describe('cross-window key sharing', () => {
  test('with no sibling holding a key, the window stays sealed', async () => {
    expect(await requestDekFromSiblings(50)).toBe(false)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('a sibling that answers hands over a working key', async () => {
    const key = await dek()
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; nonce?: string }
      if (message.type !== 'vault:key-request') return
      peer.postMessage({
        type: 'vault:key-offer',
        nonce: message.nonce,
        key,
      })
    }

    expect(await requestDekFromSiblings(500)).toBe(true)
    expect(isVaultUnlocked()).toBe(true)
    // Structured clone preserves non-extractability — that is the whole
    // reason the key can travel at all.
    expect(getDekOrThrow().extractable).toBe(false)
  })

  test('an offer for a different request is ignored', async () => {
    const key = await dek()
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string }
      if (message.type !== 'vault:key-request') return
      peer.postMessage({ type: 'vault:key-offer', nonce: 'someone-else', key })
    }

    expect(await requestDekFromSiblings(120)).toBe(false)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('an offer that is not a usable key is ignored', async () => {
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; nonce?: string }
      if (message.type !== 'vault:key-request') return
      // What the storage-event fallback transport would deliver after a JSON
      // round trip, and what a hostile message would look like.
      peer.postMessage({
        type: 'vault:key-offer',
        nonce: message.nonce,
        key: { fake: true },
      })
    }

    expect(await requestDekFromSiblings(120)).toBe(false)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('this window answers a sibling asking for the key', async () => {
    setDek(await dek(), { broadcast: false })
    const peer = sibling()
    const offers: Array<unknown> = []
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string }
      if (message.type === 'vault:key-offer') offers.push(message)
    }
    peer.postMessage({ type: 'vault:key-request', nonce: 'peer-nonce' })
    await tick(80)

    expect(offers).toHaveLength(1)
    expect((offers[0] as { nonce: string }).nonce).toBe('peer-nonce')
    expect((offers[0] as { key: CryptoKey }).key).toBeInstanceOf(CryptoKey)
  })

  test('a sealed window answers nothing', async () => {
    const peer = sibling()
    const offers: Array<unknown> = []
    peer.onmessage = (event: MessageEvent) => {
      if ((event.data as { type: string }).type === 'vault:key-offer') {
        offers.push(event.data)
      }
    }
    peer.postMessage({ type: 'vault:key-request', nonce: 'peer-nonce' })
    await tick(80)
    expect(offers).toHaveLength(0)
  })

  test('a hard lock in another window drops this window key', async () => {
    setDek(await dek(), { broadcast: false })
    expect(isVaultUnlocked()).toBe(true)

    sibling().postMessage({ type: 'vault:sealed', at: Date.now() })
    await tick(80)
    expect(isVaultUnlocked()).toBe(false)
  })

  test('a device erase clears both the key and the cached record', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    await ensureVaultLoaded()
    setDek(await dek(), { broadcast: false })

    sibling().postMessage({ type: 'reset', at: Date.now() })
    await tick(80)
    expect(isVaultUnlocked()).toBe(false)
    expect(isVaultEnrolled()).toBe(false)
  })
})

describe('initVaultSession', () => {
  /** A sibling window that hands over its key on request. */
  function holder(key: CryptoKey): BroadcastChannel {
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; nonce?: string }
      if (message.type !== 'vault:key-request') return
      peer.postMessage({
        type: 'vault:key-offer',
        nonce: message.nonce,
        key,
      })
    }
    return peer
  }

  test('a window opened after a sibling unlocked adopts the key', async () => {
    // The case the announcement cannot cover: `vault:unlocked` was broadcast
    // before this window was listening, so without asking at startup it would
    // stay sealed forever and prompt on the first credential read.
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    holder(await dek())

    const state = await initVaultSession(500)
    expect(state.unlocked).toBe(true)
    expect(state.enrolled).toBe(true)
    expect(isVaultUnlocked()).toBe(true)
  })

  test('the only window open stays sealed and says so', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    const state = await initVaultSession(50)
    expect(state.enrolled).toBe(true)
    expect(state.unlocked).toBe(false)
  })

  test('with no vault it does not ask anyone anything', async () => {
    const asked: Array<unknown> = []
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      if ((event.data as { type: string }).type === 'vault:key-request') {
        asked.push(event.data)
      }
    }

    const state = await initVaultSession(50)
    await tick(40)
    expect(state.enrolled).toBe(false)
    expect(asked).toHaveLength(0)
  })

  test('an already-unlocked window skips the handshake', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    setDek(await dek(), { broadcast: false })
    const asked: Array<unknown> = []
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      if ((event.data as { type: string }).type === 'vault:key-request') {
        asked.push(event.data)
      }
    }

    await initVaultSession(50)
    await tick(40)
    expect(asked).toHaveLength(0)
    expect(isVaultUnlocked()).toBe(true)
  })

  test('two concurrent calls share one handshake', async () => {
    storage.setItem(RECORD_KEY, JSON.stringify(record))
    const requests: Array<unknown> = []
    const key = await dek()
    const peer = sibling()
    peer.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; nonce?: string }
      if (message.type !== 'vault:key-request') return
      requests.push(message)
      peer.postMessage({
        type: 'vault:key-offer',
        nonce: message.nonce,
        key,
      })
    }

    await Promise.all([initVaultSession(500), initVaultSession(500)])
    await tick(40)
    expect(requests).toHaveLength(1)
    expect(isVaultUnlocked()).toBe(true)
  })
})
