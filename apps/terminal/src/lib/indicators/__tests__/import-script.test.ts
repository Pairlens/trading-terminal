// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_IMPORT_NAME,
  IMPORT_LIMITS,
  IndicatorImportError,
  dedupeScriptName,
  extractEmbeddedDescriptors,
  forkFromDescriptor,
  importFromPython,
  importFromZip,
  looksLikeIndicatorSource,
  scriptNameFromFileName,
} from '../import-script'

import type { CustomIndicatorDescriptor } from '@pairlens/shared/plugin-types'
import type { ImportErrorCode } from '../import-script'
import { buildIndicatorPluginPackage } from '@/components/indicators/export-plugin'

const META = {
  id: 'rsi',
  title: 'RSI',
  pane: 'separate' as const,
  inputs: [
    { kind: 'int' as const, key: 'length', default: 14, min: 2, max: 200 },
  ],
  series: [{ key: 'rsi', title: 'RSI', style: 'line' as const, width: 2 }],
}

const SOURCE =
  'meta = indicator(title="RSI")\n\ndef compute(ctx):\n    return {}\n'

const MODULES = [
  { path: 'stats.py', source: 'def mean(xs):\n    return sum(xs)\n' },
  { path: 'signals/ema.py', source: 'def ema(xs):\n    return xs\n' },
]

const strToU8 = (text: string) => new TextEncoder().encode(text)

// A minimal STORE-only zip writer. fflate lives in packages/shared and is not
// resolvable from apps/terminal, and hand-writing the archive is the point
// anyway: these tests need entry names (`../escape.py`, `/abs/path.py`) that a
// well-behaved zip library refuses to produce.
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = -1
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** Build a zip out of plain `path → text` pairs. */
function zipOf(files: Record<string, string>): Uint8Array {
  const entries = Object.entries(files).map(([path, text]) => ({
    name: strToU8(path),
    data: strToU8(text),
  }))
  const localSize = entries.reduce(
    (n, e) => n + 30 + e.name.length + e.data.length,
    0,
  )
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  const offsets: Array<number> = []

  let at = 0
  for (const entry of entries) {
    offsets.push(at)
    view.setUint32(at, 0x04034b50, true)
    view.setUint16(at + 4, 20, true) // version needed
    view.setUint16(at + 8, 0, true) // method: stored
    view.setUint32(at + 14, crc32(entry.data), true)
    view.setUint32(at + 18, entry.data.length, true)
    view.setUint32(at + 22, entry.data.length, true)
    view.setUint16(at + 26, entry.name.length, true)
    out.set(entry.name, at + 30)
    out.set(entry.data, at + 30 + entry.name.length)
    at += 30 + entry.name.length + entry.data.length
  }

  const centralStart = at
  entries.forEach((entry, i) => {
    view.setUint32(at, 0x02014b50, true)
    view.setUint16(at + 4, 20, true) // version made by
    view.setUint16(at + 6, 20, true) // version needed
    view.setUint16(at + 10, 0, true) // method: stored
    view.setUint32(at + 16, crc32(entry.data), true)
    view.setUint32(at + 20, entry.data.length, true)
    view.setUint32(at + 24, entry.data.length, true)
    view.setUint16(at + 28, entry.name.length, true)
    view.setUint32(at + 42, offsets[i], true)
    out.set(entry.name, at + 46)
    at += 46 + entry.name.length
  })

  view.setUint32(at, 0x06054b50, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, centralSize, true)
  view.setUint32(at + 16, centralStart, true)
  return out
}

/** Assert an import rejects, and with which code. Returns the message. */
async function expectRejection(
  run: () => unknown | Promise<unknown>,
  code: ImportErrorCode,
): Promise<string> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(IndicatorImportError)
    const err = error as IndicatorImportError
    expect(err.code).toBe(code)
    // "useful message": never empty, never a bare code.
    expect(err.message.length).toBeGreaterThan(10)
    return err.message
  }
  throw new Error(`expected the import to be rejected with code "${code}"`)
}

// ── Round trip against the real exporter ────────────────────────────

