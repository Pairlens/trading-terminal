// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { looksLikeZip, packPlugin, unpackPlugin } from '../plugin-package'
import type { PluginManifest } from '../plugin-types'

const MANIFEST: PluginManifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.2.3',
  author: 'Me',
  description: 'Demo plugin',
  capabilities: [],
  config: {},
}

const MODULE = 'export const manifest = {}; export function createPlugin(){}'

describe('plugin-package', () => {
  it('round-trips a package (manifest + module + styles)', () => {
    const bytes = packPlugin({
      manifest: MANIFEST,
      moduleText: MODULE,
      styleText: '.x{color:red}',
    })
    expect(looksLikeZip(bytes)).toBe(true)

    const out = unpackPlugin(bytes)
    expect(out.manifest.id).toBe('demo')
    expect(out.manifest.version).toBe('1.2.3')
    expect(out.moduleText).toBe(MODULE)
    expect(out.styleText).toBe('.x{color:red}')
  })

  it('round-trips without styles', () => {
    const bytes = packPlugin({ manifest: MANIFEST, moduleText: MODULE })
    const out = unpackPlugin(bytes)
    expect(out.styleText).toBeUndefined()
  })

  it('throws on non-zip bytes', () => {
    expect(() => unpackPlugin(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })

  it('throws when the manifest is invalid', () => {
    const bytes = packPlugin({
      // @ts-expect-error intentionally invalid manifest for the test
      manifest: { id: 'demo' },
      moduleText: MODULE,
    })
    expect(() => unpackPlugin(bytes)).toThrow(/Invalid plugin manifest/)
  })

  it('looksLikeZip is false for plain text', () => {
    expect(looksLikeZip(new TextEncoder().encode('hello world'))).toBe(false)
  })
})
