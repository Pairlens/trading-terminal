// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { validateManifest } from '../plugin-manifest-schema'

const VALID = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '0.1.0',
  author: 'Me',
  description: 'Does things',
  capabilities: [
    {
      id: 'market-data:candles',
      singleton: false,
      markets: ['okx'],
      priority: 10,
      streaming: true,
    },
  ],
  config: {},
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    const r = validateManifest(VALID)
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.manifest.id).toBe('my-plugin')
  })

  it('accepts an empty capabilities array + empty config', () => {
    const r = validateManifest({ ...VALID, capabilities: [] })
    expect(r.valid).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateManifest('nope').valid).toBe(false)
    expect(validateManifest(null).valid).toBe(false)
  })

  it('rejects missing required fields', () => {
    const r = validateManifest({ name: 'x' })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"id"'))).toBe(true)
  })

  it('rejects a bad id format', () => {
    const r = validateManifest({ ...VALID, id: 'Bad ID!' })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"id"'))).toBe(true)
  })

  it('rejects an unknown capability id', () => {
    const r = validateManifest({
      ...VALID,
      capabilities: [
        {
          id: 'made-up:thing',
          singleton: false,
          markets: [],
          priority: 1,
          streaming: false,
        },
      ],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('not a known capability'))).toBe(
      true,
    )
  })

  it('rejects capability with wrong field types', () => {
    const r = validateManifest({
      ...VALID,
      capabilities: [
        {
          id: 'ai:inference',
          singleton: 'yes',
          markets: 'okx',
          priority: 'high',
          streaming: 1,
        },
      ],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects a malformed config field', () => {
    const r = validateManifest({
      ...VALID,
      config: { apiKey: { type: 'wizard', label: 'Key' } },
    })
    expect(r.valid).toBe(false)
  })

  it('requires config (suggests {})', () => {
    const { config: _drop, ...noConfig } = VALID
    const r = validateManifest(noConfig)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('"config"'))).toBe(true)
  })

  // ── network allowlist + permissions (sandbox enforcement) ──────────

  it('accepts a valid network.hosts allowlist', () => {
    const r = validateManifest({
      ...VALID,
      network: { hosts: ['api.okx.com', '*.okx.com', 'ws-auth.kraken.com'] },
    })
    expect(r.valid).toBe(true)
  })

  it('rejects network hosts with scheme, port, or path', () => {
    for (const host of [
      'https://api.okx.com',
      'api.okx.com:443',
      'api.okx.com/v5',
      '*.*.okx.com',
      'evil com',
    ]) {
      const r = validateManifest({ ...VALID, network: { hosts: [host] } })
      expect(r.valid).toBe(false)
    }
  })

  it('rejects a network declaration that is not { hosts: [] }', () => {
    expect(
      validateManifest({ ...VALID, network: { hosts: 'okx' } }).valid,
    ).toBe(false)
    expect(validateManifest({ ...VALID, network: [] }).valid).toBe(false)
  })

  it('accepts known permissions and rejects unknown ones', () => {
    expect(
      validateManifest({ ...VALID, permissions: ['network', 'credentials'] })
        .valid,
    ).toBe(true)
    expect(
      validateManifest({ ...VALID, permissions: ['network', 'root'] }).valid,
    ).toBe(false)
  })

  // ── Localized manifest text ───────────────────────────────────────
  //
  // A plugin author cannot add a key to the terminal's catalog, so their name
  // and description carry their own translations. The strictness here is the
  // point: an unknown locale never matches anything and never renders, which
  // looks exactly like "no translation provided".

  it('accepts a bare string — the author wrote one language', () => {
    expect(
      validateManifest({ ...VALID, description: 'Does things' }).valid,
    ).toBe(true)
  })

  it('accepts a locale map on description and title', () => {
    const r = validateManifest({
      ...VALID,
      title: { en: 'My Plugin', de: 'Mein Plugin' },
      description: {
        en: 'Does things',
        de: 'Macht Sachen',
        ja: '色々やります',
      },
    })
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
  })

  it('rejects a locale the terminal has no catalog for', () => {
    // 'pr' is a well-formed tag and a plausible typo for 'pt'.
    const r = validateManifest({
      ...VALID,
      description: { en: 'Does things', pr: 'Faz coisas' },
    })
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toContain('"pr"')
  })

  it('rejects an empty locale map and empty values', () => {
    expect(validateManifest({ ...VALID, description: {} }).valid).toBe(false)
    expect(validateManifest({ ...VALID, description: { en: '' } }).valid).toBe(
      false,
    )
  })

  it('caps a single string so a manifest cannot carry a README', () => {
    expect(
      validateManifest({ ...VALID, description: 'x'.repeat(501) }).valid,
    ).toBe(false)
    expect(
      validateManifest({
        ...VALID,
        description: { en: 'ok', de: 'x'.repeat(501) },
      }).valid,
    ).toBe(false)
  })

  it('validates config field labels the same way', () => {
    expect(
      validateManifest({
        ...VALID,
        config: { key: { type: 'string', label: { en: 'API key' } } },
      }).valid,
    ).toBe(true)
    expect(
      validateManifest({
        ...VALID,
        config: { key: { type: 'string', label: { xx: 'API key' } } },
      }).valid,
    ).toBe(false)
  })
})