describe('importFromZip — plugin package round trip', () => {
  test('a zip built by export-plugin.ts imports back byte-identically', async () => {
    const exported = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
      modules: MODULES,
    })
    expect(exported.ok).toBe(true)
    if (!exported.ok) return

    const imported = await importFromZip(exported.fileName, exported.bytes)
    expect(imported.source).toBe(SOURCE)
    expect(imported.modules).toEqual(MODULES)
    // meta.title wins over the manifest name — it is what the chart shows.
    expect(imported.name).toBe('RSI')
  })

  test('a single-file export round trips with no modules', async () => {
    const exported = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
    })
    if (!exported.ok) throw new Error('export failed')

    const imported = await importFromZip('my-rsi.zip', exported.bytes)
    expect(imported.modules).toEqual([])
    expect(imported.source).toBe(SOURCE)
  })

  test('extractEmbeddedDescriptors never evaluates the module', () => {
    const exported = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
      modules: MODULES,
    })
    if (!exported.ok) throw new Error('export failed')

    const descriptors = extractEmbeddedDescriptors(exported.moduleText)
    expect(descriptors).toHaveLength(1)
    expect(descriptors?.[0].source).toBe(SOURCE)
    expect(descriptors?.[0].modules).toEqual(MODULES)
  })

  test('a hand-written plugin module yields no importable indicator', async () => {
    const exported = buildIndicatorPluginPackage({
      id: 'my-rsi',
      name: 'My RSI',
      meta: META,
      source: SOURCE,
    })
    if (!exported.ok) throw new Error('export failed')

    const bytes = zipOf({
      'manifest.json': JSON.stringify(exported.manifest),
      'module.js':
        'export const manifest = {}\nexport function createPlugin() { return {} }\n',
    })
    const message = await expectRejection(
      () => importFromZip('opaque.zip', bytes),
      'noIndicators',
    )
    expect(message).toContain('Plugins page')
  })
})

// ── Plain .py bundles ───────────────────────────────────────────────

describe('importFromZip — folders of .py files', () => {
  test('imports main.py plus helpers', async () => {
    const bytes = zipOf({
      'main.py': SOURCE,
      'stats.py': MODULES[0].source,
      'signals/ema.py': MODULES[1].source,
    })
    const imported = await importFromZip('my-rsi.zip', bytes)
    expect(imported.name).toBe('my-rsi')
    expect(imported.source).toBe(SOURCE)
    expect(imported.modules.map((m) => m.path).sort()).toEqual([
      'signals/ema.py',
      'stats.py',
    ])
  })

  test('strips a wrapper folder', async () => {
    const bytes = zipOf({
      'my_rsi/main.py': SOURCE,
      'my_rsi/stats.py': MODULES[0].source,
    })
    const imported = await importFromZip('my_rsi.zip', bytes)
    expect(imported.modules).toEqual([
      { path: 'stats.py', source: MODULES[0].source },
    ])
  })

  test('a lone .py file becomes the entry, whatever it was called', async () => {
    const imported = await importFromZip(
      'bundle.zip',
      zipOf({ 'rsi.py': SOURCE }),
    )
    expect(imported.source).toBe(SOURCE)
    expect(imported.name).toBe('rsi')
    expect(imported.modules).toEqual([])
  })

  test('picks the only root file that defines compute()', async () => {
    const bytes = zipOf({
      'my_rsi.py': SOURCE,
      'stats.py': MODULES[0].source,
    })
    const imported = await importFromZip('bundle.zip', bytes)
    expect(imported.source).toBe(SOURCE)
    expect(imported.modules).toEqual([
      { path: 'stats.py', source: MODULES[0].source },
    ])
  })

  test('ignores archive litter instead of choking on it', async () => {
    const bytes = zipOf({
      'main.py': SOURCE,
      '.DS_Store': 'junk',
      '__MACOSX/._main.py': 'junk',
    })
    const imported = await importFromZip('mac.zip', bytes)
    expect(imported.modules).toEqual([])
  })

  test('rejects a zip whose entry cannot be identified', async () => {
    const bytes = zipOf({
      'alpha.py': 'x = 1\n',
      'beta.py': 'y = 2\n',
    })
    const message = await expectRejection(
      () => importFromZip('bundle.zip', bytes),
      'noEntry',
    )
    expect(message).toContain('main.py')
  })
})

// ── Adversarial input ───────────────────────────────────────────────

