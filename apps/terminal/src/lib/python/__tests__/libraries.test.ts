// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  CURATED_LIBRARIES,
  KNOWN_IMPORT_DISTS,
  curatedImportSnippet,
  parseRuntimePackages,
} from '../libraries'

describe('parseRuntimePackages', () => {
  const lock = {
    packages: {
      pandas: {
        name: 'pandas',
        version: '3.0.2',
        imports: ['pandas'],
        package_type: 'package',
      },
      'pandas-tests': {
        name: 'pandas-tests',
        version: '3.0.2',
        imports: [],
        package_type: 'package',
      },
      openssl: {
        name: 'openssl',
        version: '3.0.0',
        imports: [],
        package_type: 'shared_library',
      },
      'scikit-learn': {
        name: 'scikit-learn',
        version: '1.8.0',
        imports: ['sklearn'],
        package_type: 'package',
      },
    },
  }

  it('keeps real packages, sorted by name', () => {
    const packages = parseRuntimePackages(lock)
    expect(packages.map((p) => p.name)).toEqual(['pandas', 'scikit-learn'])
  })

  it('carries the importable module names', () => {
    const packages = parseRuntimePackages(lock)
    const sklearn = packages.find((p) => p.name === 'scikit-learn')
    expect(sklearn?.imports).toEqual(['sklearn'])
    expect(sklearn?.version).toBe('1.8.0')
  })

  it('drops shared libraries and unvendored test companions', () => {
    const names = parseRuntimePackages(lock).map((p) => p.name)
    expect(names).not.toContain('openssl')
    expect(names).not.toContain('pandas-tests')
  })

  it('returns empty for malformed input', () => {
    expect(parseRuntimePackages(null)).toEqual([])
    expect(parseRuntimePackages('nope')).toEqual([])
    expect(parseRuntimePackages({})).toEqual([])
    expect(parseRuntimePackages({ packages: { x: 42 } })).toEqual([])
  })
})

describe('curated libraries', () => {
  it('every entry has a dist and a blurb', () => {
    for (const library of CURATED_LIBRARIES) {
      expect(library.dist.length).toBeGreaterThan(0)
      expect(library.blurb.length).toBeGreaterThan(0)
    }
  })

  it('numpy leads as the preloaded tier', () => {
    expect(CURATED_LIBRARIES[0]).toMatchObject({
      dist: 'numpy',
      source: 'preloaded',
    })
  })

  it('import snippets use the module name when it differs', () => {
    const sklearn = CURATED_LIBRARIES.find((l) => l.dist === 'scikit-learn')
    expect(sklearn && curatedImportSnippet(sklearn)).toBe('import sklearn')
    const pandas = CURATED_LIBRARIES.find((l) => l.dist === 'pandas')
    expect(pandas && curatedImportSnippet(pandas)).toBe('import pandas')
  })
})

describe('KNOWN_IMPORT_DISTS', () => {
  it('maps the famous import/dist mismatches', () => {
    expect(KNOWN_IMPORT_DISTS['sklearn']).toBe('scikit-learn')
    expect(KNOWN_IMPORT_DISTS['dotenv']).toBe('python-dotenv')
    expect(KNOWN_IMPORT_DISTS['yaml']).toBe('pyyaml')
  })

  it('never maps a name onto itself', () => {
    for (const [module, dist] of Object.entries(KNOWN_IMPORT_DISTS)) {
      expect(module).not.toBe(dist)
    }
  })
})