describe('contributes.workspaces', () => {
  const LAYOUT = {
    version: 1,
    columns: [
      {
        id: 'c0',
        widthPercent: 100,
        cells: [
          { id: 'e0', heightPercent: 100, panes: [{ id: 'p0', type: 'chart' }] },
        ],
      },
    ],
  }
  const WORKSPACE = {
    id: 'template:mine',
    name: 'Mine',
    tagline: 'A layout.',
    description: 'A layout, at length.',
    icon: 'Layers',
    facets: { traderTypes: [], assetClasses: [], screenSizes: [] },
    layout: LAYOUT,
  }
  const withWorkspaces = (workspaces: unknown) => ({
    ...VALID,
    contributes: { workspaces },
  })

  it('accepts a well-formed contribution', () => {
    expect(validateManifest(withWorkspaces([WORKSPACE])).valid).toBe(true)
  })

  it('leaves manifests that declare no workspaces alone', () => {
    expect(validateManifest({ ...VALID, contributes: {} }).valid).toBe(true)
    expect(
      validateManifest({
        ...VALID,
        contributes: { panels: [{ id: 'p', label: 'P', icon: 'X', category: 'trading' }] },
      }).valid,
    ).toBe(true)
  })

  it('requires an id, a name and a layout', () => {
    for (const key of ['id', 'name', 'layout'] as const) {
      const broken = { ...WORKSPACE }
      delete (broken as Record<string, unknown>)[key]
      expect(validateManifest(withWorkspaces([broken])).valid, key).toBe(false)
    }
  })

  it('rejects a duplicate id within one manifest', () => {
    expect(validateManifest(withWorkspaces([WORKSPACE, WORKSPACE])).valid).toBe(
      false,
    )
  })

  it('rejects layouts that could never render', () => {
    const cases = [
      { version: 1, columns: [] },
      { version: 1, columns: [{ id: 'c', widthPercent: 100, cells: [] }] },
      {
        version: 1,
        columns: [
          {
            id: 'c',
            widthPercent: 100,
            cells: [{ id: 'e', heightPercent: 100, panes: [] }],
          },
        ],
      },
      {
        version: 1,
        columns: [
          {
            id: 'c',
            widthPercent: 100,
            cells: [{ id: 'e', heightPercent: 100, panes: [{ id: 'p' }] }],
          },
        ],
      },
    ]
    for (const layout of cases) {
      expect(
        validateManifest(withWorkspaces([{ ...WORKSPACE, layout }])).valid,
      ).toBe(false)
    }
  })

  it('caps how much geometry one manifest can carry', () => {
    const wide = {
      version: 1,
      columns: Array.from({ length: 17 }, (_, i) => ({
        id: `c${i}`,
        widthPercent: 6,
        cells: [
          { id: `e${i}`, heightPercent: 100, panes: [{ id: `p${i}`, type: 'chart' }] },
        ],
      })),
    }
    expect(
      validateManifest(withWorkspaces([{ ...WORKSPACE, layout: wide }])).valid,
    ).toBe(false)
    expect(
      validateManifest(
        withWorkspaces(
          Array.from({ length: 25 }, (_, i) => ({ ...WORKSPACE, id: `t${i}` })),
        ),
      ).valid,
    ).toBe(false)
  })

  it('rejects a non-array', () => {
    expect(validateManifest(withWorkspaces({})).valid).toBe(false)
  })
})