describe('importFromZip — hostile archives', () => {
  test('rejects a path that escapes the script root', async () => {
    const bytes = zipOf({ 'main.py': SOURCE, '../escape.py': 'x = 1\n' })
    const message = await expectRejection(
      () => importFromZip('evil.zip', bytes),
      'invalidPath',
    )
    expect(message).toContain('../escape.py')
  })

  test('rejects an absolute path', async () => {
    const bytes = zipOf({ 'main.py': SOURCE, '/abs/path.py': 'x = 1\n' })
    const message = await expectRejection(
      () => importFromZip('evil.zip', bytes),
      'invalidPath',
    )
    expect(message).toContain('/abs/path.py')
  })

  test('rejects a non-.py file', async () => {
    const bytes = zipOf({ 'main.py': SOURCE, 'evil.py.txt': 'x = 1\n' })
    const message = await expectRejection(
      () => importFromZip('evil.zip', bytes),
      'invalidPath',
    )
    expect(message).toContain('evil.py.txt')
  })

  test('rejects a path deeper than the store allows', async () => {
    const bytes = zipOf({ 'main.py': SOURCE, 'a/b/c/d/e.py': 'x = 1\n' })
    await expectRejection(() => importFromZip('deep.zip', bytes), 'invalidPath')
  })

  test('rejects a 40-module zip', async () => {
    const files: Record<string, string> = { 'main.py': SOURCE }
    for (let i = 0; i < 40; i += 1) files[`mod_${i}.py`] = `x = ${i}\n`
    await expectRejection(
      () => importFromZip('many.zip', zipOf(files)),
      'tooManyFiles',
    )
  })

  test('rejects an oversized entry', async () => {
    const huge = `# ${'x'.repeat(IMPORT_LIMITS.maxTotalBytes + 1024)}\n`
    await expectRejection(
      () => importFromZip('huge.zip', zipOf({ 'main.py': huge })),
      'tooLarge',
    )
  })

  test('rejects an oversized archive before unzipping it', async () => {
    const bytes = new Uint8Array(IMPORT_LIMITS.maxZipBytes + 1)
    await expectRejection(() => importFromZip('huge.zip', bytes), 'tooLarge')
  })

  test('rejects something that is not a zip at all', async () => {
    await expectRejection(
      () => importFromZip('nope.zip', strToU8('definitely not a zip')),
      'badZip',
    )
  })

  test('rejects empty input', async () => {
    await expectRejection(
      () => importFromZip('nothing.zip', new Uint8Array(0)),
      'empty',
    )
  })

  test('rejects binary content dressed up as a module', async () => {
    const bytes = zipOf({ 'main.py': SOURCE, 'blob.py': 'a\0b' })
    await expectRejection(() => importFromZip('blob.zip', bytes), 'binary')
  })

  test('rejects a plugin package missing module.js', async () => {
    const bytes = zipOf({ 'manifest.json': '{}' })
    await expectRejection(() => importFromZip('half.zip', bytes), 'badZip')
  })

  test('rejects a plugin package whose manifest fails validation', async () => {
    const bytes = zipOf({
      'manifest.json': '{"id":"Not A Slug"}',
      'module.js': 'const descriptors = []\n',
    })
    await expectRejection(() => importFromZip('bad.zip', bytes), 'badZip')
  })

  test('imports nothing when any file is rejected', async () => {
    // The whole point of failing loudly: a rejected archive must not leave a
    // partial script behind. Nothing here writes to the store, so the check is
    // that the call throws rather than returning a truncated result.
    const bytes = zipOf({ 'main.py': SOURCE, '../escape.py': 'x = 1\n' })
    const result = await importFromZip('evil.zip', bytes).catch(() => null)
    expect(result).toBeNull()
  })
})

// ── Single files and pastes ─────────────────────────────────────────

describe('importFromPython', () => {
  test('names the script after the file', () => {
    const imported = importFromPython('My RSI.py', SOURCE)
    expect(imported.name).toBe('My RSI')
    expect(imported.source).toBe(SOURCE)
    expect(imported.modules).toEqual([])
  })

  test('strips directories from the file name', () => {
    expect(importFromPython('a/b/rsi.py', SOURCE).name).toBe('rsi')
  })

  test('falls back to a default when nothing is derivable', () => {
    expect(importFromPython('  ', SOURCE).name).toBe(DEFAULT_IMPORT_NAME)
  })

  test('rejects an empty paste', async () => {
    await expectRejection(() => importFromPython('rsi.py', '   \n'), 'empty')
  })

  test('rejects binary content', async () => {
    await expectRejection(() => importFromPython('rsi.py', 'a\0b'), 'binary')
  })

  test('rejects an oversized paste', async () => {
    const huge = 'x'.repeat(IMPORT_LIMITS.maxTotalBytes + 1)
    await expectRejection(() => importFromPython('rsi.py', huge), 'tooLarge')
  })
})

