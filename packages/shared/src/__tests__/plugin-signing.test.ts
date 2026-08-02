// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  buildSigningPayload,
  generatePublisherKeypair,
  sha256Hex,
  signPluginArtifact,
  verifyPluginSignature,
} from '../plugin-signing'
import { DEV_PUBLISHER_PUBLIC_KEY } from '../publisher-keys'

const MODULE =
  'export const manifest = { id: "x" }\nexport function createPlugin() {}\n'
const STYLE = '.x { color: red }'

const input = {
  pluginId: 'sample-plugin',
  version: '1.2.3',
  moduleText: MODULE,
  styleText: STYLE,
}

describe('plugin-signing', () => {
  test('payload binds id, version, and content hashes', async () => {
    const payload = await buildSigningPayload(input)
    const lines = payload.split('\n')
    expect(lines[0]).toBe('pairlens-plugin-v1')
    expect(lines[1]).toBe('sample-plugin')
    expect(lines[2]).toBe('1.2.3')
    expect(lines[3]).toBe(await sha256Hex(MODULE))
    expect(lines[4]).toBe(await sha256Hex(STYLE))
  })

  test('payload uses "-" when there is no stylesheet', async () => {
    const payload = await buildSigningPayload({ ...input, styleText: null })
    expect(payload.split('\n')[4]).toBe('-')
  })

  test('sign → verify roundtrip', async () => {
    const keys = await generatePublisherKeypair()
    const sig = await signPluginArtifact(
      input,
      keys.privateKeyPkcs8B64,
      'test-key',
    )
    expect(sig.publisherKeyId).toBe('test-key')
    expect(
      await verifyPluginSignature(input, sig.signature, keys.publicKeyB64),
    ).toBe(true)
  })

  test('rejects tampered module text', async () => {
    const keys = await generatePublisherKeypair()
    const sig = await signPluginArtifact(input, keys.privateKeyPkcs8B64, 'k')
    const tampered = {
      ...input,
      moduleText: MODULE + '\nfetch("https://evil")',
    }
    expect(
      await verifyPluginSignature(tampered, sig.signature, keys.publicKeyB64),
    ).toBe(false)
  })

  test('rejects version swap (downgrade protection)', async () => {
    const keys = await generatePublisherKeypair()
    const sig = await signPluginArtifact(input, keys.privateKeyPkcs8B64, 'k')
    expect(
      await verifyPluginSignature(
        { ...input, version: '0.0.1' },
        sig.signature,
        keys.publicKeyB64,
      ),
    ).toBe(false)
  })

  test('rejects signature from a different key', async () => {
    const a = await generatePublisherKeypair()
    const b = await generatePublisherKeypair()
    const sig = await signPluginArtifact(input, a.privateKeyPkcs8B64, 'a')
    expect(
      await verifyPluginSignature(input, sig.signature, b.publicKeyB64),
    ).toBe(false)
  })

  test('never throws on malformed inputs', async () => {
    expect(
      await verifyPluginSignature(
        input,
        'not-base64!!!',
        DEV_PUBLISHER_PUBLIC_KEY,
      ),
    ).toBe(false)
    expect(await verifyPluginSignature(input, '', 'garbage')).toBe(false)
  })
})
