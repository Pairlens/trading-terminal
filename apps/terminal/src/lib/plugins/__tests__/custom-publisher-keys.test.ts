// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  generatePublisherKeypair,
  signPluginArtifact,
  verifyPluginSignature,
} from '@pairlens/shared/plugin-signing'
import { OFFICIAL_PUBLISHER_KEYS } from '@pairlens/shared/publisher-keys'

import {
  CUSTOM_PUBLISHER_KEYS_STORAGE_KEY,
  getCustomPublisherKeys,
  publisherKeyFingerprint,
  validatePublisherKeyId,
  validatePublisherPublicKey,
} from '../custom-publisher-keys'
import { getPinnedPublisherKeys } from '../pinned-publisher-keys'

// Minimal browser-globals stub so the SSR guards pass under bun test.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

function seed(entries: unknown): void {
  store.set(CUSTOM_PUBLISHER_KEYS_STORAGE_KEY, JSON.stringify(entries))
}

describe('validatePublisherKeyId', () => {
  test('accepts kebab-case ids', () => {
    expect(validatePublisherKeyId('acme-plugins-2026')).toBe('ok')
  })

  test('rejects malformed ids', () => {
    for (const bad of ['', 'A', 'Has Spaces', 'UPPER', '-leading', 'x']) {
      expect(validatePublisherKeyId(bad)).toBe('invalid-format')
    }
  })

  test('rejects built-in ids', () => {
    expect(validatePublisherKeyId('pairlens-dev')).toBe('reserved')
    for (const official of Object.keys(OFFICIAL_PUBLISHER_KEYS)) {
      expect(validatePublisherKeyId(official)).toBe('reserved')
    }
  })
})

describe('validatePublisherPublicKey', () => {
  test('accepts a freshly generated Ed25519 public key', async () => {
    const kp = await generatePublisherKeypair()
    expect(await validatePublisherPublicKey(kp.publicKeyB64)).toBe(true)
  })

  test('rejects garbage, wrong lengths, and non-base64', async () => {
    expect(await validatePublisherPublicKey('not-base64!!!')).toBe(false)
    expect(await validatePublisherPublicKey(btoa('short'))).toBe(false)
    expect(await validatePublisherPublicKey('')).toBe(false)
  })
})

describe('publisherKeyFingerprint', () => {
  test('is stable and grouped', async () => {
    const kp = await generatePublisherKeypair()
    const fp = await publisherKeyFingerprint(kp.publicKeyB64)
    expect(fp).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/)
    expect(await publisherKeyFingerprint(kp.publicKeyB64)).toBe(fp)
  })
})

describe('getCustomPublisherKeys', () => {
  test('returns [] when unset or malformed', () => {
    expect(getCustomPublisherKeys()).toEqual([])
    store.set(CUSTOM_PUBLISHER_KEYS_STORAGE_KEY, '{not json')
    expect(getCustomPublisherKeys()).toEqual([])
    seed({ id: 'not-an-array' })
    expect(getCustomPublisherKeys()).toEqual([])
  })

  test('filters malformed entries', () => {
    seed([
      { id: 'good', publicKey: 'abc', addedAt: 'now' },
      { id: 42, publicKey: 'abc' },
      null,
      'string',
    ])
    expect(getCustomPublisherKeys().map((k) => k.id)).toEqual(['good'])
  })
})

describe('getPinnedPublisherKeys merge', () => {
  test('includes custom keys without letting them shadow built-ins', () => {
    const officialId = Object.keys(OFFICIAL_PUBLISHER_KEYS)[0]
    seed([
      { id: 'acme-plugins-2026', publicKey: 'customKey', addedAt: 'now' },
      { id: officialId, publicKey: 'EVIL-OVERRIDE', addedAt: 'now' },
    ])
    const keys = getPinnedPublisherKeys()
    expect(keys['acme-plugins-2026']).toBe('customKey')
    expect(keys[officialId]).toBe(OFFICIAL_PUBLISHER_KEYS[officialId])
  })

  test('a runtime-trusted key verifies a matching signature end-to-end', async () => {
    const kp = await generatePublisherKeypair()
    seed([
      { id: 'acme-plugins-2026', publicKey: kp.publicKeyB64, addedAt: 'now' },
    ])
    const input = {
      pluginId: 'acme-tool',
      version: '1.0.0',
      moduleText: 'export default {}',
    }
    const sig = await signPluginArtifact(
      input,
      kp.privateKeyPkcs8B64,
      'acme-plugins-2026',
    )
    const pinned = getPinnedPublisherKeys()[sig.publisherKeyId]
    expect(pinned).toBe(kp.publicKeyB64)
    expect(await verifyPluginSignature(input, sig.signature, pinned)).toBe(true)
  })
})