// ── Forking installed indicators ────────────────────────────────────

describe('forkFromDescriptor', () => {
  const descriptor: CustomIndicatorDescriptor = {
    meta: META,
    language: 'python',
    source: SOURCE,
    modules: MODULES,
  }

  test('copies source and modules verbatim', () => {
    const forked = forkFromDescriptor(descriptor)
    expect(forked.name).toBe('RSI')
    expect(forked.source).toBe(SOURCE)
    expect(forked.modules).toEqual(MODULES)
  })

  test('falls back to the meta id when there is no title', () => {
    const forked = forkFromDescriptor({
      ...descriptor,
      meta: { ...META, title: '' },
      modules: undefined,
    })
    expect(forked.name).toBe('rsi')
    expect(forked.modules).toEqual([])
  })

  test('rejects a non-Python descriptor', async () => {
    await expectRejection(
      () =>
        forkFromDescriptor({
          ...descriptor,
          language: 'javascript',
        } as unknown as CustomIndicatorDescriptor),
      'unsupportedLanguage',
    )
  })

  test('rejects a descriptor with no source', async () => {
    await expectRejection(
      () =>
        forkFromDescriptor({
          ...descriptor,
          source: undefined,
        } as unknown as CustomIndicatorDescriptor),
      'malformedDescriptor',
    )
  })

  test('rejects malformed modules', async () => {
    for (const modules of [
      'not-an-array',
      [null],
      [{ path: 'ok.py' }],
      [{ source: 'x = 1' }],
      [{ path: 42, source: 'x = 1' }],
    ]) {
      await expectRejection(
        () =>
          forkFromDescriptor({
            ...descriptor,
            modules,
          } as unknown as CustomIndicatorDescriptor),
        'malformedDescriptor',
      )
    }
  })

  test('rejects a module whose path escapes the script root', async () => {
    await expectRejection(
      () =>
        forkFromDescriptor({
          ...descriptor,
          modules: [{ path: '../evil.py', source: 'x = 1' }],
        }),
      'invalidPath',
    )
  })

  test('rejects a duplicate module path', async () => {
    await expectRejection(
      () =>
        forkFromDescriptor({
          ...descriptor,
          modules: [
            { path: 'stats.py', source: 'x = 1' },
            { path: 'stats.py', source: 'x = 2' },
          ],
        }),
      'duplicatePath',
    )
  })

  test('rejects a helper that would shadow the entry file', async () => {
    await expectRejection(
      () =>
        forkFromDescriptor({
          ...descriptor,
          modules: [{ path: 'main.py', source: 'x = 1' }],
        }),
      'duplicatePath',
    )
  })

  test('rejects a descriptor with more modules than the store allows', async () => {
    const modules = Array.from({ length: IMPORT_LIMITS.maxFiles }, (_, i) => ({
      path: `mod_${i}.py`,
      source: `x = ${i}\n`,
    }))
    await expectRejection(
      () => forkFromDescriptor({ ...descriptor, modules }),
      'tooManyFiles',
    )
  })
})

// ── Naming helpers ──────────────────────────────────────────────────

describe('naming', () => {
  test('scriptNameFromFileName strips paths and known suffixes', () => {
    expect(scriptNameFromFileName('a/b/My RSI.py')).toBe('My RSI')
    expect(scriptNameFromFileName('my-rsi.zip')).toBe('my-rsi')
    expect(scriptNameFromFileName('C:\\scripts\\rsi.PY')).toBe('rsi')
    expect(scriptNameFromFileName('   ')).toBe('')
  })

  test('dedupeScriptName never collides silently', () => {
    expect(dedupeScriptName('RSI', [])).toBe('RSI')
    expect(dedupeScriptName('RSI', ['RSI'])).toBe('RSI 2')
    expect(dedupeScriptName('RSI', ['RSI', 'RSI 2'])).toBe('RSI 3')
    expect(dedupeScriptName('  ', ['Imported indicator'])).toBe(
      `${DEFAULT_IMPORT_NAME} 2`,
    )
  })

  test('looksLikeIndicatorSource is a soft signal, not a gate', () => {
    expect(looksLikeIndicatorSource(SOURCE)).toBe(true)
    expect(looksLikeIndicatorSource('print("hello")')).toBe(false)
    expect(
      looksLikeIndicatorSource('meta = strategy()\ndef compute(ctx): pass'),
    ).toBe(true)
  })
})
