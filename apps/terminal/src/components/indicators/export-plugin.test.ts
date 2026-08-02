// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { unpackPlugin } from '@pairlens/shared/plugin-package'

import {
  buildIndicatorPluginPackage,
  isValidPluginId,
  slugifyPluginId,
} from './export-plugin'

import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'

const META: CustomIndicatorMeta = {
  id: 'rsi',
  title: 'RSI',
  pane: 'separate',
  inputs: [{ kind: 'int', key: 'length', default: 14, min: 2, max: 200 }],
  series: [{ key: 'rsi', title: 'RSI', style: 'line', width: 2 }],
  hlines: [{ value: 70 }, { value: 30 }],
  packages: ['numpy'],
  minBars: 15,
}

const SOURCE =
  'meta = indicator(title="RSI")\n\ndef compute(ctx):\n    return {}\n'

describe('slugifyPluginId', () => {
  test('slugifies free-form names', () => {
    expect(slugifyPluginId('My RSI Indicator!')).toBe('my-rsi-indicator')
    expect(slugifyPluginId('  Ondas de Elliott  ')).toBe('ondas-de-elliott')
    expect(slugifyPluginId('RSI')).toBe('rsi')
  })

  test('always yields a manifest-valid id', () => {
    for (const name of ['R', '™', '', '--a--', 'ñandú', 'a'.repeat(200)]) {
      expect(isValidPluginId(slugifyPluginId(name))).toBe(true)
    }
  })
})

describe('buildIndicatorPluginPackage', () => {
  test('rejects invalid plugin ids with readable errors', () => {
    const result = buildIndicatorPluginPackage({
      id: 'Not A Slug',
      name: 'RSI',
      meta: META,
      source: SOURCE,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('"id"')
    }
  })

  test('produces a zip that unpacks with a valid manifest', () => {
    const result = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.fileName).toBe('my-rsi.zip')

    // unpackPlugin re-runs validateManifest — a throw here means the export
    // would be rejected by the Plugins → Import flow.
    const unpacked = unpackPlugin(result.bytes)
    expect(unpacked.manifest.id).toBe('my-rsi')
    expect(unpacked.manifest.capabilities).toEqual([
      {
        id: 'chart:indicator',
        singleton: false,
        markets: ['*'],
        priority: 50,
        streaming: false,
      },
    ])
    expect(unpacked.moduleText).toBe(result.moduleText)
  })

  test('generated module is self-contained ESM exposing the descriptors', async () => {
    const result = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Sandbox contract: no imports of any kind.
    expect(result.moduleText).not.toMatch(/^\s*import\s/m)

    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'pairlens-plugin-export-'))
    const modulePath = join(dir, 'module.mjs')
    await writeFile(modulePath, result.moduleText, 'utf-8')
    const mod = (await import(modulePath)) as {
      manifest: { id: string }
      createPlugin: (manifest: unknown) => {
        manifest: unknown
        status: string
        execute: (params: { capability: string }) => Promise<unknown>
      }
    }

    expect(mod.manifest.id).toBe('my-rsi')
    const plugin = mod.createPlugin(mod.manifest)
    expect(plugin.status).toBe('installed')

    const descriptors = (await plugin.execute({
      capability: 'chart:indicator',
    })) as Array<{
      meta: CustomIndicatorMeta
      language: string
      source: string
    }>
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0].language).toBe('python')
    expect(descriptors[0].source).toBe(SOURCE)
    expect(descriptors[0].meta.title).toBe('RSI')
    expect(descriptors[0].meta.hlines).toHaveLength(2)

    await expect(
      plugin.execute({ capability: 'trading:orders' }),
    ).rejects.toThrow(/unsupported capability/)
  })

  test('packages a multi-file indicator with its helper modules', async () => {
    const modules = [
      { path: 'stats.py', source: 'def mean(xs):\n    return sum(xs)\n' },
      { path: 'signals/ema.py', source: 'def ema(xs):\n    return xs\n' },
    ]
    const result = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
      modules,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'pairlens-plugin-export-multi-'))
    const modulePath = join(dir, 'module.mjs')
    await writeFile(modulePath, result.moduleText, 'utf-8')
    const mod = (await import(modulePath)) as {
      manifest: unknown
      createPlugin: (manifest: unknown) => {
        execute: (params: { capability: string }) => Promise<unknown>
      }
    }

    const descriptors = (await mod
      .createPlugin(mod.manifest)
      .execute({ capability: 'chart:indicator' })) as Array<{
      source: string
      modules?: Array<{ path: string; source: string }>
    }>
    expect(descriptors[0].source).toBe(SOURCE)
    expect(descriptors[0].modules).toEqual(modules)
  })

  test('omits the modules field entirely for single-file indicators', () => {
    const result = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
      modules: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.moduleText).not.toContain('"modules"')
  })
})
